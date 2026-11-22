package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.AskAIExplainRequest;
import org.example.backend.dto.request.SubmitPracticeAttemptRequest;
import org.example.backend.dto.response.AIExplainResponse;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.PracticeSetResponse;
import org.example.backend.dto.response.UserPracticeAttemptDetailResponse;
import org.example.backend.dto.response.UserPracticeAttemptResponse;
import org.example.backend.dto.response.UserPracticeSetDetailResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.OpenAIAnswerExplainService;
import org.example.backend.service.SubscriptionService;
import org.example.backend.service.UserPracticeService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/users/practice-sets")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
public class UserPracticeController {

    private final UserPracticeService userPracticeService;
    private final OpenAIAnswerExplainService openAIAnswerExplainService;

    @Autowired(required = false)
    private SubscriptionService subscriptionService;

    @GetMapping("/modules/{moduleId}")
    public ResponseEntity<ApiResponse<List<PracticeSetResponse>>> getPracticeSetsByModule(@PathVariable Long moduleId) {
        List<PracticeSetResponse> response = userPracticeService.getPracticeSetsByModule(moduleId);
        return ApiResponseUtil.success(response, SuccessCode.PRACTICE_SET_LISTED);
    }

    @GetMapping("/{practiceSetId}")
    public ResponseEntity<ApiResponse<UserPracticeSetDetailResponse>> getPracticeSetDetail(@PathVariable Long practiceSetId) {
        UserPracticeSetDetailResponse response = userPracticeService.getPracticeSetDetail(practiceSetId);
        return ApiResponseUtil.success(response, SuccessCode.PRACTICE_SET_GET);
    }

    @PostMapping("/{practiceSetId}/start")
    public ResponseEntity<ApiResponse<UserPracticeAttemptResponse>> startPractice(
            Authentication authentication,
            @PathVariable Long practiceSetId
    ) {
        UserPracticeAttemptResponse response = userPracticeService.startPractice(authentication.getName(), practiceSetId);
        return ApiResponseUtil.success(response, SuccessCode.PRACTICE_ATTEMPT_STARTED);
    }

    @PostMapping("/attempts/{attemptId}/submit")
    public ResponseEntity<ApiResponse<UserPracticeAttemptDetailResponse>> submitPractice(
            Authentication authentication,
            @PathVariable Long attemptId,
            @RequestBody SubmitPracticeAttemptRequest request
    ) {
        UserPracticeAttemptDetailResponse response = userPracticeService.submitPractice(authentication.getName(), attemptId, request);
        return ApiResponseUtil.success(response, SuccessCode.PRACTICE_ATTEMPT_SUBMITTED);
    }

    @GetMapping("/attempts")
    public ResponseEntity<ApiResponse<List<UserPracticeAttemptResponse>>> getMyPracticeAttempts(Authentication authentication) {
        List<UserPracticeAttemptResponse> response = userPracticeService.getMyPracticeAttempts(authentication.getName());
        return ApiResponseUtil.success(response, SuccessCode.PRACTICE_ATTEMPT_LISTED);
    }

    @GetMapping("/attempts/{attemptId}/details")
    public ResponseEntity<ApiResponse<UserPracticeAttemptDetailResponse>> getPracticeAttemptDetail(
            Authentication authentication,
            @PathVariable Long attemptId
    ) {
        UserPracticeAttemptDetailResponse response = userPracticeService.getPracticeAttemptDetail(authentication.getName(), attemptId);
        return ApiResponseUtil.success(response, SuccessCode.PRACTICE_ATTEMPT_GET);
    }

    @PostMapping("/questions/explain")
    public ResponseEntity<ApiResponse<AIExplainResponse>> explainPracticeQuestion(
            Authentication authentication,
            @RequestBody AskAIExplainRequest request
    ) {
        if (subscriptionService != null && authentication != null) {
            subscriptionService.consumeQuotaOrThrow(authentication.getName(), SubscriptionService.FEATURE_AI_EXPLAIN);
        }
        String type = request != null && request.getType() != null ? request.getType() : "BOTH";
        AIExplainResponse response = openAIAnswerExplainService.explainPracticeQuestion(
                request != null ? request.getPracticeSetQuestionId() : null,
                request != null ? request.getSelectedAnswer() : null,
                type
        );
        return ApiResponseUtil.success(response, SuccessCode.TEST_QUESTION_EXPLAINED);
    }
}

