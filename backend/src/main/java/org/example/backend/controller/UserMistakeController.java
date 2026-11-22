package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.AskAIExplainRequest;
import org.example.backend.dto.response.AIExplainResponse;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.MistakeItemResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.MistakeBankService;
import org.example.backend.service.OpenAIAnswerExplainService;
import org.example.backend.service.SubscriptionService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/users/mistakes")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
public class UserMistakeController {

    private final MistakeBankService mistakeBankService;
    private final OpenAIAnswerExplainService openAIAnswerExplainService;

    @Autowired(required = false)
    private SubscriptionService subscriptionService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<MistakeItemResponse>>> getMyMistakes(Authentication authentication) {
        return ApiResponseUtil.success(
                mistakeBankService.getMyMistakes(authentication.getName()),
                SuccessCode.MISTAKE_LISTED
        );
    }

    @PostMapping("/explain")
    public ResponseEntity<ApiResponse<AIExplainResponse>> explainMistake(
            Authentication authentication,
            @RequestBody AskAIExplainRequest request
    ) {
        if (subscriptionService != null && authentication != null) {
            subscriptionService.consumeQuotaOrThrow(authentication.getName(), SubscriptionService.FEATURE_AI_EXPLAIN);
        }
        String type = request != null && request.getType() != null ? request.getType() : "BOTH";
        return ApiResponseUtil.success(
                openAIAnswerExplainService.explainRawQuestion(
                        request != null ? request.getQuestionId() : null,
                        request != null ? request.getSelectedAnswer() : null,
                        type
                ),
                SuccessCode.TEST_QUESTION_EXPLAINED
        );
    }
}
