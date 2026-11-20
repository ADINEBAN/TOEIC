package org.example.backend.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ToeicDocumentParserService {

    private static final Pattern PART_HEADER_PATTERN = Pattern.compile(
            "(?im)^\\s*(?:===\\s*PAGE\\s+\\d+\\s*===\\s*$|(?:SECTION\\s*\\d+\\s*[-:]?\\s*)?PART\\s*([1-7])\\b.*)"
    );
    private static final Pattern ANSWER_KEY_HEADER_PATTERN = Pattern.compile(
            "(?im)^\\s*(?:ANSWER\\s+KEY|ANSWERS|OFFICIAL\\s+ANSWERS|ĐÁP\\s*ÁN)\\b[:\\s-]*$"
    );
    private static final Pattern PASSAGE_RANGE_PATTERN = Pattern.compile(
            "(?im)^\\s*Questions?\\s+(\\d{1,3})\\s*[-–—to]+\\s*(\\d{1,3})\\s+refer\\s+to\\s+the\\s+following\\s+(.+?)\\.?\\s*$"
    );
    private static final Pattern SINGLE_PASSAGE_REF_PATTERN = Pattern.compile(
            "(?im)^\\s*Question\\s+(\\d{1,3})\\s+refers\\s+to\\s+the\\s+following\\s+(.+?)\\.?\\s*$"
    );
    private static final Pattern QUESTION_START_PATTERN = Pattern.compile(
            "(?m)^\\s*(?:Q\\.?\\s*)?(\\d{1,3})\\s*(?:[.):]\\s+|\\.(?=[A-Za-z_\"'(])|[):](?=\\S))(.*)$"
    );
    private static final Pattern INLINE_CHOICES_PATTERN = Pattern.compile(
            "\\(\\s*([A-D])\\s*\\)\\s*|(?m)^\\s*([A-D])\\s*[.)]\\s+"
    );
    private static final Pattern ANSWER_KEY_ENTRY_PATTERN = Pattern.compile(
            "(?:^|[\\s,;])(\\d{1,3})\\s*[.):\\-]?\\s*(?:\\(\\s*([A-D])\\s*\\)|\\b([A-D])\\b)(?=$|[\\s,;])"
    );
    private static final Pattern PART6_BLANK_MARKER_PATTERN = Pattern.compile(
            "(?:\\[\\s*(\\d{1,3})\\s*\\]|\\(\\s*(\\d{1,3})\\s*\\)|_{2,}\\s*(\\d{1,3})\\s*_{2,}|-{3,}\\s*(\\d{1,3})\\s*-{3,}|\\b(\\d{1,3})\\s*\\.\\s*_{2,})"
    );
    private static final Pattern TABLE_BLOCK_PATTERN = Pattern.compile(
            "(?s)\\[TABLE\\]\\s*(.*?)\\s*\\[/TABLE\\]"
    );

    public record ParsedOption(String optionLabel, String optionText) {}

    public record ParsedPassage(
            String passageCode,
            int partNo,
            String passageType,
            String documentKind,
            int pageNumber,
            int rangeStart,
            int rangeEnd,
            String content,
            String tableJson,
            String linkedPassageCodes
    ) {}

    public record ParsedQuestion(
            int partNo,
            Integer originalQuestionNumber,
            int pageNumber,
            String questionText,
            List<ParsedOption> options,
            String passageCode,
            String officialCorrectLabel,
            boolean answerKeyVerified,
            double extractionConfidence
    ) {}

    public record ParsedDocumentResult(
            List<ParsedPassage> passages,
            List<ParsedQuestion> questions,
            Map<Integer, String> extractedAnswerKeys,
            boolean excludedListeningParts,
            List<String> parserNotices
    ) {}

    private record LineWithPage(int pageNumber, double confidence, String text) {}

    public ParsedDocumentResult parse(DocumentTextExtractionService.DocumentExtractionResult extraction) {
        List<LineWithPage> allLines = new ArrayList<>();
        for (DocumentTextExtractionService.ExtractedPage page : extraction.pages()) {
            String[] lines = (page.text() == null ? "" : page.text()).split("\\r?\\n");
            for (String line : lines) {
                allLines.add(new LineWithPage(page.pageNumber(), page.ocrConfidence(), line));
            }
        }

        // 1. Identify and separate trailing/explicit Answer Key block
        int answerKeyStartIdx = detectAnswerKeyStartLine(allLines);
        Map<Integer, String> answerKeys = new LinkedHashMap<>();
        if (answerKeyStartIdx >= 0) {
            StringBuilder akText = new StringBuilder();
            for (int i = answerKeyStartIdx; i < allLines.size(); i++) {
                akText.append(allLines.get(i).text()).append("\n");
            }
            answerKeys.putAll(parseAnswerKeyMap(akText.toString()));
        }

        int contentEndIdx = answerKeyStartIdx >= 0 ? answerKeyStartIdx : allLines.size();

        // 2. Scan sections, passages, and questions preserving verbatim text
        List<ParsedPassage> passages = new ArrayList<>();
        List<ParsedQuestion> questions = new ArrayList<>();
        List<String> notices = new ArrayList<>();
        boolean excludedListening = false;

        int activePart = 0; // 0 = unknown/auto
        boolean inListeningSection = false;
        int passageCounter = 0;

        // Current passage builder state
        boolean collectingPassage = false;
        String currentPassageCode = null;
        int currentPassagePart = 7;
        int currentPassagePage = 1;
        int currentRangeStart = -1;
        int currentRangeEnd = -1;
        String currentPassageHeaderHint = "";
        StringBuilder currentPassageBuf = new StringBuilder();

        // Current question builder state
        Integer curQNum = null;
        int curQPart = 5;
        int curQPage = 1;
        double curQConf = 0.95;
        String curQPassageCode = null;
        StringBuilder curQBodyBuf = new StringBuilder();

        for (int i = 0; i < contentEndIdx; i++) {
            LineWithPage lp = allLines.get(i);
            String trimmed = lp.text().trim();
            if (trimmed.isEmpty()) {
                if (collectingPassage && !currentPassageBuf.isEmpty()) {
                    currentPassageBuf.append("\n");
                }
                continue;
            }

            // Detect PART X headers
            Integer explicitPart = matchPartHeader(trimmed);
            if (explicitPart != null) {
                // Flush open question
                if (curQNum != null) {
                    finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
                    curQNum = null;
                    curQBodyBuf.setLength(0);
                }
                // Flush open passage
                if (collectingPassage) {
                    finalizePassage(currentPassageCode, currentPassagePart, currentPassagePage, currentRangeStart, currentRangeEnd,
                            currentPassageHeaderHint, currentPassageBuf.toString(), passages);
                    collectingPassage = false;
                    currentPassageBuf.setLength(0);
                }

                if (explicitPart >= 1 && explicitPart <= 4) {
                    inListeningSection = true;
                    activePart = explicitPart;
                    excludedListening = true;
                } else {
                    inListeningSection = false;
                    activePart = explicitPart;
                }
                continue;
            }

            if (inListeningSection) {
                continue;
            }

            // Skip generic directions lines cleanly
            if (trimmed.matches("(?i)^Directions?:.*") && trimmed.length() > 25) {
                continue;
            }

            // Detect "Questions X-Y refer to the following ..."
            Matcher rangeM = PASSAGE_RANGE_PATTERN.matcher(trimmed);
            Matcher singleRefM = SINGLE_PASSAGE_REF_PATTERN.matcher(trimmed);
            if (rangeM.matches() || singleRefM.matches()) {
                if (curQNum != null) {
                    finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
                    curQNum = null;
                    curQBodyBuf.setLength(0);
                }
                if (collectingPassage) {
                    finalizePassage(currentPassageCode, currentPassagePart, currentPassagePage, currentRangeStart, currentRangeEnd,
                            currentPassageHeaderHint, currentPassageBuf.toString(), passages);
                    currentPassageBuf.setLength(0);
                }

                int startNum = Integer.parseInt((rangeM.matches() ? rangeM : singleRefM).group(1));
                int endNum = rangeM.matches() ? Integer.parseInt(rangeM.group(2)) : startNum;
                String hint = (rangeM.matches() ? rangeM : singleRefM).group(rangeM.matches() ? 3 : 2);

                passageCounter++;
                currentPassageCode = String.format(Locale.ROOT, "P%02d_%d_%d", passageCounter, startNum, endNum);
                currentRangeStart = startNum;
                currentRangeEnd = endNum;
                currentPassagePage = lp.pageNumber();
                currentPassageHeaderHint = hint != null ? hint.trim() : "passage";
                currentPassagePart = activePart >= 6 ? activePart
                        : (startNum >= 131 && endNum <= 146 ? 6 : 7);
                collectingPassage = true;
                continue;
            }

            // Detect standalone numbered blank inside Part 6 passage without repeating "Questions X-Y"
            // vs standalone question start "101. ..." / "131. (A) ... (B) ..."
            Matcher qStart = QUESTION_START_PATTERN.matcher(trimmed);
            boolean looksLikePassageBlankOnly = collectingPassage
                    && currentPassagePart == 6
                    && !trimmed.contains("(A)")
                    && !trimmed.matches(".*\\bA\\.\\s+.*");

            if (qStart.matches() && !looksLikePassageBlankOnly) {
                int candidateNum = Integer.parseInt(qStart.group(1));
                // Avoid splitting lines inside a passage that are dates/times/bullet numbers like "2025." unless it looks like a valid question
                boolean isLikelyDateOrYear = candidateNum > 220;
                if (!isLikelyDateOrYear) {
                    if (collectingPassage) {
                        finalizePassage(currentPassageCode, currentPassagePart, currentPassagePage, currentRangeStart, currentRangeEnd,
                                currentPassageHeaderHint, currentPassageBuf.toString(), passages);
                        collectingPassage = false;
                        currentPassageBuf.setLength(0);
                    }

                    if (curQNum != null) {
                        finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
                        curQBodyBuf.setLength(0);
                    }

                    curQNum = candidateNum;
                    curQPage = lp.pageNumber();
                    curQConf = lp.confidence();
                    ParsedPassage matchedPassage = findMatchingPassage(passages, candidateNum);
                    if (matchedPassage != null) {
                        curQPassageCode = matchedPassage.passageCode();
                        curQPart = matchedPassage.partNo();
                    } else {
                        curQPassageCode = null;
                        curQPart = inferPartNumber(activePart, candidateNum);
                    }

                    // Handle Part 1-4 numbering if no explicit Part 5/6/7 header and line reads like audio instruction
                    if (activePart == 0 && candidateNum <= 100 && isListeningPromptLine(qStart.group(2))) {
                        excludedListening = true;
                        curQNum = null;
                        continue;
                    }

                    curQBodyBuf.append(qStart.group(2).trim());
                    continue;
                }
            }

            if (collectingPassage) {
                currentPassageBuf.append(lp.text()).append("\n");
            } else if (curQNum != null) {
                curQBodyBuf.append("\n").append(trimmed);
            }
        }

        // Flush remaining open items
        if (collectingPassage && !currentPassageBuf.toString().isBlank()) {
            finalizePassage(currentPassageCode, currentPassagePart, currentPassagePage, currentRangeStart, currentRangeEnd,
                    currentPassageHeaderHint, currentPassageBuf.toString(), passages);
        }
        if (curQNum != null) {
            finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
        }

        // Refine Part 6 detection if passage content actually contains numbered blanks [131], --- 131 ---, etc.
        passages = refinePassageClassifications(passages);
        questions = reconcileQuestionPartsWithPassages(questions, passages);

        if (excludedListening) {
            notices.add("Parts 1–4 (Listening) were excluded because audio resources are not provided for uploaded documents.");
        }
        if (answerKeys.isEmpty() && !questions.isEmpty()) {
            notices.add("No official answer key detected in uploaded document. Questions marked as Unverified.");
        }

        passages.sort(Comparator.comparingInt(ParsedPassage::rangeStart).thenComparingInt(ParsedPassage::pageNumber));
        questions.sort(Comparator.comparingInt(q -> q.originalQuestionNumber() != null ? q.originalQuestionNumber() : 0));

        return new ParsedDocumentResult(passages, questions, answerKeys, excludedListening, notices);
    }

    private void finalizePassage(
            String code,
            int initialPart,
            int pageNumber,
            int rangeStart,
            int rangeEnd,
            String hint,
            String rawContent,
            List<ParsedPassage> passages
    ) {
        String cleaned = rawContent == null ? "" : rawContent.replaceAll("\\n{3,}", "\n\n").trim();
        if (cleaned.isEmpty()) {
            return;
        }
        int partNo = initialPart;
        if (PART6_BLANK_MARKER_PATTERN.matcher(cleaned).find() || (rangeStart >= 131 && rangeEnd <= 146)) {
            partNo = 6;
        }

        String passageType = classifyPassageType(partNo, hint, cleaned);
        String docKind = classifyDocumentKind(hint, cleaned);
        String tableJson = extractTablesSummaryJson(cleaned);

        passages.add(new ParsedPassage(
                code,
                partNo,
                passageType,
                docKind,
                pageNumber,
                rangeStart,
                rangeEnd,
                cleaned,
                tableJson,
                null
        ));
    }

    private void finalizeQuestion(
            Integer qNum,
            int partNo,
            int pageNumber,
            double confidence,
            String passageCode,
            String rawBody,
            Map<Integer, String> answerKeys,
            List<ParsedPassage> passages,
            List<ParsedQuestion> questions
    ) {
        if (rawBody == null || rawBody.trim().isEmpty()) {
            return;
        }
        ExtractedStemAndOptions extracted = splitStemAndOptions(rawBody);
        String stem = extracted.stem();
        List<ParsedOption> options = extracted.options();

        // In Part 6 OCR/PDF documents, a question might only have a number & 4 choices because the blank sits inside passage
        if (stem.isBlank() && partNo == 6 && !options.isEmpty()) {
            stem = "Choose the best word or phrase for blank (" + qNum + ") in the passage.";
        }
        if (stem.isBlank() && options.isEmpty()) {
            return;
        }

        String officialKey = answerKeys.get(qNum);
        boolean verified = officialKey != null && !officialKey.isBlank();

        // Keep passage link strictly synced
        if (passageCode == null) {
            ParsedPassage fallback = findMatchingPassage(passages, qNum);
            if (fallback != null) {
                passageCode = fallback.passageCode();
                partNo = fallback.partNo();
            }
        }

        questions.add(new ParsedQuestion(
                partNo,
                qNum,
                pageNumber,
                stem,
                options,
                passageCode,
                officialKey,
                verified,
                confidence
        ));
    }

    private record ExtractedStemAndOptions(String stem, List<ParsedOption> options) {}

    private ExtractedStemAndOptions splitStemAndOptions(String rawBody) {
        List<MatchSpan> spans = new ArrayList<>();
        Matcher m = INLINE_CHOICES_PATTERN.matcher(rawBody);
        while (m.find()) {
            String label = m.group(1) != null ? m.group(1) : m.group(2);
            if (label != null) {
                spans.add(new MatchSpan(label.toUpperCase(Locale.ROOT), m.start(), m.end()));
            }
        }

        // Filter to valid ascending A, B, C, D sequence (ignore spurious (A) in middle of reading passage quotes if repeated)
        List<MatchSpan> ordered = pickCanonicalOptionSequence(spans);
        if (ordered.isEmpty()) {
            return new ExtractedStemAndOptions(rawBody.trim(), List.of());
        }

        String stem = rawBody.substring(0, ordered.get(0).start()).replaceAll("\\s+", " ").trim();
        List<ParsedOption> options = new ArrayList<>();
        for (int i = 0; i < ordered.size(); i++) {
            MatchSpan cur = ordered.get(i);
            int nextStart = (i + 1 < ordered.size()) ? ordered.get(i + 1).start() : rawBody.length();
            String optText = rawBody.substring(cur.end(), nextStart).replaceAll("\\s+", " ").trim();
            options.add(new ParsedOption(cur.label(), optText));
        }
        return new ExtractedStemAndOptions(stem, options);
    }

    private record MatchSpan(String label, int start, int end) {}

    private List<MatchSpan> pickCanonicalOptionSequence(List<MatchSpan> spans) {
        if (spans.isEmpty()) {
            return List.of();
        }
        // Prefer sequence starting at last 'A' before 'B' (handles questions that have (A)/(B) in text)
        for (int i = 0; i < spans.size(); i++) {
            if ("A".equals(spans.get(i).label())) {
                List<MatchSpan> seq = new ArrayList<>();
                seq.add(spans.get(i));
                char expected = 'B';
                for (int j = i + 1; j < spans.size() && expected <= 'D'; j++) {
                    if (spans.get(j).label().charAt(0) == expected) {
                        seq.add(spans.get(j));
                        expected++;
                    }
                }
                if (seq.size() >= 2) {
                    return seq;
                }
            }
        }
        return spans.size() <= 4 ? spans : spans.subList(0, 4);
    }

    private int detectAnswerKeyStartLine(List<LineWithPage> lines) {
        for (int i = 0; i < lines.size(); i++) {
            if (ANSWER_KEY_HEADER_PATTERN.matcher(lines.get(i).text()).matches()) {
                return i;
            }
        }
        // Also check compact trailing answer key lines without header at end of document
        for (int i = Math.max(0, lines.size() - 35); i < lines.size(); i++) {
            String t = lines.get(i).text().trim();
            if (t.matches("(?i)^\\d{1,3}\\s*[.):\\-]\\s*[A-D](?:\\s+\\d{1,3}\\s*[.):\\-]\\s*[A-D])+$")) {
                return i;
            }
        }
        return -1;
    }

    private Map<Integer, String> parseAnswerKeyMap(String text) {
        Map<Integer, String> map = new LinkedHashMap<>();
        Matcher m = ANSWER_KEY_ENTRY_PATTERN.matcher(text);
        while (m.find()) {
            int qNum = Integer.parseInt(m.group(1));
            String ans = m.group(2) != null ? m.group(2) : m.group(3);
            if (qNum >= 1 && qNum <= 250 && ans != null) {
                map.put(qNum, ans.toUpperCase(Locale.ROOT));
            }
        }
        return map;
    }

    private Integer matchPartHeader(String line) {
        Matcher m = PART_HEADER_PATTERN.matcher(line);
        if (m.matches() && m.group(1) != null) {
            return Integer.parseInt(m.group(1));
        }
        return null;
    }

    private ParsedPassage findMatchingPassage(List<ParsedPassage> passages, int qNum) {
        for (int i = passages.size() - 1; i >= 0; i--) {
            ParsedPassage p = passages.get(i);
            if (qNum >= p.rangeStart() && qNum <= p.rangeEnd()) {
                return p;
            }
        }
        return null;
    }

    private int inferPartNumber(int activePart, int qNum) {
        if (activePart >= 5 && activePart <= 7) {
            return activePart;
        }
        if (qNum >= 131 && qNum <= 146) {
            return 6;
        }
        if (qNum >= 147 && qNum <= 200) {
            return 7;
        }
        return 5;
    }

    private boolean isListeningPromptLine(String text) {
        if (text == null) {
            return false;
        }
        String low = text.toLowerCase(Locale.ROOT);
        return low.contains("look at the picture") || low.contains("listen to the") || low.contains("you will hear");
    }

    private String classifyPassageType(int partNo, String hint, String content) {
        if (partNo == 6) {
            return "PART6";
        }
        String combined = ((hint == null ? "" : hint) + "\n" + content).toLowerCase(Locale.ROOT);
        int docHeaderHits = 0;
        for (String marker : List.of("document 1", "document 2", "document 3", "e-mail", "email", "memorandum", "memo", "schedule", "invoice", "receipt", "notice", "advertisement", "text message", "form")) {
            if (hint != null && hint.toLowerCase(Locale.ROOT).contains(marker)) {
                docHeaderHits++;
            }
        }
        int explicitDocMarkers = countOccurrences(combined, "document 1") + countOccurrences(combined, "document 2") + countOccurrences(combined, "document 3");
        int fromHeaders = countOccurrences(combined, "\nfrom:") + (combined.startsWith("from:") ? 1 : 0);
        int multiSignal = Math.max(Math.max(docHeaderHits, explicitDocMarkers), fromHeaders);

        if (explicitDocMarkers >= 3 || multiSignal >= 3 || (hint != null && hint.toLowerCase(Locale.ROOT).contains("three"))) {
            return "TRIPLE";
        }
        if (explicitDocMarkers == 2 || multiSignal == 2 || (hint != null && (hint.contains(" and ") || hint.toLowerCase(Locale.ROOT).contains("two")))) {
            return "DOUBLE";
        }
        return "SINGLE";
    }

    private String classifyDocumentKind(String hint, String content) {
        String s = ((hint == null ? "" : hint) + " " + content.substring(0, Math.min(250, content.length()))).toLowerCase(Locale.ROOT);
        if (s.contains("e-mail") || s.contains("email") || s.contains("subject:") || s.contains("from:")) return "EMAIL";
        if (s.contains("memo")) return "MEMO";
        if (s.contains("notice") || s.contains("announcement")) return "NOTICE";
        if (s.contains("advertisement") || s.contains("ad")) return "ADVERTISEMENT";
        if (s.contains("text message") || s.contains("chat")) return "MESSAGE";
        if (s.contains("[table]") || s.contains("schedule") || s.contains("invoice")) return "FORM";
        if (s.contains("article")) return "ARTICLE";
        return "PASSAGE";
    }

    private String extractTablesSummaryJson(String content) {
        Matcher m = TABLE_BLOCK_PATTERN.matcher(content);
        List<String> tables = new ArrayList<>();
        while (m.find()) {
            tables.add(m.group(1).trim());
        }
        if (tables.isEmpty()) {
            return null;
        }
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < tables.size(); i++) {
            if (i > 0) sb.append(",");
            String escaped = tables.get(i).replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
            sb.append("\"").append(escaped).append("\"");
        }
        sb.append("]");
        return sb.toString();
    }

    private List<ParsedPassage> refinePassageClassifications(List<ParsedPassage> passages) {
        return passages;
    }

    private List<ParsedQuestion> reconcileQuestionPartsWithPassages(
            List<ParsedQuestion> questions,
            List<ParsedPassage> passages
    ) {
        Map<String, ParsedPassage> byCode = new LinkedHashMap<>();
        for (ParsedPassage p : passages) {
            byCode.put(p.passageCode(), p);
        }
        List<ParsedQuestion> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (ParsedQuestion q : questions) {
            int pNo = q.partNo();
            if (q.passageCode() != null && byCode.containsKey(q.passageCode())) {
                pNo = byCode.get(q.passageCode()).partNo();
            }
            String uniq = pNo + "|" + q.originalQuestionNumber() + "|" + q.questionText();
            seen.add(uniq);
            out.add(new ParsedQuestion(
                    pNo,
                    q.originalQuestionNumber(),
                    q.pageNumber(),
                    q.questionText(),
                    q.options(),
                    q.passageCode(),
                    q.officialCorrectLabel(),
                    q.answerKeyVerified(),
                    q.extractionConfidence()
            ));
        }
        return out;
    }

    private int countOccurrences(String haystack, String needle) {
        int count = 0;
        int idx = 0;
        while ((idx = haystack.indexOf(needle, idx)) >= 0) {
            count++;
            idx += needle.length();
        }
        return count;
    }
}
