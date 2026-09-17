package org.example.backend.controller;

import jakarta.validation.Valid;
import java.util.List;
import org.example.backend.dto.request.CreateUserRequest;
import org.example.backend.dto.request.UpdateTargetScoreRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.UserService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    @PreAuthorize("hasAuthority('CREATE_USER')")
    public ResponseEntity<ApiResponse<UserResponse>> createUser(@Valid @RequestBody CreateUserRequest request) {
        UserResponse response = userService.createUser(request);
        return ResponseEntity.status(SuccessCode.USER_CREATED.getHttpStatus())
                .body(ApiResponseUtil.success(SuccessCode.USER_CREATED, response));
    }

    @PostMapping("/admin")
    @PreAuthorize("hasAuthority('CREATE_ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> createAdmin(@Valid @RequestBody CreateUserRequest request) {
        UserResponse response = userService.createAdmin(request);
        return ResponseEntity.status(SuccessCode.ADMIN_CREATED.getHttpStatus())
                .body(ApiResponseUtil.success(SuccessCode.ADMIN_CREATED, response));
    }

    @GetMapping
    @PreAuthorize("hasAuthority('VIEW_USERS')")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getAllUsers() {
        List<UserResponse> response = userService.getAllUsers();
        return ResponseEntity.ok(ApiResponseUtil.success(SuccessCode.USERS_RETRIEVED, response));
    }

    @GetMapping("/me")
    @PreAuthorize("hasAuthority('VIEW_PROFILE')")
    public ResponseEntity<ApiResponse<UserResponse>> getMyInfo(Authentication authentication) {
        UserResponse response = userService.getUserByEmail(authentication.getName());
        return ResponseEntity.ok(ApiResponseUtil.success(SuccessCode.USER_INFO_RETRIEVED, response));
    }

    @PatchMapping("/me/target-score")
    @PreAuthorize("hasAuthority('VIEW_PROFILE')")
    public ResponseEntity<ApiResponse<UserResponse>> updateMyTargetScore(
            Authentication authentication,
            @Valid @RequestBody UpdateTargetScoreRequest request
    ) {
        UserResponse response = userService.updateMyTargetScore(authentication.getName(), request);
        return ResponseEntity.ok(ApiResponseUtil.success(SuccessCode.USER_TARGET_SCORE_UPDATED, response));
    }
}
