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
            "(?im)^\\s*(?:===\\s*PAGE\\s+\\d+\\s*===\\s*$|(?:SECTION\\s*\\d+\\s*[-:]?\\s*)?PART\\s*([1-7])(?:\\b|(?=Directions)).*)"
    );
    private static final Pattern MULTI_PART_TITLE_PATTERN = Pattern.compile(
            "(?i).*\\bPART\\s*([1-7])\\s*,\\s*[1-7].*"
    );
    private static final Pattern INLINE_OPTION_LABEL_PREFIX = Pattern.compile(
            "^\\s*(?:\\(\\s*([A-D])\\s*\\)|([A-D])\\s*[.)])\\s+(.+)$"
    );
    private static final Pattern PART6_INLINE_BLANK_OPTIONS_PATTERN = Pattern.compile(
            "(?s)\\(\\s*(\\d{1,3})\\s*\\)(?:(?!\\(\\s*\\d{1,3}\\s*\\)).)*?\\(\\s*A\\s*\\)\\s*(.+?)\\s+\\(\\s*B\\s*\\)\\s*(.+?)\\s+\\(\\s*C\\s*\\)\\s*(.+?)\\s+\\(\\s*D\\s*\\)\\s*([^\\r\\n]+?)(?=\\s{2,}|\\s*\\||\\s*[\\u2026_.]{2,}|\\s*\\(\\s*\\d{1,3}\\s*\\)|\\r?\\n|$)"
    );
    private static final Pattern PART6_ALL_INLINE_CHOICES_STRIP = Pattern.compile(
            "\\s*\\(\\s*A\\s*\\)\\s*.+?\\(\\s*B\\s*\\)\\s*.+?\\(\\s*C\\s*\\)\\s*.+?\\(\\s*D\\s*\\)\\s*[^|\\r\\n]+?(?=\\s{2,}|\\s*\\||\\r?\\n|$)"
    );
    private static final Pattern BLANK_MARKER_HINT = Pattern.compile("(?:\\u2026|\\.{3,}|_{2,})");
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
        int highestQNum = 0;

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

            // Detect multi-part title header like "ĐỀ THI TOEIC READING ( PART 5, 6, 7 )"
            Matcher multiTitle = MULTI_PART_TITLE_PATTERN.matcher(trimmed);
            if (multiTitle.matches() && i < 10) {
                int firstPart = Integer.parseInt(multiTitle.group(1));
                if (firstPart >= 5 && firstPart <= 7) {
                    activePart = firstPart;
                }
                continue;
            }

            // Detect PART X headers
            Integer explicitPart = matchPartHeader(trimmed);
            if (explicitPart != null) {
                // Flush open question
                if (curQNum != null) {
                    highestQNum = Math.max(highestQNum, curQNum);
                    finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
                    curQNum = null;
                    curQBodyBuf.setLength(0);
                }
                // Flush open passage
                if (collectingPassage) {
                    highestQNum = Math.max(highestQNum, currentRangeEnd);
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
                    highestQNum = Math.max(highestQNum, curQNum);
                    finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
                    curQNum = null;
                    curQBodyBuf.setLength(0);
                }
                if (collectingPassage) {
                    highestQNum = Math.max(highestQNum, currentRangeEnd);
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
                highestQNum = Math.max(highestQNum, startNum - 1);
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
            boolean isPassageInternalBulletNumber = false;
            if (qStart.matches() && collectingPassage && currentRangeStart > 10) {
                int cand = Integer.parseInt(qStart.group(1));
                if (cand < currentRangeStart) {
                    isPassageInternalBulletNumber = true;
                }
            }

            if (qStart.matches() && !looksLikePassageBlankOnly && !isPassageInternalBulletNumber) {
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
                        highestQNum = Math.max(highestQNum, curQNum);
                        finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
                        curQBodyBuf.setLength(0);
                    }

                    curQNum = candidateNum;
                    highestQNum = Math.max(highestQNum, candidateNum);
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

            // Detect unnumbered question blocks (Word auto-numbering stripped or bare 4-option lines)
            boolean allowUnnumberedPart5 = curQNum == null && !collectingPassage && (activePart == 0 || activePart == 5);
            boolean allowUnnumberedPart7 = (curQNum == null && !collectingPassage && activePart == 7)
                    || (collectingPassage && currentPassagePart == 7);
            if (allowUnnumberedPart5 || allowUnnumberedPart7) {
                UnnumberedBlockMatch block = tryMatchUnnumberedQuestionBlock(
                        allLines, i, contentEndIdx, allowUnnumberedPart7 && collectingPassage || activePart == 7
                );
                if (block != null) {
                    if (collectingPassage) {
                        finalizePassage(currentPassageCode, currentPassagePart, currentPassagePage, currentRangeStart, currentRangeEnd,
                                currentPassageHeaderHint, currentPassageBuf.toString(), passages);
                        collectingPassage = false;
                        currentPassageBuf.setLength(0);
                    }
                    if (curQNum != null) {
                        highestQNum = Math.max(highestQNum, curQNum);
                        finalizeQuestion(curQNum, curQPart, curQPage, curQConf, curQPassageCode, curQBodyBuf.toString(), answerKeys, passages, questions);
                        curQBodyBuf.setLength(0);
                        curQNum = null;
                    }

                    int assignedNum = highestQNum + 1;
                    highestQNum = assignedNum;
                    int resolvedPart = (activePart == 7 || (block.part7Style() && !passages.isEmpty())) ? 7 : 5;
                    String linkedCode = null;
                    if (resolvedPart == 7) {
                        ParsedPassage matched = findMatchingPassage(passages, assignedNum);
                        if (matched == null && !passages.isEmpty()) {
                            ParsedPassage last = passages.get(passages.size() - 1);
                            if (assignedNum >= last.rangeStart() && assignedNum <= last.rangeEnd() + 2) {
                                matched = last;
                            }
                        }
                        if (matched != null) {
                            linkedCode = matched.passageCode();
                            resolvedPart = matched.partNo();
                        }
                    }

                    String officialKey = answerKeys.get(assignedNum);
                    questions.add(new ParsedQuestion(
                            resolvedPart,
                            assignedNum,
                            lp.pageNumber(),
                            block.stem(),
                            block.options(),
                            linkedCode,
                            officialKey,
                            officialKey != null && !officialKey.isBlank(),
                            lp.confidence()
                    ));
                    i = block.lastLineIndex();
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

        // Extract inline Part 6 blanks embedded directly inside passages when no separate numbered choices existed
        extractInlinePart6Questions(passages, questions, answerKeys);

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
        // Prefer sequence starting at last 'A' before 'B' (or handle 2-column swapped A, C, B, D layouts)
        for (int i = 0; i < spans.size(); i++) {
            if ("A".equals(spans.get(i).label())) {
                Map<String, MatchSpan> byLabel = new LinkedHashMap<>();
                byLabel.put("A", spans.get(i));
                for (int j = i + 1; j < spans.size() && byLabel.size() < 4; j++) {
                    String lbl = spans.get(j).label();
                    if (!byLabel.containsKey(lbl)) {
                        byLabel.put(lbl, spans.get(j));
                    }
                }
                if (byLabel.size() >= 3 && byLabel.containsKey("A") && byLabel.containsKey("B") && byLabel.containsKey("C")) {
                    // Preserve original text span order so substring slicing remains valid
                    List<MatchSpan> seq = new ArrayList<>(byLabel.values());
                    seq.sort(Comparator.comparingInt(MatchSpan::start));
                    return seq;
                }
            }
        }
        return spans.size() <= 4 ? spans : spans.subList(0, 4);
    }

    private record UnnumberedBlockMatch(
            String stem,
            List<ParsedOption> options,
            int lastLineIndex,
            boolean part7Style
    ) {}

    private UnnumberedBlockMatch tryMatchUnnumberedQuestionBlock(
            List<LineWithPage> allLines,
            int startIndex,
            int contentEndIdx,
            boolean isPart7Context
    ) {
        String stem = allLines.get(startIndex).text().trim();
        if (stem.isEmpty()) {
            return null;
        }
        if (isPart7Context) {
            if (!(stem.endsWith("?") || stem.endsWith(":")) || stem.length() > 240) {
                return null;
            }
        } else {
            boolean hasBlank = BLANK_MARKER_HINT.matcher(stem).find();
            boolean endsLikeSentence = stem.endsWith(".") || stem.endsWith("?") || stem.endsWith("…") || stem.endsWith("_");
            if (!hasBlank && (!endsLikeSentence || stem.split("\\s+").length < 5)) {
                return null;
            }
        }

        List<Integer> optionLineIndices = new ArrayList<>(4);
        List<String> optionRawLines = new ArrayList<>(4);
        for (int j = startIndex + 1; j < contentEndIdx && optionLineIndices.size() < 4; j++) {
            String candidate = allLines.get(j).text().trim();
            if (candidate.isEmpty()) {
                continue;
            }
            if (matchPartHeader(candidate) != null
                    || PASSAGE_RANGE_PATTERN.matcher(candidate).matches()
                    || SINGLE_PASSAGE_REF_PATTERN.matcher(candidate).matches()
                    || QUESTION_START_PATTERN.matcher(candidate).matches()
                    || ANSWER_KEY_HEADER_PATTERN.matcher(candidate).matches()) {
                return null;
            }
            if (candidate.length() > 130 || BLANK_MARKER_HINT.matcher(candidate).find()) {
                return null;
            }
            if (!isPart7Context && candidate.endsWith("?") && candidate.split("\\s+").length >= 4) {
                return null;
            }
            optionLineIndices.add(j);
            optionRawLines.add(candidate);
        }

        if (optionLineIndices.size() != 4) {
            return null;
        }

        // Reject all-caps titles or passage greeting/header fragments
        if (!isPart7Context && stem.equals(stem.toUpperCase(Locale.ROOT))) {
            return null;
        }

        List<ParsedOption> options = new ArrayList<>(4);
        for (int k = 0; k < 4; k++) {
            String rawOpt = optionRawLines.get(k);
            Matcher prefixMatcher = INLINE_OPTION_LABEL_PREFIX.matcher(rawOpt);
            if (prefixMatcher.matches()) {
                String lbl = prefixMatcher.group(1) != null ? prefixMatcher.group(1) : prefixMatcher.group(2);
                String optText = prefixMatcher.group(3).trim();
                options.add(new ParsedOption(lbl.toUpperCase(Locale.ROOT), optText));
            } else {
                String lbl = String.valueOf((char) ('A' + k));
                options.add(new ParsedOption(lbl, rawOpt));
            }
        }
        options.sort(Comparator.comparing(ParsedOption::optionLabel));

        // Guard against misclassifying Part 7 passage body lines that happen to follow a title ending with '?'
        boolean explicitlyLabeledOptions = optionRawLines.stream().allMatch(l -> INLINE_OPTION_LABEL_PREFIX.matcher(l).matches());
        if (isPart7Context && !explicitlyLabeledOptions) {
            boolean anyEndsWithMultipleSentences = optionRawLines.stream()
                    .anyMatch(l -> l.split("[.!?]\\s+").length > 1 || l.endsWith("."));
            if (anyEndsWithMultipleSentences) {
                return null;
            }
        }

        return new UnnumberedBlockMatch(
                stem,
                options,
                optionLineIndices.get(3),
                isPart7Context
        );
    }

    private void extractInlinePart6Questions(
            List<ParsedPassage> passages,
            List<ParsedQuestion> questions,
            Map<Integer, String> answerKeys
    ) {
        Set<Integer> existingQNums = new LinkedHashSet<>();
        for (ParsedQuestion q : questions) {
            if (q.originalQuestionNumber() != null) {
                existingQNums.add(q.originalQuestionNumber());
            }
        }

        for (int idx = 0; idx < passages.size(); idx++) {
            ParsedPassage p = passages.get(idx);
            if (p.partNo() != 6 || p.content() == null || p.content().isBlank()) {
                continue;
            }

            boolean missingAny = false;
            for (int n = p.rangeStart(); n <= p.rangeEnd(); n++) {
                if (!existingQNums.contains(n)) {
                    missingAny = true;
                    break;
                }
            }
            if (!missingAny) {
                continue;
            }

            Matcher m = PART6_INLINE_BLANK_OPTIONS_PATTERN.matcher(p.content());
            String cleanedPassageText = PART6_ALL_INLINE_CHOICES_STRIP.matcher(p.content())
                    .replaceAll("")
                    .replaceAll("\\[/?TABLE\\]", "")
                    .replaceAll("[ \\t]{2,}", " ")
                    .trim();

            boolean extractedAny = false;
            while (m.find()) {
                int qNum = Integer.parseInt(m.group(1));
                if (qNum < p.rangeStart() || qNum > p.rangeEnd() || existingQNums.contains(qNum)) {
                    continue;
                }
                String optA = m.group(2).trim();
                String optB = m.group(3).trim();
                String optC = m.group(4).trim();
                String optD = extractInlineOptionD(m.group(5), List.of(optA, optB, optC));

                String snippet = buildClauseAroundBlank(cleanedPassageText, qNum);
                String officialKey = answerKeys.get(qNum);
                questions.add(new ParsedQuestion(
                        6,
                        qNum,
                        p.pageNumber(),
                        snippet,
                        List.of(
                                new ParsedOption("A", optA),
                                new ParsedOption("B", optB),
                                new ParsedOption("C", optC),
                                new ParsedOption("D", optD)
                        ),
                        p.passageCode(),
                        officialKey,
                        officialKey != null && !officialKey.isBlank(),
                        0.95
                ));
                existingQNums.add(qNum);
                extractedAny = true;
            }

            if (extractedAny) {
                passages.set(idx, new ParsedPassage(
                        p.passageCode(),
                        p.partNo(),
                        p.passageType(),
                        p.documentKind(),
                        p.pageNumber(),
                        p.rangeStart(),
                        p.rangeEnd(),
                        cleanedPassageText,
                        p.tableJson(),
                        p.linkedPassageCodes()
                ));
            }
        }
    }

    private String extractInlineOptionD(String tail, List<String> earlierOptions) {
        if (tail == null) return "";
        String trimmed = tail.replaceFirst("^\\s+", "");
        Matcher boundary = Pattern.compile("^(.*?)(?:\\s{2,}|\\s*\\||\\s*[\\u2026_.]{2,}|\\s*\\(\\s*\\d{1,3}\\s*\\))").matcher(trimmed);
        if (boundary.find() && !boundary.group(1).isBlank()) {
            return boundary.group(1).trim();
        }
        if (trimmed.split("\\s+").length <= 5 && !trimmed.contains(". ")) {
            return trimmed.replaceAll("[,.;|]+$", "").trim();
        }
        int maxWords = 1;
        for (String o : earlierOptions) {
            int wc = o.trim().isEmpty() ? 0 : o.trim().split("\\s+").length;
            if (wc > maxWords) maxWords = wc;
        }
        String[] words = trimmed.split("\\s+");
        int take = Math.min(words.length, Math.max(1, maxWords));
        return String.join(" ", java.util.Arrays.copyOfRange(words, 0, take)).replaceAll("[,.;|]+$", "").trim();
    }

    private String buildClauseAroundBlank(String cleanedPassage, int qNum) {
        Matcher blankHit = Pattern.compile("[.\\u2026_\\-]*\\(\\s*" + qNum + "\\s*\\)[.\\u2026_\\-]*").matcher(cleanedPassage);
        if (blankHit.find()) {
            int start = Math.max(0, blankHit.start() - 75);
            int end = Math.min(cleanedPassage.length(), blankHit.end() + 75);
            String snippet = cleanedPassage.substring(start, end)
                    .replaceAll("\\s+", " ")
                    .trim();
            return (start > 0 ? "..." : "") + snippet + (end < cleanedPassage.length() ? "..." : "");
        }
        return "Choose the best word or phrase for blank (" + qNum + ") in the passage.";
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
