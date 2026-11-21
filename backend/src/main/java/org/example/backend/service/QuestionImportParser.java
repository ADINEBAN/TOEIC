package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.example.backend.dto.request.CreateQuestionOptionRequest;
import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.QuestionSourceType;
import org.example.backend.exception.AppException;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses TOEIC questions from Excel (.xlsx, .xls), CSV/TSV, Word (.docx, .doc), PDF, and TXT.
 */
@Component
@RequiredArgsConstructor
public class QuestionImportParser {

    private static final int MAX_QUESTIONS = 300;
    private static final Pattern PART_NUMBER_PATTERN = Pattern.compile("(\\d{1,2})");
    private static final Pattern OPTION_PREFIX_PATTERN = Pattern.compile("^\\s*(?:\\([A-Da-d]\\)|[A-Da-d][.):])\\s*");

    private final DocumentTextExtractionService documentTextExtractionService;
    private final ToeicDocumentParserService toeicDocumentParserService;

    public List<CreateQuestionRequest> parse(String originalFilename, byte[] bytes, Integer defaultPartNo) {
        if (bytes == null || bytes.length == 0) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        int fallbackPart = normalizePartNo(defaultPartNo, 5);
        String lower = originalFilename == null ? "" : originalFilename.trim().toLowerCase(Locale.ROOT);
        List<CreateQuestionRequest> parsed;

        if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
            parsed = parseExcel(bytes, fallbackPart);
        } else if (lower.endsWith(".csv")) {
            parsed = parseDelimitedText(decodeText(bytes), ',', fallbackPart);
        } else if (lower.endsWith(".tsv")) {
            parsed = parseDelimitedText(decodeText(bytes), '\t', fallbackPart);
        } else if (lower.endsWith(".docx")) {
            List<CreateQuestionRequest> docxTableQuestions = tryParseDocxTables(bytes, fallbackPart);
            parsed = !docxTableQuestions.isEmpty()
                    ? docxTableQuestions
                    : parseViaDocumentEngine(originalFilename, bytes, fallbackPart);
        } else if (lower.endsWith(".doc") || lower.endsWith(".pdf") || lower.endsWith(".txt")) {
            parsed = parseViaDocumentEngine(originalFilename, bytes, fallbackPart);
        } else if (isZipArchive(bytes)) {
            List<CreateQuestionRequest> docxTables = tryParseDocxTables(bytes, fallbackPart);
            parsed = !docxTables.isEmpty()
                    ? docxTables
                    : parseViaDocumentEngine("upload.docx", bytes, fallbackPart);
        } else {
            parsed = parseViaDocumentEngine(originalFilename, bytes, fallbackPart);
        }

        if (parsed.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }
        return parsed.size() > MAX_QUESTIONS ? parsed.subList(0, MAX_QUESTIONS) : parsed;
    }

    private List<CreateQuestionRequest> parseViaDocumentEngine(
            String filename,
            byte[] bytes,
            int fallbackPart
    ) {
        DocumentTextExtractionService.DocumentExtractionResult extraction =
                documentTextExtractionService.extract(filename, bytes);
        ToeicDocumentParserService.ParsedDocumentResult docResult =
                toeicDocumentParserService.parse(extraction);

        Map<String, ToeicDocumentParserService.ParsedPassage> passageMap = new HashMap<>();
        if (docResult.passages() != null) {
            for (ToeicDocumentParserService.ParsedPassage p : docResult.passages()) {
                if (p.passageCode() != null) {
                    passageMap.put(p.passageCode(), p);
                }
            }
        }

        List<CreateQuestionRequest> result = new ArrayList<>();
        if (docResult.questions() == null) {
            return result;
        }

        for (ToeicDocumentParserService.ParsedQuestion pq : docResult.questions()) {
            if (pq.questionText() == null || pq.questionText().isBlank()
                    || pq.options() == null || pq.options().size() < 3) {
                continue;
            }

            Map<String, String> optTextByLabel = new HashMap<>();
            for (ToeicDocumentParserService.ParsedOption opt : pq.options()) {
                if (opt.optionLabel() != null && opt.optionText() != null && !opt.optionText().isBlank()) {
                    optTextByLabel.put(opt.optionLabel().trim().toUpperCase(Locale.ROOT), opt.optionText().trim());
                }
            }
            if (!optTextByLabel.containsKey("A") || !optTextByLabel.containsKey("B") || !optTextByLabel.containsKey("C")) {
                continue;
            }
            optTextByLabel.putIfAbsent("D", "(N/A)");

            String correct = normalizeCorrectLabel(pq.officialCorrectLabel(), optTextByLabel);
            boolean missingAnswerKey = pq.officialCorrectLabel() == null || pq.officialCorrectLabel().isBlank();
            if (correct == null) {
                correct = "A";
            }

            ToeicDocumentParserService.ParsedPassage linkedPassage = pq.passageCode() != null
                    ? passageMap.get(pq.passageCode())
                    : null;

            CreateQuestionRequest req = new CreateQuestionRequest();
            req.setPartNo(normalizePartNo(pq.partNo(), fallbackPart));
            req.setQuestionText(pq.questionText().trim());
            req.setQuestionGroupCode(trimOrNull(pq.passageCode()));
            req.setPassageText(linkedPassage != null ? trimOrNull(linkedPassage.content()) : null);
            req.setSourceType(QuestionSourceType.INTERNAL);
            req.setDifficultyLevel("BEGINNER");
            req.setExplanation(missingAnswerKey ? "Lưu ý: File nguồn chưa có Answer Key, vui lòng kiểm tra lại đáp án đúng." : null);
            req.setOptions(buildOptions(
                    optTextByLabel.get("A"),
                    optTextByLabel.get("B"),
                    optTextByLabel.get("C"),
                    optTextByLabel.get("D"),
                    correct
            ));
            result.add(req);
        }
        return result;
    }

    private List<CreateQuestionRequest> tryParseDocxTables(byte[] bytes, int fallbackPart) {
        List<CreateQuestionRequest> collected = new ArrayList<>();
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            for (XWPFTable table : doc.getTables()) {
                List<List<String>> rows = new ArrayList<>();
                for (XWPFTableRow row : table.getRows()) {
                    List<String> cells = new ArrayList<>();
                    boolean anyNonBlank = false;
                    for (XWPFTableCell cell : row.getTableCells()) {
                        String val = cleanCell(cell.getText());
                        if (!val.isEmpty()) anyNonBlank = true;
                        cells.add(val);
                    }
                    if (anyNonBlank) rows.add(cells);
                }
                if (!rows.isEmpty() && looksLikeQuestionHeader(rows.get(0))) {
                    collected.addAll(mapTabularRows(rows, fallbackPart));
                }
            }
        } catch (Exception ignored) {
            return List.of();
        }
        return collected;
    }

    private List<CreateQuestionRequest> parseExcel(byte[] bytes, int fallbackPart) {
        List<List<String>> rows = new ArrayList<>();
        DataFormatter formatter = new DataFormatter(Locale.ROOT);
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
                Sheet sheet = workbook.getSheetAt(s);
                if (sheet == null) continue;
                for (Row row : sheet) {
                    if (row == null || row.getLastCellNum() <= 0) continue;
                    int colLimit = Math.min(row.getLastCellNum(), 16);
                    List<String> cells = new ArrayList<>(colLimit);
                    boolean anyNonBlank = false;
                    for (int c = 0; c < colLimit; c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        String val = cell == null ? "" : cleanCell(formatter.formatCellValue(cell));
                        if (!val.isEmpty()) anyNonBlank = true;
                        cells.add(val);
                    }
                    if (anyNonBlank) rows.add(cells);
                }
            }
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }
        return mapTabularRows(rows, fallbackPart);
    }

    private List<CreateQuestionRequest> parseDelimitedText(String text, char delimiter, int fallbackPart) {
        List<List<String>> rows = new ArrayList<>();
        for (String line : text.split("\\r?\\n")) {
            if (line == null || line.isBlank()) continue;
            List<String> cols = splitDelimitedLine(line, delimiter);
            if (cols.stream().anyMatch(c -> !c.isEmpty())) rows.add(cols);
        }
        return mapTabularRows(rows, fallbackPart);
    }

    private List<CreateQuestionRequest> mapTabularRows(List<List<String>> rows, int fallbackPart) {
        if (rows.isEmpty()) return List.of();

        Map<FieldRole, Integer> colMap = new HashMap<>();
        int startIndex = 0;
        if (looksLikeQuestionHeader(rows.get(0))) {
            startIndex = 1;
            List<String> header = rows.get(0);
            for (int c = 0; c < header.size(); c++) {
                FieldRole role = detectHeaderRole(header.get(c));
                if (role != FieldRole.NONE) {
                    colMap.putIfAbsent(role, c);
                }
            }
        }

        List<CreateQuestionRequest> result = new ArrayList<>();
        for (int r = startIndex; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            CreateQuestionRequest req = colMap.isEmpty()
                    ? mapPositionalRow(row, fallbackPart)
                    : mapHeaderRow(row, colMap, fallbackPart);
            if (req != null) {
                result.add(req);
            }
        }
        return result;
    }

    private CreateQuestionRequest mapHeaderRow(List<String> row, Map<FieldRole, Integer> cols, int fallbackPart) {
        String questionText = trimOrNull(cell(row, cols.get(FieldRole.QUESTION)));
        String optA = cleanOption(cell(row, cols.get(FieldRole.OPT_A)));
        String optB = cleanOption(cell(row, cols.get(FieldRole.OPT_B)));
        String optC = cleanOption(cell(row, cols.get(FieldRole.OPT_C)));
        String optD = cleanOption(cell(row, cols.get(FieldRole.OPT_D)));
        if (questionText == null || optA == null || optB == null || optC == null) {
            return null;
        }
        if (optD == null) optD = "(N/A)";

        Map<String, String> optMap = Map.of("A", optA, "B", optB, "C", optC, "D", optD);
        String correct = normalizeCorrectLabel(cell(row, cols.get(FieldRole.CORRECT)), optMap);
        if (correct == null) correct = "A";

        Integer part = parsePartNumber(cell(row, cols.get(FieldRole.PART)), fallbackPart);

        CreateQuestionRequest req = new CreateQuestionRequest();
        req.setPartNo(part);
        req.setQuestionText(questionText);
        req.setExplanation(trimOrNull(cell(row, cols.get(FieldRole.EXPLANATION))));
        req.setDifficultyLevel(firstNonBlank(cell(row, cols.get(FieldRole.LEVEL)), "BEGINNER"));
        req.setSourceType(parseSourceType(cell(row, cols.get(FieldRole.SOURCE))));
        req.setSourceYear(parseIntegerOrNull(cell(row, cols.get(FieldRole.YEAR))));
        req.setAudioUrl(trimOrNull(cell(row, cols.get(FieldRole.AUDIO))));
        req.setImageUrl(trimOrNull(cell(row, cols.get(FieldRole.IMAGE))));
        req.setPassageText(trimOrNull(cell(row, cols.get(FieldRole.PASSAGE))));
        req.setTranscript(trimOrNull(cell(row, cols.get(FieldRole.TRANSCRIPT))));
        req.setQuestionGroupCode(trimOrNull(cell(row, cols.get(FieldRole.GROUP))));
        req.setOptions(buildOptions(optA, optB, optC, optD, correct));
        return req;
    }

    private CreateQuestionRequest mapPositionalRow(List<String> row, int fallbackPart) {
        if (row.size() < 5) return null;
        int offset = 0;
        if (row.get(0).trim().matches("^\\d{1,4}\\.?$") && row.size() >= 6) {
            // Check whether col 0 is STT vs PartNo (if col 0 > 7, clearly STT)
            Integer firstNum = parseIntegerOrNull(row.get(0));
            if (firstNum != null && (firstNum > 7 || row.size() >= 7)) {
                offset = 1;
            }
        }
        Integer maybePart = parseIntegerOrNull(cell(row, offset));
        int part = (maybePart != null && maybePart >= 1 && maybePart <= 7) ? maybePart : fallbackPart;
        int qIdx = (maybePart != null && maybePart >= 1 && maybePart <= 7) ? offset + 1 : offset;

        String questionText = trimOrNull(cell(row, qIdx));
        String optA = cleanOption(cell(row, qIdx + 1));
        String optB = cleanOption(cell(row, qIdx + 2));
        String optC = cleanOption(cell(row, qIdx + 3));
        String optD = cleanOption(cell(row, qIdx + 4));
        if (questionText == null || optA == null || optB == null || optC == null) {
            return null;
        }
        if (optD == null) optD = "(N/A)";

        Map<String, String> optMap = Map.of("A", optA, "B", optB, "C", optC, "D", optD);
        String correct = normalizeCorrectLabel(cell(row, qIdx + 5), optMap);
        if (correct == null) correct = "A";

        CreateQuestionRequest req = new CreateQuestionRequest();
        req.setPartNo(part);
        req.setQuestionText(questionText);
        req.setExplanation(trimOrNull(cell(row, qIdx + 6)));
        req.setDifficultyLevel("BEGINNER");
        req.setSourceType(QuestionSourceType.INTERNAL);
        req.setOptions(buildOptions(optA, optB, optC, optD, correct));
        return req;
    }

    private boolean looksLikeQuestionHeader(List<String> row) {
        int hits = 0;
        for (String cell : row) {
            FieldRole role = detectHeaderRole(cell);
            if (role == FieldRole.QUESTION || role == FieldRole.OPT_A || role == FieldRole.CORRECT) {
                hits++;
            }
        }
        return hits >= 2;
    }

    private FieldRole detectHeaderRole(String raw) {
        if (raw == null || raw.isBlank()) return FieldRole.NONE;
        String norm = normalizeAscii(raw).replaceAll("[_*]", " ").replaceAll("\\s+", " ").trim();
        if (List.of("part", "partno", "part no", "phan").contains(norm)) return FieldRole.PART;
        if (List.of("question", "questiontext", "question text", "cau hoi", "noi dung", "noi dung cau hoi").contains(norm))
            return FieldRole.QUESTION;
        if (List.of("a", "optiona", "option a", "dap an a", "lua chon a").contains(norm)) return FieldRole.OPT_A;
        if (List.of("b", "optionb", "option b", "dap an b", "lua chon b").contains(norm)) return FieldRole.OPT_B;
        if (List.of("c", "optionc", "option c", "dap an c", "lua chon c").contains(norm)) return FieldRole.OPT_C;
        if (List.of("d", "optiond", "option d", "dap an d", "lua chon d").contains(norm)) return FieldRole.OPT_D;
        if (List.of("correct", "correctlabel", "correct label", "correct option", "answer", "key", "dap an", "dap an dung").contains(norm))
            return FieldRole.CORRECT;
        if (List.of("explanation", "explain", "giai thich").contains(norm)) return FieldRole.EXPLANATION;
        if (List.of("level", "difficultylevel", "difficulty level", "cap do").contains(norm)) return FieldRole.LEVEL;
        if (List.of("source", "sourcetype", "source type", "nguon").contains(norm)) return FieldRole.SOURCE;
        if (List.of("year", "sourceyear", "source year", "nam").contains(norm)) return FieldRole.YEAR;
        if (List.of("audio", "audiourl", "audio url").contains(norm)) return FieldRole.AUDIO;
        if (List.of("image", "imageurl", "image url", "anh", "hinh anh").contains(norm)) return FieldRole.IMAGE;
        if (List.of("passage", "passagetext", "passage text", "doan van").contains(norm)) return FieldRole.PASSAGE;
        if (List.of("transcript", "audio transcript").contains(norm)) return FieldRole.TRANSCRIPT;
        if (List.of("group", "groupcode", "questiongroupcode", "question group code", "ma nhom").contains(norm))
            return FieldRole.GROUP;
        return FieldRole.NONE;
    }

    private List<CreateQuestionOptionRequest> buildOptions(
            String a, String b, String c, String d, String correctLabel
    ) {
        return List.of(
                makeOption("A", a, "A".equals(correctLabel)),
                makeOption("B", b, "B".equals(correctLabel)),
                makeOption("C", c, "C".equals(correctLabel)),
                makeOption("D", d, "D".equals(correctLabel))
        );
    }

    private CreateQuestionOptionRequest makeOption(String label, String text, boolean correct) {
        CreateQuestionOptionRequest opt = new CreateQuestionOptionRequest();
        opt.setOptionLabel(label);
        opt.setOptionText(text);
        opt.setCorrect(correct);
        return opt;
    }

    private String normalizeCorrectLabel(String raw, Map<String, String> optMap) {
        if (raw == null || raw.isBlank()) return null;
        String trimmed = raw.trim().toUpperCase(Locale.ROOT)
                .replaceAll("^(?:ĐÁP\\s*ÁN|ANSWER|KEY)\\s*[:\\-]?\\s*", "")
                .replaceAll("[().]", "")
                .trim();
        if (List.of("A", "B", "C", "D").contains(trimmed)) return trimmed;
        return switch (trimmed) {
            case "1" -> "A";
            case "2" -> "B";
            case "3" -> "C";
            case "4" -> "D";
            default -> {
                for (Map.Entry<String, String> e : optMap.entrySet()) {
                    if (e.getValue() != null && e.getValue().equalsIgnoreCase(raw.trim())) {
                        yield e.getKey();
                    }
                }
                yield null;
            }
        };
    }

    private int normalizePartNo(Integer candidate, int fallback) {
        if (candidate != null && candidate >= 1 && candidate <= 7) {
            return candidate;
        }
        return (fallback >= 1 && fallback <= 7) ? fallback : 5;
    }

    private Integer parsePartNumber(String raw, int fallbackPart) {
        if (raw == null || raw.isBlank()) return fallbackPart;
        Matcher m = PART_NUMBER_PATTERN.matcher(raw.trim());
        if (m.find()) {
            int val = Integer.parseInt(m.group(1));
            if (val >= 1 && val <= 7) return val;
        }
        return fallbackPart;
    }

    private QuestionSourceType parseSourceType(String raw) {
        if (raw == null || raw.isBlank()) return QuestionSourceType.INTERNAL;
        try {
            return QuestionSourceType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return QuestionSourceType.INTERNAL;
        }
    }

    private Integer parseIntegerOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Integer.parseInt(raw.replaceAll("[^0-9-]", "").trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private String cleanOption(String raw) {
        if (raw == null) return null;
        String cleaned = OPTION_PREFIX_PATTERN.matcher(raw.trim()).replaceFirst("").trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private List<String> splitDelimitedLine(String line, char delimiter) {
        List<String> cells = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    current.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch == delimiter && !inQuotes) {
                cells.add(cleanCell(current.toString()));
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        cells.add(cleanCell(current.toString()));
        return cells;
    }

    private boolean isZipArchive(byte[] bytes) {
        return bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 0x03 && bytes[3] == 0x04;
    }

    private String decodeText(byte[] bytes) {
        String s = new String(bytes, StandardCharsets.UTF_8);
        return (!s.isEmpty() && s.charAt(0) == '\uFEFF') ? s.substring(1) : s;
    }

    private String cleanCell(String value) {
        if (value == null) return "";
        return value.replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
    }

    private String normalizeAscii(String input) {
        return Normalizer.normalize(input, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT);
    }

    private String cell(List<String> row, Integer idx) {
        if (idx == null || idx < 0 || idx >= row.size()) return "";
        return row.get(idx);
    }

    private String trimOrNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private String firstNonBlank(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a.trim();
        return b;
    }

    private enum FieldRole {
        NONE, PART, QUESTION, OPT_A, OPT_B, OPT_C, OPT_D, CORRECT, EXPLANATION,
        LEVEL, SOURCE, YEAR, AUDIO, IMAGE, PASSAGE, TRANSCRIPT, GROUP
    }
}
