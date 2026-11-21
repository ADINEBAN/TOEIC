package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.dto.response.QuestionImportResponse;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.entity.Question;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.QuestionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class QuestionImportService {

    private final QuestionImportParser questionImportParser;
    private final AdminQuestionBankService adminQuestionBankService;
    private final QuestionRepository questionRepository;
    private final OpenAIAnswerExplainService openAIAnswerExplainService;

    @Transactional
    public QuestionImportResponse importFromFile(
            MultipartFile file,
            Integer defaultPartNo,
            boolean autoExplainAi
    ) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        List<CreateQuestionRequest> parsed =
                questionImportParser.parse(file.getOriginalFilename(), bytes, defaultPartNo);

        Set<String> existingKeys = new HashSet<>();
        for (Question existing : questionRepository.findAllByOrderByCreatedAtDesc()) {
            existingKeys.add(dedupKey(existing.getPartNo(), existing.getQuestionText()));
        }

        List<CreateQuestionRequest> uniqueRequests = new ArrayList<>();
        int skippedDuplicates = 0;
        for (CreateQuestionRequest req : parsed) {
            String key = dedupKey(req.getPartNo(), req.getQuestionText());
            if (existingKeys.add(key)) {
                uniqueRequests.add(req);
            } else {
                skippedDuplicates++;
            }
        }

        int aiExplainedCount = 0;
        if (autoExplainAi && !uniqueRequests.isEmpty()) {
            aiExplainedCount = openAIAnswerExplainService.batchFillMissingExplanations(uniqueRequests);
        }

        List<QuestionResponse> saved = uniqueRequests.isEmpty()
                ? List.of()
                : adminQuestionBankService.bulkCreateQuestions(uniqueRequests);

        return QuestionImportResponse.builder()
                .totalParsed(parsed.size())
                .importedCount(saved.size())
                .skippedDuplicateCount(skippedDuplicates)
                .aiExplainedCount(aiExplainedCount)
                .items(saved)
                .build();
    }

    private String dedupKey(Integer partNo, String questionText) {
        String normText = questionText == null
                ? ""
                : questionText.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        return (partNo == null ? 0 : partNo) + "|" + normText;
    }
}
