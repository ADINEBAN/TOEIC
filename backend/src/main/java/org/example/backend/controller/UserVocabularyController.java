package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.VocabularyReviewRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.VocabularyStudyItemResponse;
import org.example.backend.dto.response.VocabularyTopicSummaryResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.VocabularyReviewService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/users/vocabularies")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
public class UserVocabularyController {

    private final VocabularyReviewService vocabularyReviewService;

    @GetMapping("/topics")
    public ResponseEntity<ApiResponse<List<VocabularyTopicSummaryResponse>>> getTopics(Authentication authentication) {
        String email = authentication != null ? authentication.getName() : null;
        return ApiResponseUtil.success(vocabularyReviewService.getActiveTopics(email), SuccessCode.VOCABULARY_TOPIC_LISTED);
    }

    @GetMapping("/due-today")
    public ResponseEntity<ApiResponse<List<VocabularyStudyItemResponse>>> getDueToday(
            Authentication authentication,
            @RequestParam(required = false) Long topicId,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer limit
    ) {
        return ApiResponseUtil.success(
                vocabularyReviewService.getDueToday(authentication.getName(), topicId, level, q, limit),
                SuccessCode.VOCABULARY_DUE_LISTED
        );
    }

    @GetMapping("/all")
    public ResponseEntity<ApiResponse<List<VocabularyStudyItemResponse>>> getAllWords(
            Authentication authentication,
            @RequestParam(required = false) Long topicId,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer limit
    ) {
        return ApiResponseUtil.success(
                vocabularyReviewService.getAllWords(authentication.getName(), topicId, level, q, limit),
                SuccessCode.VOCABULARY_DUE_LISTED
        );
    }

    @PostMapping("/{vocabularyId}/review")
    public ResponseEntity<ApiResponse<VocabularyStudyItemResponse>> reviewVocabulary(
            Authentication authentication,
            @PathVariable Long vocabularyId,
            @RequestBody VocabularyReviewRequest request
    ) {
        return ApiResponseUtil.success(
                vocabularyReviewService.reviewVocabulary(
                        authentication.getName(),
                        vocabularyId,
                        request != null ? request.getRating() : null
                ),
                SuccessCode.VOCABULARY_REVIEWED
        );
    }
}
