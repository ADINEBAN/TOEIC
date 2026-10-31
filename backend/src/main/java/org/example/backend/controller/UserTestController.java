package org.example.backend.controller;

import jakarta.validation.Valid;
import java.util.List;
import org.example.backend.dto.request.SubmitTestAttemptRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.TestAttemptResponse;
import org.example.backend.dto.response.TestResponse;
import org.example.backend.dto.response.UserTestLeaderboardResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.UserTestService;
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

@RestController
@RequestMapping("/users/tests")
public class UserTestController {

    private final UserTestService userTestService;

    public UserTestController(UserTestService userTestService) {
        this.userTestService = userTestService;
    }

    @GetMapping("/published")
    @PreAuthorize("hasAuthority('VIEW_TESTS')")
    public ResponseEntity<ApiResponse<List<TestResponse>>> getPublishedTests() {
        return ResponseEntity.ok(
                ApiResponseUtil.success(SuccessCode.TEST_LISTED, userTestService.getPublishedTests())
        );
    }

    @GetMapping("/{testId}")
    @PreAuthorize("hasAuthority('VIEW_TESTS')")
    public ResponseEntity<ApiResponse<TestResponse>> getPublishedTestDetail(@PathVariable Long testId) {
        return ResponseEntity.ok(
                ApiResponseUtil.success(SuccessCode.TEST_RETRIEVED, userTestService.getPublishedTestDetail(testId))
        );
    }

    @PostMapping("/{testId}/start")
    @PreAuthorize("hasAuthority('SUBMIT_TEST')")
    public ResponseEntity<ApiResponse<TestAttemptResponse>> startAttempt(
            Authentication authentication,
            @PathVariable Long testId
    ) {
        return ResponseEntity.status(SuccessCode.TEST_ATTEMPT_STARTED.getHttpStatus())
                .body(ApiResponseUtil.success(
                        SuccessCode.TEST_ATTEMPT_STARTED,
                        userTestService.startAttempt(authentication.getName(), testId)
                ));
    }

    @PostMapping("/attempts/{attemptId}/submit")
    @PreAuthorize("hasAuthority('SUBMIT_TEST')")
    public ResponseEntity<ApiResponse<TestAttemptResponse>> submitAttempt(
            Authentication authentication,
            @PathVariable Long attemptId,
            @Valid @RequestBody SubmitTestAttemptRequest request
    ) {
        return ResponseEntity.ok(
                ApiResponseUtil.success(
                        SuccessCode.TEST_ATTEMPT_SUBMITTED,
                        userTestService.submitAttempt(authentication.getName(), attemptId, request)
                )
        );
    }

    @GetMapping("/attempts")
    @PreAuthorize("hasAuthority('VIEW_TEST_RESULT')")
    public ResponseEntity<ApiResponse<List<TestAttemptResponse>>> getMyAttempts(
            Authentication authentication,
            @RequestParam(required = false) Long testId
    ) {
        return ResponseEntity.ok(
                ApiResponseUtil.success(
                        SuccessCode.TEST_ATTEMPT_LISTED,
                        userTestService.getMyAttempts(authentication.getName(), testId)
                )
        );
    }

    @GetMapping("/leaderboard")
    @PreAuthorize("hasAuthority('VIEW_TEST_RESULT')")
    public ResponseEntity<ApiResponse<UserTestLeaderboardResponse>> getLeaderboard(
            Authentication authentication,
            @RequestParam(required = false) Long testId,
            @RequestParam(defaultValue = "10") int limit
    ) {
        return ResponseEntity.ok(
                ApiResponseUtil.success(
                        SuccessCode.TEST_LEADERBOARD_LISTED,
                        userTestService.getLeaderboard(authentication.getName(), testId, limit)
                )
        );
    }

    @GetMapping("/attempts/{attemptId}/details")
    @PreAuthorize("hasAuthority('VIEW_TEST_RESULT')")
    public ResponseEntity<ApiResponse<TestAttemptResponse>> getAttemptDetail(
            Authentication authentication,
            @PathVariable Long attemptId
    ) {
        return ResponseEntity.ok(
                ApiResponseUtil.success(
                        SuccessCode.TEST_ATTEMPT_RETRIEVED,
                        userTestService.getAttemptDetail(authentication.getName(), attemptId)
                )
        );
    }
}
