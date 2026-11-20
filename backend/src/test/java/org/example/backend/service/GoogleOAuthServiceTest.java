package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.Request;
import org.example.backend.dto.response.AuthResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.entity.User;
import org.example.backend.enums.AuthProvider;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.UserMapper;
import org.example.backend.repository.UserRepository;
import org.example.backend.security.JwtService;
import org.example.backend.security.TokenBlacklistService;
import org.example.backend.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GoogleOAuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private JwtService jwtService;
    @Mock private TokenBlacklistService tokenBlacklistService;
    @Mock private UserMapper userMapper;
    @Mock private UserLoginStreakService userLoginStreakService;

    private AuthService authService;
    private GoogleOAuthService googleOAuthService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(
                userRepository,
                passwordEncoder,
                authenticationManager,
                jwtService,
                tokenBlacklistService,
                userMapper,
                userLoginStreakService
        );
        googleOAuthService = new GoogleOAuthService(new ObjectMapper()) {
            @Override
            protected Map<String, Object> executeJsonRequest(Request request, String errorMessage) {
                String url = request.url().toString();
                if (url.contains("oauth2.googleapis.com/tokeninfo")) {
                    return Map.of(
                            "sub", "google-sub-123",
                            "email", "Learner@Gmail.com",
                            "email_verified", "true",
                            "name", "Google Learner",
                            "picture", "https://lh3.googleusercontent.com/avatar.png",
                            "aud", "test-client-id"
                    );
                }
                if (url.contains("oauth2.googleapis.com/token")) {
                    return Map.of("id_token", "mock-id-token");
                }
                return Map.of();
            }
        };
        ReflectionTestUtils.setField(googleOAuthService, "googleClientId", "test-client-id");
        ReflectionTestUtils.setField(googleOAuthService, "googleClientSecret", "test-client-secret");
    }

    @Test
    void authorizeUrlRejectsUntrustedRedirectAndBuildsGoogleConsentUrl() {
        assertThrows(AppException.class, () ->
                googleOAuthService.createAuthorizationUrl("http://localhost:8082/api/auth/google/callback", "https://evil.example.com/steal"));

        String authUrl = googleOAuthService.createAuthorizationUrl(
                "http://localhost:8082/api/auth/google/callback",
                "http://localhost:8081"
        );
        assertTrue(authUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
        assertTrue(authUrl.contains("client_id=test-client-id"));
        assertTrue(authUrl.contains("state="));
    }

    @Test
    void handoffCodeIsSingleUseAndRejectsReplay() {
        AuthResponse expected = AuthResponse.builder()
                .accessToken("jwt-access")
                .refreshToken("jwt-refresh")
                .tokenType("Bearer")
                .expiresIn(3600L)
                .build();

        String code = googleOAuthService.issueHandoffCode(expected);
        AuthResponse consumed = googleOAuthService.consumeHandoffCode(code);
        assertEquals("jwt-access", consumed.getAccessToken());
        assertThrows(AppException.class, () -> googleOAuthService.consumeHandoffCode(code));
    }

    @Test
    void authenticateWithGoogleUserCreatesNewGoogleAccountAndLinksExistingAccount() {
        GoogleOAuthService.GoogleUserInfo info = googleOAuthService.verifyGoogleTokens("valid-id-token", null);
        assertEquals("learner@gmail.com", info.email());
        assertEquals("google-sub-123", info.sub());

        when(userRepository.findByEmail("learner@gmail.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) u.setId(42L);
            return u;
        });
        when(jwtService.generateToken(any(UserPrincipal.class))).thenReturn("access-jwt");
        when(jwtService.generateRefreshToken(any(UserPrincipal.class))).thenReturn("refresh-jwt");
        when(jwtService.getJwtExpirationMs()).thenReturn(86400000L);
        when(userMapper.toResponse(any(User.class))).thenReturn(new UserResponse());

        AuthResponse res = authService.authenticateWithGoogleUser(info);
        assertEquals("access-jwt", res.getAccessToken());

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository, atLeastOnce()).save(captor.capture());
        User saved = captor.getValue();
        assertEquals(AuthProvider.GOOGLE, saved.getAuthProvider());
        assertEquals("google-sub-123", saved.getProviderUserId());
        assertNull(saved.getPasswordHash());
        assertEquals(UserRole.USER, saved.getRole());
        assertEquals(UserStatus.ACTIVE, saved.getStatus());
        verify(userLoginStreakService).recordLogin("learner@gmail.com");

        // Locked account cannot sign in via Google
        User locked = new User();
        locked.setEmail("learner@gmail.com");
        locked.setStatus(UserStatus.BLOCKED);
        when(userRepository.findByEmail("learner@gmail.com")).thenReturn(Optional.of(locked));
        AppException ex = assertThrows(AppException.class, () -> authService.authenticateWithGoogleUser(info));
        assertEquals(ErrorCode.ACCOUNT_LOCKED, ex.getErrorCode());
    }
}
