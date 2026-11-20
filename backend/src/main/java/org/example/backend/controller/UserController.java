package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateUserRequest;
import org.example.backend.dto.request.UpdateProfileRequest;
import org.example.backend.dto.request.UpdateTargetScoreRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.ProfileInsightsResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.dto.response.UserStreakResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.AchievementService;
import org.example.backend.service.UserService;
import org.example.backend.service.UserLoginStreakService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserLoginStreakService userLoginStreakService;

    @Autowired(required = false)
    private AchievementService achievementService;

    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createUser(@RequestBody CreateUserRequest request) {
        return ApiResponseUtil.success(userService.createUser(request), SuccessCode.USER_CREATED);
    }

    @PostMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> createAdmin(@RequestBody CreateUserRequest request) {
        return ApiResponseUtil.success(userService.createAdmin(request), SuccessCode.ADMIN_CREATED);
    }
    
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getAllUsers() {
        List<UserResponse> users = userService.getUserAll();
        return ApiResponseUtil.success(users, SuccessCode.USER_CREATED);
    }

    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<UserResponse>> getMyInfo(Authentication authentication) {
        UserResponse response = userService.getMyInfo(authentication.getName());
        return ApiResponseUtil.success(response, SuccessCode.USER_INFO_RETRIEVED);
    }

    @GetMapping("/me/streak")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<UserStreakResponse>> getMyStreak(Authentication authentication) {
        UserStreakResponse response = userLoginStreakService.getMyStreak(authentication.getName());
        return ApiResponseUtil.success(response, SuccessCode.USER_STREAK_RETRIEVED);
    }

        @PutMapping("/me/target-score")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserResponse>> updateMyTargetScore(
            Authentication authentication,
            @RequestBody UpdateTargetScoreRequest request
    ) {
        UserResponse response = userService.updateMyTargetScore(authentication.getName(), request.getTargetScore());
        return ApiResponseUtil.success(response, SuccessCode.TARGET_SCORE_UPDATED);
    }

    @PutMapping("/me/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<UserResponse>> updateMyProfile(
            Authentication authentication,
            @RequestBody UpdateProfileRequest request
    ) {
        UserResponse response = userService.updateMyProfile(authentication.getName(), request);
        return ApiResponseUtil.success(response, SuccessCode.PROFILE_UPDATED);
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<UserResponse>> uploadMyAvatar(
            Authentication authentication,
            @RequestPart("file") MultipartFile file
    ) {
        UserResponse response = userService.uploadMyAvatar(authentication.getName(), file);
        return ApiResponseUtil.success(response, SuccessCode.AVATAR_UPLOADED);
    }

    @PostMapping("/me/streak/checkin")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<UserStreakResponse>> checkInToday(Authentication authentication) {
        UserStreakResponse response = userLoginStreakService.recordLogin(authentication.getName());
        return ApiResponseUtil.success(response, SuccessCode.STREAK_CHECKED_IN);
    }

    @GetMapping("/me/insights")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<ProfileInsightsResponse>> getMyInsights(Authentication authentication) {
        return ApiResponseUtil.success(achievementService.getMyInsights(authentication.getName()), SuccessCode.ACHIEVEMENTS_RETRIEVED);
    }

    @GetMapping("/{userId}/public-profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<ProfileInsightsResponse>> getPublicProfile(@PathVariable Long userId) {
        return ApiResponseUtil.success(achievementService.getPublicProfile(userId), SuccessCode.ACHIEVEMENTS_RETRIEVED);
    }
}
