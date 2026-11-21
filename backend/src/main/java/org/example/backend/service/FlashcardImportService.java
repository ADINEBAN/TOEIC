package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.FlashcardAiSuggestResponse;
import org.example.backend.dto.response.FlashcardImportResponse;
import org.example.backend.dto.response.FlashcardResponse;
import org.example.backend.entity.Flashcard;
import org.example.backend.entity.LearningModule;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.FlashcardMapper;
import org.example.backend.repository.FlashcardRepository;
import org.example.backend.repository.LearningModuleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class FlashcardImportService {

    private final FlashcardRepository flashcardRepository;
    private final LearningModuleRepository learningModuleRepository;
    private final FlashcardMapper flashcardMapper;
    private final FlashcardImportParser flashcardImportParser;
    private final SmartDictionaryService smartDictionaryService;

    @Transactional
    public FlashcardImportResponse importFromFile(
            Long moduleId,
            MultipartFile file,
            boolean autoFillAi,
            Boolean active
    ) {
        if (moduleId == null || file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        }

        LearningModule module = learningModuleRepository.findById(moduleId)
                .orElseThrow(() -> new AppException(ErrorCode.LEARNING_MODULE_NOT_FOUND));

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_FLASHCARD_DATA);
        }

        List<FlashcardImportParser.ParsedFlashcardRow> parsedRows =
                flashcardImportParser.parse(file.getOriginalFilename(), bytes);

        Set<String> existingWords = new HashSet<>();
        for (Flashcard existing : flashcardRepository.findAllByModuleIdOrderByCreatedAtDesc(moduleId)) {
            if (existing.getEnglishWord() != null) {
                existingWords.add(existing.getEnglishWord().trim().toLowerCase(Locale.ROOT));
            }
        }

        Map<String, FlashcardImportParser.ParsedFlashcardRow> uniqueRows = new LinkedHashMap<>();
        int skippedDuplicates = 0;
        for (FlashcardImportParser.ParsedFlashcardRow row : parsedRows) {
            String key = row.englishWord().trim().toLowerCase(Locale.ROOT);
            if (existingWords.contains(key) || uniqueRows.containsKey(key)) {
                skippedDuplicates++;
                continue;
            }
            uniqueRows.put(key, row);
        }

        Map<String, FlashcardAiSuggestResponse> aiSuggestions = Map.of();
        if (autoFillAi && !uniqueRows.isEmpty()) {
            List<String> needsEnrichment = uniqueRows.values().stream()
                    .filter(r -> isBlank(r.meaningVi()) || isBlank(r.pronunciation()) || isBlank(r.exampleSentence()))
                    .map(FlashcardImportParser.ParsedFlashcardRow::englishWord)
                    .toList();
            if (!needsEnrichment.isEmpty()) {
                aiSuggestions = smartDictionaryService.batchSuggestFlashcards(needsEnrichment);
            }
        }

        boolean cardActive = active == null || active;
        List<Flashcard> toSave = new ArrayList<>(uniqueRows.size());
        int aiEnrichedCount = 0;

        for (Map.Entry<String, FlashcardImportParser.ParsedFlashcardRow> entry : uniqueRows.entrySet()) {
            FlashcardImportParser.ParsedFlashcardRow row = entry.getValue();
            FlashcardAiSuggestResponse ai = aiSuggestions.get(entry.getKey());

            String meaning = firstNonBlank(row.meaningVi(), ai != null ? ai.getMeaningVi() : null);
            String pronunciation = firstNonBlank(row.pronunciation(), ai != null ? ai.getPronunciation() : null);
            String example = firstNonBlank(row.exampleSentence(), ai != null ? ai.getExampleSentence() : null);

            if (ai != null && (
                    (isBlank(row.meaningVi()) && !isBlank(ai.getMeaningVi()))
                            || (isBlank(row.pronunciation()) && !isBlank(ai.getPronunciation()))
                            || (isBlank(row.exampleSentence()) && !isBlank(ai.getExampleSentence()))
            )) {
                aiEnrichedCount++;
            }

            if (isBlank(meaning)) {
                meaning = row.englishWord();
            }

            Flashcard card = new Flashcard();
            card.setModule(module);
            card.setEnglishWord(row.englishWord().trim());
            card.setMeaningVi(meaning);
            card.setPronunciation(pronunciation);
            card.setExampleSentence(example);
            card.setActive(cardActive);
            toSave.add(card);
        }

        List<FlashcardResponse> savedResponses = toSave.isEmpty()
                ? List.of()
                : flashcardMapper.toResponseList(flashcardRepository.saveAll(toSave));

        return FlashcardImportResponse.builder()
                .totalParsed(parsedRows.size())
                .importedCount(savedResponses.size())
                .skippedDuplicateCount(skippedDuplicates)
                .aiEnrichedCount(aiEnrichedCount)
                .items(savedResponses)
                .build();
    }

    private String firstNonBlank(String a, String b) {
        if (!isBlank(a)) return a.trim();
        if (!isBlank(b)) return b.trim();
        return null;
    }

    private boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
