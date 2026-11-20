package org.example.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.ChangePasswordRequest;
import org.example.backend.dto.request.GoogleCodeExchangeRequest;
import org.example.backend.dto.request.GoogleLoginRequest;
import org.example.backend.dto.request.LoginRequest;
import org.example.backend.dto.request.RefreshTokenRequest;
import org.example.backend.dto.request.RegisterRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.AuthResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.AuthService;
import org.example.backend.service.GoogleOAuthService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final GoogleOAuthService googleOAuthService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@RequestBody RegisterRequest request) {
        return ApiResponseUtil.success(authService.register(request), SuccessCode.USER_CREATED);
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@RequestBody LoginRequest request) {
        return ApiResponseUtil.success(authService.login(request), SuccessCode.LOGIN_SUCCESS);
    }

    @GetMapping("/google/status")
    public ResponseEntity<ApiResponse<Map<String, Object>>> googleStatus() {
        return ApiResponseUtil.success(googleOAuthService.getStatus(), SuccessCode.LOGIN_SUCCESS);
    }

    @GetMapping("/google/authorize")
    public ResponseEntity<Void> authorizeGoogle(
            @RequestParam("redirect_uri") String clientRedirectUri,
            HttpServletRequest request
    ) {
        String callbackUrl = ServletUriComponentsBuilder.fromContextPath(request)
                .path("/auth/google/callback")
                .toUriString();
        String authUrl = googleOAuthService.createAuthorizationUrl(callbackUrl, clientRedirectUri);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, authUrl)
                .build();
    }

    @GetMapping("/google/callback")
    public ResponseEntity<Void> handleGoogleCallback(
            @RequestParam(value = "code", required = false) String code,
            @RequestParam(value = "state", required = false) String state,
            @RequestParam(value = "error", required = false) String error
    ) {
        if (error != null && !error.isBlank()) {
            String redirect = googleOAuthService.extractPendingRedirectUri(state);
            if (redirect != null) {
                String target = googleOAuthService.appendQueryParam(redirect, "googleAuthError", error);
                return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(target)).build();
            }
            return ResponseEntity.badRequest().build();
        }

        GoogleOAuthService.GoogleCallbackResult callbackResult = googleOAuthService.exchangeCallbackCode(code, state);
        AuthResponse authResponse = authService.authenticateWithGoogleUser(callbackResult.userInfo());
        String handoffCode = googleOAuthService.issueHandoffCode(authResponse);
        String target = googleOAuthService.appendQueryParam(callbackResult.clientRedirectUri(), "googleAuthCode", handoffCode);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(target)).build();
    }

    @PostMapping("/google/exchange")
    public ResponseEntity<ApiResponse<AuthResponse>> exchangeGoogleCode(@RequestBody GoogleCodeExchangeRequest request) {
        AuthResponse response = googleOAuthService.consumeHandoffCode(request != null ? request.getCode() : null);
        return ApiResponseUtil.success(response, SuccessCode.LOGIN_SUCCESS);
    }

    @PostMapping("/google")
    public ResponseEntity<ApiResponse<AuthResponse>> loginWithGoogle(@RequestBody GoogleLoginRequest request) {
        GoogleOAuthService.GoogleUserInfo userInfo = googleOAuthService.verifyGoogleTokens(
                request != null ? request.getIdToken() : null,
                request != null ? request.getAccessToken() : null
        );
        return ApiResponseUtil.success(authService.authenticateWithGoogleUser(userInfo), SuccessCode.LOGIN_SUCCESS);
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
