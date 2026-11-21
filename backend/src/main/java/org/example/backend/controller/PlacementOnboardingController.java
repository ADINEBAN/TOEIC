package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.AssignLearningPathRequest;
import org.example.backend.dto.request.EvaluatePlacementTestRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.PlacementEvaluationResponse;
import org.example.backend.dto.response.PlacementQuickTestResponse;
import org.example.backend.dto.response.UserLearningPathResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.PlacementOnboardingService;
import org.example.backend.service.PlacementQuickTestService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/placement-onboarding")
@RequiredArgsConstructor
public class PlacementOnboardingController {

    private final PlacementOnboardingService placementOnboardingService;
    private final PlacementQuickTestService placementQuickTestService;

    @GetMapping("/quick-test")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<PlacementQuickTestResponse>> getQuickPlacementTest() {
        return ApiResponseUtil.success(placementQuickTestService.buildQuickTest(), SuccessCode.LEARNING_PATH_LISTED);
    }

    @PostMapping("/evaluate-test")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<PlacementEvaluationResponse>> evaluateQuickPlacementTest(
            Authentication authentication,
            @RequestBody EvaluatePlacementTestRequest request
    ) {
        PlacementEvaluationResponse response = placementQuickTestService.evaluateTest(authentication.getName(), request);
        return ApiResponseUtil.success(response, SuccessCode.LEARNING_PATH_ASSIGNED);
    }

    @PostMapping("/assign-path")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<UserLearningPathResponse>> assignRecommendedPath(
            Authentication authentication,
            @RequestBody(required = false) AssignLearningPathRequest request
    ) {
        Long learningPathId = request == null ? null : request.getLearningPathId();
        Integer targetScore = request == null ? null : request.getTargetScore();
        UserLearningPathResponse response = placementOnboardingService.assignRecommendedLearningPath(
                authentication.getName(),
                learningPathId,
                targetScore
        );
        return ApiResponseUtil.success(response, SuccessCode.LEARNING_PATH_ASSIGNED);
    }
}

