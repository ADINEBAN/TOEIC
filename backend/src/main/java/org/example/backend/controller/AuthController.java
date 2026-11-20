package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.ChangePasswordRequest;
import org.example.backend.dto.request.LoginRequest;
import org.example.backend.dto.request.RefreshTokenRequest;
import org.example.backend.dto.request.RegisterRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.AuthResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.AuthService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@RequestBody RegisterRequest request) {
        return ApiResponseUtil.success(authService.register(request), SuccessCode.USER_CREATED);
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@RequestBody LoginRequest request) {
        return ApiResponseUtil.success(authService.login(request), SuccessCode.LOGIN_SUCCESS);
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader
    ) {
        authService.logout(authorizationHeader);
        return ApiResponseUtil.success(SuccessCode.LOGOUT_SUCCESS);
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@RequestBody RefreshTokenRequest request) {
        return ApiResponseUtil.success(authService.refresh(request), SuccessCode.TOKEN_REFRESHED);
    }

    @PostMapping("/change-password")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            Authentication authentication,
            @RequestBody ChangePasswordRequest request
    ) {
        authService.changePassword(authentication.getName(), request);
        return ApiResponseUtil.success(SuccessCode.PASSWORD_UPDATED);
    }
}
