package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.ChangePasswordRequest;
import org.example.backend.dto.request.LoginRequest;
import org.example.backend.dto.request.RefreshTokenRequest;
import org.example.backend.dto.request.RegisterRequest;
import org.example.backend.dto.response.AuthResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.entity.User;
import org.example.backend.entity.UserProfile;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final TokenBlacklistService tokenBlacklistService;
    private final UserMapper userMapper;
    private final UserLoginStreakService userLoginStreakService;

    @Autowired(required = false)
    private PlacementOnboardingService placementOnboardingService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        validateRegisterRequest(request);

        String email = request.getEmail().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            throw new AppException(ErrorCode.EMAIL_EXISTED);
        }

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword().trim()));
        user.setFullName(trimToNull(request.getFullName()));
        user.setAvatarUrl(trimToNull(request.getAvatarUrl()));
        user.setCurrentLevel(trimToNull(request.getCurrentLevel()));
        user.setTargetScore(request.getTargetScore());
        user.setAuthProvider(AuthProvider.EMAIL);
        user.setRole(UserRole.USER);
        user.setPremium(false);
        user.setStatus(UserStatus.ACTIVE);

        UserProfile profile = new UserProfile();
        profile.setUser(user);
        user.setProfile(profile);

        User savedUser = userRepository.save(user);
        if (savedUser.getUsername() == null || savedUser.getUsername().isBlank()) {
            savedUser.setUsername(DiamondRewardService.resolveUsername(savedUser));
            savedUser = userRepository.save(savedUser);
        }
        if (placementOnboardingService != null && savedUser.getTargetScore() != null) {
            placementOnboardingService.tryAutoAssignForTargetScore(savedUser);
        }
        return buildAuthResponse(savedUser);
    }

    public AuthResponse login(LoginRequest request) {
        if (request == null
                || request.getEmail() == null || request.getEmail().isBlank()
                || request.getPassword() == null || request.getPassword().isBlank()) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }

        String email = request.getEmail().trim().toLowerCase();
        User existing = userRepository.findByEmail(email).orElse(null);
        if (existing != null && (existing.getPasswordHash() == null || existing.getPasswordHash().isBlank())) {
            throw new AppException(ErrorCode.LOGIN_FAIL);
        }
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.getPassword())
            );
        } catch (AuthenticationException ex) {
            throw new AppException(ErrorCode.LOGIN_FAIL);
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        userLoginStreakService.recordLogin(user.getEmail());
        return buildAuthResponse(user);
    }

    @Transactional
    public AuthResponse authenticateWithGoogleUser(GoogleOAuthService.GoogleUserInfo googleUser) {
        if (googleUser == null || googleUser.email() == null || googleUser.email().isBlank()) {
            throw new AppException(ErrorCode.LOGIN_FAIL);
        }
        String email = googleUser.email().trim().toLowerCase();
        User user = userRepository.findByEmail(email).orElse(null);

        if (user == null) {
            User created = new User();
            created.setEmail(email);
            created.setPasswordHash(null);
            created.setFullName(trimToNull(googleUser.fullName()));
            created.setAvatarUrl(trimToNull(googleUser.avatarUrl()));
            created.setAuthProvider(AuthProvider.GOOGLE);
            created.setProviderUserId(trimToNull(googleUser.sub()));
            created.setRole(UserRole.USER);
            created.setPremium(false);
            created.setStatus(UserStatus.ACTIVE);

            UserProfile profile = new UserProfile();
            profile.setUser(created);
            created.setProfile(profile);

            user = userRepository.save(created);
            if (user.getUsername() == null || user.getUsername().isBlank()) {
                user.setUsername(DiamondRewardService.resolveUsername(user));
                user = userRepository.save(user);
            }
        } else {
            if (user.getStatus() != UserStatus.ACTIVE) {
                throw new AppException(ErrorCode.ACCOUNT_LOCKED);
            }
            boolean dirty = false;
            if ((user.getProviderUserId() == null || user.getProviderUserId().isBlank())
                    && googleUser.sub() != null && !googleUser.sub().isBlank()) {
                user.setProviderUserId(googleUser.sub().trim());
                dirty = true;
            }
            if ((user.getAvatarUrl() == null || user.getAvatarUrl().isBlank())
                    && googleUser.avatarUrl() != null && !googleUser.avatarUrl().isBlank()) {
                user.setAvatarUrl(googleUser.avatarUrl().trim());
                dirty = true;
            }
            if ((user.getFullName() == null || user.getFullName().isBlank())
                    && googleUser.fullName() != null && !googleUser.fullName().isBlank()) {
                user.setFullName(googleUser.fullName().trim());
                dirty = true;
            }
            if (user.getUsername() == null || user.getUsername().isBlank()) {
                user.setUsername(DiamondRewardService.resolveUsername(user));
                dirty = true;
            }
            if (dirty) {
                user = userRepository.save(user);
            }
        }

        userLoginStreakService.recordLogin(user.getEmail());
        return buildAuthResponse(user);
    }

    public AuthResponse refresh(RefreshTokenRequest request) {
        if (request == null || request.getRefreshToken() == null || request.getRefreshToken().isBlank()) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        String token = extractBearerToken(request.getRefreshToken());
        if (tokenBlacklistService.isTokenRevoked(token)) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        String username;
        try {
            username = jwtService.extractUsername(token);
        } catch (RuntimeException ex) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        if (username == null || !jwtService.isRefreshTokenValid(token, username)) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }

        User user = userRepository.findByEmail(username)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new AppException(ErrorCode.ACCOUNT_LOCKED);
        }

        tokenBlacklistService.revokeToken(token);
        return buildAuthResponse(user);
    }

    @Transactional
    public void changePassword(String email, ChangePasswordRequest request) {
        if (request == null
                || request.getCurrentPassword() == null || request.getCurrentPassword().isBlank()
                || request.getNewPassword() == null || request.getNewPassword().trim().length() < 6) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        if (user.getPasswordHash() == null
                || !passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new AppException(ErrorCode.INVALID_PASSWORD);
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword().trim()));
        userRepository.save(user);
    }

    public void logout(String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);

        String username = jwtService.extractUsername(token);
        if (username == null || !jwtService.isTokenValid(token, username)) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }

        tokenBlacklistService.revokeToken(token);
    }

    private AuthResponse buildAuthResponse(User user) {
        UserPrincipal principal = new UserPrincipal(user);
        String token = jwtService.generateToken(principal);
        String refreshToken = jwtService.generateRefreshToken(principal);
        UserResponse userResponse = userMapper.toResponse(user);

        return AuthResponse.builder()
                .accessToken(token)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtService.getJwtExpirationMs())
                .user(userResponse)
                .build();
    }

    private void validateRegisterRequest(RegisterRequest request) {
        if (request == null
                || request.getEmail() == null || request.getEmail().isBlank()
                || request.getPassword() == null || request.getPassword().isBlank()) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String extractBearerToken(String authorizationHeader) {
        if (authorizationHeader == null) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }

        String value = authorizationHeader.trim();
        if (value.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }

        while (value.regionMatches(true, 0, "Bearer ", 0, 7)) {
            value = value.substring(7).trim();
        }

        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            value = value.substring(1, value.length() - 1).trim();
        }

        String token = value;
        if (token.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        return token;
    }
}

