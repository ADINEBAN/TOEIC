package org.example.backend.service;

import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.springframework.stereotype.Component;

import javax.swing.text.Document;
import javax.swing.text.rtf.RTFEditorKit;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses vocabulary flashcard rows from Excel (.xlsx, .xls), Word (.docx, .doc), CSV, TSV, and TXT files.
 */
@Component
public class FlashcardImportParser {

    private static final int MAX_ROWS = 500;
    private static final Pattern LEADING_MARKER = Pattern.compile("^\\s*(?:\\d+[.)\\]]\\s*|[-–—•*+]\\s+)");
    private static final Pattern INLINE_IPA = Pattern.compile("(/[^/\\r\\n]{1,60}/)");
    private static final Pattern SEPARATOR_ONLY_LINE = Pattern.compile("^[-_=*~|\\s]{3,}$");
    private static final Pattern NUMERIC_INDEX = Pattern.compile("^\\d{1,4}\\.?$");
    private static final Pattern INLINE_SPLIT_PATTERN = Pattern.compile("\\s+(?:-|–|—|=>|->)\\s+|\\s*:\\s+");

    public record ParsedFlashcardRow(
            String englishWord,
            String meaningVi,
            String pronunciation,
            String exampleSentence
    ) {}

    public List<ParsedFlashcardRow> parse(String originalFilename, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        }

        String ext = detectExtension(originalFilename, bytes);
        List<ParsedFlashcardRow> parsed = switch (ext) {
            case "xlsx", "xls" -> parseExcel(bytes);
            case "docx" -> parseDocx(bytes);
            case "doc" -> parseDoc(bytes);
            case "csv" -> parseDelimitedText(decodeText(bytes), ',');
            case "tsv" -> parseDelimitedText(decodeText(bytes), '\t');
            case "txt" -> parsePlainText(decodeText(bytes));
            default -> throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        };

        if (parsed.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        }
        return parsed.size() > MAX_ROWS ? parsed.subList(0, MAX_ROWS) : parsed;
    }

    private List<ParsedFlashcardRow> parseExcel(byte[] bytes) {
        List<List<String>> rows = new ArrayList<>();
        DataFormatter formatter = new DataFormatter(Locale.ROOT);
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
                Sheet sheet = workbook.getSheetAt(s);
                if (sheet == null) {
                    continue;
                }
                for (Row row : sheet) {
                    if (row == null) {
                        continue;
                    }
                    short lastCell = row.getLastCellNum();
                    if (lastCell <= 0) {
                        continue;
                    }
                    int colLimit = Math.min(lastCell, 12);
                    List<String> cells = new ArrayList<>(colLimit);
                    boolean anyNonBlank = false;
                    for (int c = 0; c < colLimit; c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        String val = cell == null ? "" : cleanCell(formatter.formatCellValue(cell));
                        if (!val.isEmpty()) {
                            anyNonBlank = true;
                        }
                        cells.add(val);
                    }
                    if (anyNonBlank) {
                        rows.add(cells);
                    }
                }
            }
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        }
        return mapTabularRows(rows);
    }

    private List<ParsedFlashcardRow> parseDocx(byte[] bytes) {
        List<ParsedFlashcardRow> result = new ArrayList<>();
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            List<String> looseParagraphs = new ArrayList<>();
            for (IBodyElement elem : doc.getBodyElements()) {
                if (elem instanceof XWPFTable table) {
                    flushLooseParagraphs(looseParagraphs, result);
                    List<List<String>> tableRows = new ArrayList<>();
                    for (XWPFTableRow row : table.getRows()) {
                        List<String> cells = new ArrayList<>();
                        boolean anyNonBlank = false;
                        for (XWPFTableCell cell : row.getTableCells()) {
                            String val = cleanCell(cell.getText());
                            if (!val.isEmpty()) {
                                anyNonBlank = true;
                            }
                            cells.add(val);
                        }
                        if (anyNonBlank) {
                            tableRows.add(cells);
                        }
                    }
                    result.addAll(mapTabularRows(tableRows));
                } else if (elem instanceof XWPFParagraph paragraph) {
                    String text = paragraph.getText();
                    if (text != null && !text.isBlank()) {
                        looseParagraphs.addAll(Arrays.asList(text.split("\\r?\\n")));
                    }
                }
            }
            flushLooseParagraphs(looseParagraphs, result);
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        }
        return result;
    }

    private List<ParsedFlashcardRow> parseDoc(byte[] bytes) {
        if (isZipArchive(bytes)) {
            return parseDocx(bytes);
        }
        try (HWPFDocument doc = new HWPFDocument(new ByteArrayInputStream(bytes));
             WordExtractor extractor = new WordExtractor(doc)) {
            return parsePlainText(extractor.getText());
        } catch (Exception ex) {
            String decoded = decodeText(bytes);
            if (decoded.trim().startsWith("{\\rtf")) {
                try {
                    byte[] rtfBytes = decoded
                            .replaceAll("\\\\line(?![a-zA-Z])", "\\\\par ")
                            .getBytes(StandardCharsets.ISO_8859_1);
                    RTFEditorKit kit = new RTFEditorKit();
                    Document rtfDoc = kit.createDefaultDocument();
                    kit.read(new ByteArrayInputStream(rtfBytes), rtfDoc, 0);
                    return parsePlainText(rtfDoc.getText(0, rtfDoc.getLength()));
                } catch (Exception ignored) {
                    // Fall through to invalid flashcard error
                }
            } else if (decoded.contains("<table") || decoded.contains("<html")) {
                String stripped = decoded
                        .replaceAll("(?s)<style.*?</style>", " ")
                        .replaceAll("</tr>", "\n")
                        .replaceAll("</t[dh]>", "\t")
                        .replaceAll("</p>|</div>|<br\\s*/?>", "\n")
                        .replaceAll("<[^>]+>", " ");
                return parsePlainText(stripped);
            }
            throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        }
    }

    private void flushLooseParagraphs(List<String> looseParagraphs, List<ParsedFlashcardRow> dest) {
        if (looseParagraphs.isEmpty()) {
            return;
        }
        dest.addAll(parseLines(looseParagraphs));
        looseParagraphs.clear();
    }

    private List<ParsedFlashcardRow> parseDelimitedText(String text, char delimiter) {
        List<List<String>> rows = new ArrayList<>();
        for (String line : text.split("\\r?\\n")) {
            if (line == null || line.isBlank()) {
                continue;
            }
            List<String> cols = splitDelimitedLine(line, delimiter);
            if (cols.stream().anyMatch(c -> !c.isEmpty())) {
                rows.add(cols);
            }
        }
        return mapTabularRows(rows);
    }

    private List<ParsedFlashcardRow> parsePlainText(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        return parseLines(Arrays.asList(text.split("\\r?\\n")));
    }

    private List<ParsedFlashcardRow> parseLines(List<String> rawLines) {
        List<String> lines = new ArrayList<>();
        for (String raw : rawLines) {
            String trimmed = raw == null ? "" : raw.trim();
            if (!trimmed.isEmpty() && !SEPARATOR_ONLY_LINE.matcher(trimmed).matches()) {
                lines.add(trimmed);
            }
        }
        if (lines.isEmpty()) {
            return List.of();
        }

        long tabOrPipeCount = lines.stream().filter(l -> l.contains("\t") || l.contains("|")).count();
        if (tabOrPipeCount >= Math.max(1, lines.size() / 2)) {
            char sep = lines.stream().anyMatch(l -> l.contains("\t")) ? '\t' : '|';
            List<List<String>> tableRows = new ArrayList<>();
            for (String line : lines) {
                tableRows.add(splitDelimitedLine(line, sep));
            }
            return mapTabularRows(tableRows);
        }

        List<ParsedFlashcardRow> rows = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            if (i == 0 && looksLikeHeaderRow(List.of(line.split("[,;|\\t]")))) {
                continue;
            }
            ParsedFlashcardRow row = parseSingleTextLine(line);
            if (row != null) {
                rows.add(row);
            }
        }
        return rows;
    }

    private ParsedFlashcardRow parseSingleTextLine(String line) {
        String cleaned = LEADING_MARKER.matcher(line).replaceFirst("").trim();
        if (cleaned.isEmpty() || looksLikeHeaderCell(cleaned) != ColumnRole.NONE) {
            return null;
        }

        String ipa = null;
        Matcher ipaMatcher = INLINE_IPA.matcher(cleaned);
        if (ipaMatcher.find()) {
            ipa = ipaMatcher.group(1).trim();
            cleaned = (cleaned.substring(0, ipaMatcher.start()) + " " + cleaned.substring(ipaMatcher.end()))
                    .replaceAll("\\s+", " ")
                    .trim();
        }

        String[] parts = INLINE_SPLIT_PATTERN.split(cleaned, 3);
        String word = trimOrNull(stripTrailingPosTag(parts[0]));
        if (word == null || NUMERIC_INDEX.matcher(word).matches()) {
            return null;
        }
        String meaning = parts.length >= 2 ? trimOrNull(parts[1]) : null;
        String example = parts.length >= 3 ? trimOrNull(parts[2]) : null;
        return new ParsedFlashcardRow(truncate(word, 250), meaning, truncate(ipa, 250), example);
    }

    private List<ParsedFlashcardRow> mapTabularRows(List<List<String>> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }

        int wordIdx = -1;
        int meaningIdx = -1;
        int ipaIdx = -1;
        int exampleIdx = -1;
        int startIndex = 0;

        List<String> firstRow = rows.get(0);
        if (looksLikeHeaderRow(firstRow)) {
            startIndex = 1;
            for (int c = 0; c < firstRow.size(); c++) {
                ColumnRole role = looksLikeHeaderCell(firstRow.get(c));
                switch (role) {
                    case WORD -> {
                        if (wordIdx < 0) wordIdx = c;
                    }
                    case MEANING -> {
                        if (meaningIdx < 0) meaningIdx = c;
                    }
                    case PRONUNCIATION -> {
                        if (ipaIdx < 0) ipaIdx = c;
                    }
                    case EXAMPLE -> {
                        if (exampleIdx < 0) exampleIdx = c;
                    }
                    default -> {
                    }
                }
            }
        }

        List<ParsedFlashcardRow> parsed = new ArrayList<>();
        for (int r = startIndex; r < rows.size(); r++) {
            List<String> cells = rows.get(r);
            if (cells.isEmpty()) {
                continue;
            }
            ParsedFlashcardRow row;
            if (wordIdx >= 0) {
                String word = cleanWordValue(cellAt(cells, wordIdx));
                if (word == null) continue;
                String meaning = meaningIdx >= 0 ? trimOrNull(cellAt(cells, meaningIdx)) : null;
                String ipa = ipaIdx >= 0 ? trimOrNull(cellAt(cells, ipaIdx)) : null;
                String example = exampleIdx >= 0 ? trimOrNull(cellAt(cells, exampleIdx)) : null;
                row = new ParsedFlashcardRow(truncate(word, 250), meaning, truncate(ipa, 250), example);
            } else {
                row = mapPositionalRow(cells);
            }
            if (row != null) {
                parsed.add(row);
            }
        }
        return parsed;
    }

    private ParsedFlashcardRow mapPositionalRow(List<String> rawCells) {
        int offset = 0;
        if (rawCells.size() >= 2 && NUMERIC_INDEX.matcher(rawCells.get(0).trim()).matches()) {
            offset = 1;
        }
        String col0 = cellAt(rawCells, offset);
        if (col0.isEmpty()) {
            return null;
        }

        // Single-column row may contain "word - meaning" or just a word
        boolean onlyOneNonEmpty = true;
        for (int i = offset + 1; i < rawCells.size(); i++) {
            if (!rawCells.get(i).isBlank()) {
                onlyOneNonEmpty = false;
                break;
            }
        }
        if (onlyOneNonEmpty) {
            return parseSingleTextLine(col0);
        }

        String word = cleanWordValue(col0);
        if (word == null) {
            return null;
        }
        String c1 = trimOrNull(cellAt(rawCells, offset + 1));
        String c2 = trimOrNull(cellAt(rawCells, offset + 2));
        String c3 = trimOrNull(cellAt(rawCells, offset + 3));

        // Handle "word | /ipa/ | meaning | example" column order transparently
        String meaning = c1;
        String ipa = c2;
        if (looksLikeIpa(c1) && !looksLikeIpa(c2)) {
            ipa = c1;
            meaning = c2;
        }
        return new ParsedFlashcardRow(truncate(word, 250), meaning, truncate(ipa, 250), c3);
    }

    private boolean looksLikeHeaderRow(List<String> row) {
        int matchedRoles = 0;
        for (String cell : row) {
            ColumnRole role = looksLikeHeaderCell(cell);
            if (role == ColumnRole.WORD || role == ColumnRole.MEANING
                    || role == ColumnRole.PRONUNCIATION || role == ColumnRole.EXAMPLE) {
                matchedRoles++;
            }
        }
        return matchedRoles >= 2 || (row.size() == 1 && looksLikeHeaderCell(row.get(0)) == ColumnRole.WORD);
    }

    private ColumnRole looksLikeHeaderCell(String raw) {
        if (raw == null || raw.isBlank()) {
            return ColumnRole.NONE;
        }
        String norm = normalizeAscii(raw).replace('*', ' ').replaceAll("\\s+", " ").trim();
        if (List.of("stt", "no", "no.", "#", "id", "index").contains(norm)) {
            return ColumnRole.INDEX;
        }
        if (List.of("word", "english", "english word", "english_word", "englishword",
                "vocab", "vocabulary", "tu", "tu vung", "tieng anh", "term", "keyword").contains(norm)) {
            return ColumnRole.WORD;
        }
        if (List.of("meaning", "meaning vi", "meaning_vi", "meaningvi", "vietnamese",
                "nghia", "nghia tieng viet", "dich", "definition").contains(norm)) {
            return ColumnRole.MEANING;
        }
        if (List.of("ipa", "pronunciation", "phonetic", "phien am", "phat am").contains(norm)) {
            return ColumnRole.PRONUNCIATION;
        }
        if (List.of("example", "example sentence", "example_sentence", "examplesentence",
                "sentence", "vi du", "cau vi du", "usage").contains(norm)) {
            return ColumnRole.EXAMPLE;
        }
        return ColumnRole.NONE;
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

    private String detectExtension(String filename, byte[] bytes) {
        String lower = filename == null ? "" : filename.trim().toLowerCase(Locale.ROOT);
        if (lower.endsWith(".xlsx")) return "xlsx";
        if (lower.endsWith(".xls")) return "xls";
        if (lower.endsWith(".docx")) return "docx";
        if (lower.endsWith(".doc")) return "doc";
        if (lower.endsWith(".csv")) return "csv";
        if (lower.endsWith(".tsv")) return "tsv";
        if (lower.endsWith(".txt")) return "txt";
        if (bytes.length >= 8 && bytes[0] == (byte) 0xD0 && bytes[1] == (byte) 0xCF
                && bytes[2] == 0x11 && bytes[3] == (byte) 0xE0) {
            return "xls";
        }
        if (isZipArchive(bytes)) {
            return "docx";
        }
        return "txt";
    }

    private boolean isZipArchive(byte[] bytes) {
        return bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 0x03 && bytes[3] == 0x04;
    }

    private String decodeText(byte[] bytes) {
        String s = new String(bytes, StandardCharsets.UTF_8);
        if (!s.isEmpty() && s.charAt(0) == '\uFEFF') {
            s = s.substring(1);
        }
        return s;
    }

    private String cleanCell(String value) {
        if (value == null) return "";
        return value.replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
    }

    private String cleanWordValue(String raw) {
        if (raw == null) return null;
        String cleaned = LEADING_MARKER.matcher(raw.trim()).replaceFirst("").trim();
        cleaned = stripTrailingPosTag(cleaned);
        if (cleaned.isEmpty() || NUMERIC_INDEX.matcher(cleaned).matches()
                || looksLikeHeaderCell(cleaned) != ColumnRole.NONE) {
            return null;
        }
        return cleaned;
    }

    private String stripTrailingPosTag(String s) {
        if (s == null) return "";
        return s.replaceFirst("\\s*\\((?:n|v|adj|adv|prep|conj|pron|det|n/v)\\.?\\)\\s*$", "").trim();
    }

    private boolean looksLikeIpa(String val) {
        if (val == null) return false;
        String t = val.trim();
        return (t.startsWith("/") && t.endsWith("/") && t.length() >= 3)
                || (t.startsWith("[") && t.endsWith("]") && t.length() >= 3);
    }

    private String normalizeAscii(String input) {
        String decomposed = Normalizer.normalize(input, Normalizer.Form.NFD);
        return decomposed
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd')
                .replace('Đ', 'D')
                .toLowerCase(Locale.ROOT);
    }

    private String cellAt(List<String> cells, int idx) {
        return idx >= 0 && idx < cells.size() ? cells.get(idx) : "";
    }

    private String trimOrNull(String val) {
        if (val == null) return null;
        String t = val.trim();
        return t.isEmpty() ? null : t;
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private enum ColumnRole {
        NONE, INDEX, WORD, MEANING, PRONUNCIATION, EXAMPLE
    }
}
