package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.WeeklyLeaderboardResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.DiamondRewardService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/leaderboard")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class SocialLeaderboardController {

    private final DiamondRewardService diamondRewardService;

    @GetMapping("/weekly")
    public ResponseEntity<ApiResponse<WeeklyLeaderboardResponse>> getWeeklyStudyLeaderboard(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int weekOffset
    ) {
        return ApiResponseUtil.success(
                diamondRewardService.getWeeklyLeaderboard(authentication.getName(), weekOffset),
                SuccessCode.WEEKLY_LEADERBOARD_RETRIEVED
        );
    }
}
