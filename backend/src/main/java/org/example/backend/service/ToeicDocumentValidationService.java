package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.ImportedDocumentQuestionResponse;
import org.example.backend.entity.ImportedDocument;
import org.example.backend.entity.ImportedDocumentPassage;
import org.example.backend.entity.ImportedDocumentQuestion;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

@Service
@RequiredArgsConstructor
public class ToeicDocumentValidationService {

    private final ObjectMapper objectMapper;

    public Map<String, Object> validateAndAnnotate(
            ImportedDocument doc,
            List<ImportedDocumentPassage> passages,
            List<ImportedDocumentQuestion> questions,
            Map<Integer, String> extractedAnswerKeys,
            List<String> parserNotices
    ) {
        String normalizedSource = normalizeForFidelity(doc.getRawExtractedText());
        Map<Integer, List<ImportedDocumentQuestion>> byNumber = new HashMap<>();
        Map<String, List<ImportedDocumentQuestion>> byStem = new HashMap<>();
        Set<Long> passageIdsWithQuestions = new LinkedHashSet<>();

        for (ImportedDocumentQuestion q : questions) {
            if (q.getOriginalQuestionNumber() != null) {
                byNumber.computeIfAbsent(q.getOriginalQuestionNumber(), k -> new ArrayList<>()).add(q);
            }
            String normStem = normalizeForFidelity(q.getQuestionText());
            if (!normStem.isBlank()) {
                byStem.computeIfAbsent(normStem, k -> new ArrayList<>()).add(q);
            }
            if (q.getPassage() != null && q.getPassage().getId() != null) {
                passageIdsWithQuestions.add(q.getPassage().getId());
            }
        }

        int validCount = 0;
        int warningCount = 0;
        int invalidCount = 0;
        int unverifiedCount = 0;
        int brokenLinksCount = 0;
        int duplicateCount = 0;
        int missingChoicesCount = 0;
        List<String> docIssues = new ArrayList<>();

        if (parserNotices != null) {
            docIssues.addAll(parserNotices);
        }

        // Check orphaned/broken passages (missing paragraph or unlinked passage)
        for (ImportedDocumentPassage p : passages) {
            String pContent = p.getContent() == null ? "" : p.getContent().trim();
            if (pContent.length() < 20) {
                docIssues.add("Passage " + p.getPassageCode() + " appears incomplete or missing paragraphs.");
            }
            if (p.getId() != null && !passageIdsWithQuestions.contains(p.getId())) {
                docIssues.add("Passage " + p.getPassageCode() + " (Part " + p.getPartNo() + ") has no linked questions.");
                brokenLinksCount++;
            }
        }

        // Check missing question sequence per document numbering
        TreeSet<Integer> sortedNums = new TreeSet<>();
        for (ImportedDocumentQuestion q : questions) {
            if (q.getOriginalQuestionNumber() != null && q.getOriginalQuestionNumber() > 0) {
                sortedNums.add(q.getOriginalQuestionNumber());
            }
        }
        List<Integer> missingNumbers = new ArrayList<>();
        Integer prevNum = null;
        for (Integer cur : sortedNums) {
            if (prevNum != null && cur - prevNum > 1 && cur - prevNum <= 8) {
                for (int miss = prevNum + 1; miss < cur; miss++) {
                    missingNumbers.add(miss);
                }
            }
            prevNum = cur;
        }
        if (!missingNumbers.isEmpty()) {
            docIssues.add("Potential missing question numbers in sequence: " + missingNumbers);
        }

        // Check answer key orphaned mappings
        if (extractedAnswerKeys != null && !extractedAnswerKeys.isEmpty()) {
            List<Integer> orphanKeys = new ArrayList<>();
            for (Integer keyQNum : extractedAnswerKeys.keySet()) {
                if (!sortedNums.contains(keyQNum)) {
                    orphanKeys.add(keyQNum);
                }
            }
            if (!orphanKeys.isEmpty()) {
                docIssues.add("Answer key contains numbers without extracted questions: " + orphanKeys);
            }
        }

        // Validate every single extracted question
        for (ImportedDocumentQuestion q : questions) {
            List<String> issues = new ArrayList<>();
            boolean hasError = false;
            boolean hasWarning = false;

            if (q.getPartNo() == null || q.getPartNo() < 5 || q.getPartNo() > 7) {
                issues.add("INVALID_PART: Only TOEIC Parts 5, 6, and 7 are supported.");
                hasError = true;
            }

            List<ImportedDocumentQuestionResponse.OptionDto> opts = parseOptions(q.getOptionsJson());
            if (opts.size() < 4) {
                issues.add("MISSING_CHOICES: Found " + opts.size() + " choices (expected A, B, C, D).");
                missingChoicesCount++;
                hasError = true;
            } else {
                for (ImportedDocumentQuestionResponse.OptionDto opt : opts) {
                    if (opt.getOptionText() == null || opt.getOptionText().isBlank()) {
                        issues.add("EMPTY_CHOICE: Option (" + opt.getOptionLabel() + ") is blank.");
                        hasError = true;
                    }
                }
            }

            if (q.getOriginalQuestionNumber() != null) {
                List<ImportedDocumentQuestion> sameNum = byNumber.getOrDefault(q.getOriginalQuestionNumber(), List.of());
                if (sameNum.size() > 1) {
                    issues.add("DUPLICATE_NUMBER: Question #" + q.getOriginalQuestionNumber() + " appears " + sameNum.size() + " times.");
                    duplicateCount++;
                    hasWarning = true;
                }
            }

            String normStem = normalizeForFidelity(q.getQuestionText());
            if (!normStem.isBlank() && byStem.getOrDefault(normStem, List.of()).size() > 1) {
                issues.add("DUPLICATE_TEXT: Duplicate question stem detected.");
                duplicateCount++;
                hasWarning = true;
            }

            if ((q.getPartNo() == 6 || q.getPartNo() == 7) && q.getPassage() == null) {
                issues.add("BROKEN_PASSAGE_LINK: Part " + q.getPartNo() + " question is missing an associated passage.");
                brokenLinksCount++;
                hasWarning = true;
            }

            if (q.getExtractionConfidence() != null && q.getExtractionConfidence() < 0.72) {
                issues.add("OCR_LOW_CONFIDENCE: OCR confidence is below 72%, verify text manually.");
                hasWarning = true;
            }
            if ((q.getQuestionText() != null && q.getQuestionText().contains("\uFFFD"))) {
                issues.add("OCR_GARBAGE_CHARS: Unusual symbols detected in question text.");
                hasWarning = true;
            }

            if (!Boolean.TRUE.equals(q.getAnswerKeyVerified())) {
                issues.add("UNVERIFIED_ANSWER_KEY: Original document has no official answer key for this question.");
                unverifiedCount++;
                hasWarning = true;
            } else if (q.getOfficialCorrectLabel() == null || !q.getOfficialCorrectLabel().matches("[A-D]")) {
                issues.add("INVALID_ANSWER_KEY: Answer key label is outside A-D.");
                hasWarning = true;
            }

            // Strict Source Fidelity check against raw extracted text (ignore synthesized Part 6 default helper prompt)
            if (!normalizedSource.isBlank()
                    && normStem.length() >= 18
                    && !normStem.startsWith("choose the best word or phrase for blank")) {
                if (!isGroundedInSource(normStem, normalizedSource)) {
                    issues.add("FIDELITY_WARNING: Question text differs from raw extracted source tokens.");
                    hasWarning = true;
                }
            }

            String status;
            if (hasError) {
                status = "INVALID";
                invalidCount++;
            } else if (hasWarning) {
                status = "WARNING";
                warningCount++;
            } else {
                status = "VALID";
                validCount++;
            }

            q.setValidationStatus(status);
            try {
                q.setValidationIssuesJson(objectMapper.writeValueAsString(issues));
            } catch (Exception ignored) {
                q.setValidationIssuesJson("[]");
            }
        }

        if (questions.isEmpty()) {
            docIssues.add("INCOMPLETE_EXTRACTION: No TOEIC Part 5, 6, or 7 questions were identified.");
        }

        Map<Integer, Integer> partCounts = new LinkedHashMap<>();
        partCounts.put(5, 0);
        partCounts.put(6, 0);
        partCounts.put(7, 0);
        for (ImportedDocumentQuestion q : questions) {
            if (q.getPartNo() != null && partCounts.containsKey(q.getPartNo())) {
                partCounts.put(q.getPartNo(), partCounts.get(q.getPartNo()) + 1);
            }
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalQuestions", questions.size());
        summary.put("totalPassages", passages.size());
        summary.put("partCounts", partCounts);
        summary.put("validCount", validCount);
        summary.put("warningCount", warningCount);
        summary.put("invalidCount", invalidCount);
        summary.put("unverifiedAnswerCount", unverifiedCount);
        summary.put("brokenPassageLinksCount", brokenLinksCount);
        summary.put("duplicateCount", duplicateCount);
        summary.put("missingChoicesCount", missingChoicesCount);
        summary.put("missingNumbersInSequence", missingNumbers);
        summary.put("issues", docIssues);
        return summary;
    }

    private boolean isGroundedInSource(String normStem, String normalizedSource) {
        if (normalizedSource.contains(normStem)) {
            return true;
        }
        String[] tokens = normStem.split("\\s+");
        if (tokens.length == 0) {
            return false;
        }
        int matched = 0;
        for (String tok : tokens) {
            if (tok.length() <= 1 || normalizedSource.contains(tok)) {
                matched++;
            }
        }
        return ((double) matched / (double) tokens.length) >= 0.72;
    }

    private String normalizeForFidelity(String text) {
        if (text == null) {
            return "";
        }
        return text.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private List<ImportedDocumentQuestionResponse.OptionDto> parseOptions(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return Collections.emptyList();
        }
    }
}
