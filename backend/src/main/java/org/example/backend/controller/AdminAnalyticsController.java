package org.example.backend.controller;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.AdminAnalyticsOverviewResponse;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.enums.UserStatus;
import org.example.backend.service.AdminAnalyticsService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminAnalyticsController {

    private final AdminAnalyticsService adminAnalyticsService;

    @GetMapping("/analytics/overview")
    public ResponseEntity<ApiResponse<AdminAnalyticsOverviewResponse>> getOverview() {
        return ApiResponseUtil.success(adminAnalyticsService.getOverview(), SuccessCode.ANALYTICS_RETRIEVED);
    }

    @PatchMapping("/users/{userId}/status")
    public ResponseEntity<ApiResponse<UserResponse>> updateUserStatus(
            @PathVariable Long userId,
            @RequestBody StatusPatchRequest request
    ) {
        return ApiResponseUtil.success(
                adminAnalyticsService.updateUserStatus(userId, request != null ? request.getStatus() : null),
                SuccessCode.USER_STATUS_UPDATED
        );
    }

    @PatchMapping("/users/{userId}/premium")
    public ResponseEntity<ApiResponse<UserResponse>> updateUserPremium(
            @PathVariable Long userId,
            @RequestBody PremiumPatchRequest request
    ) {
        return ApiResponseUtil.success(
                adminAnalyticsService.updateUserPremium(userId, request != null ? request.getPremium() : null),
                SuccessCode.USER_PREMIUM_UPDATED
        );
    }

    @PatchMapping("/users/{userId}/verified")
    public ResponseEntity<ApiResponse<UserResponse>> updateUserVerified(
            @PathVariable Long userId,
            @RequestBody VerifiedPatchRequest request
    ) {
        return ApiResponseUtil.success(
                adminAnalyticsService.updateUserVerified(userId, request != null ? request.getVerified() : null),
                SuccessCode.USER_VERIFIED_UPDATED
        );
    }

    @Data
    public static class StatusPatchRequest {
        private UserStatus status;
    }

    @Data
    public static class PremiumPatchRequest {
        private Boolean premium;
    }

    @Data
    public static class VerifiedPatchRequest {
        private Boolean verified;
    }
}
