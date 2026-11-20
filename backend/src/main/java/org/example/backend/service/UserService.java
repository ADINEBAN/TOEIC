package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateUserRequest;
import org.example.backend.dto.request.UpdateProfileRequest;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final Set<String> ALLOWED_AVATAR_EXTS = Set.of("jpg", "jpeg", "png", "webp");
    private static final long MAX_AVATAR_BYTES = 5L * 1024L * 1024L;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserMapper userMapper;

    @Value("${toeic.storage-dir:./data}")
    private String storageDir = "./data";

    @Autowired(required = false)
    private PlacementOnboardingService placementOnboardingService;

    @Transactional
    public UserResponse createUser(CreateUserRequest request) {
        return createAccountWithRole(request, UserRole.USER);
    }

    @Transactional
    public UserResponse createAdmin(CreateUserRequest request) {
        return createAccountWithRole(request, UserRole.ADMIN);
    }

    private void validateRequest(CreateUserRequest request) {
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

    public List<UserResponse> getUserAll() {
        List<User> users = userRepository.findAll();
        return userMapper.toResponseList(users);
    }

    @Transactional(readOnly = true)
    public UserResponse getMyInfo(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        return userMapper.toResponse(user);
    }

    private UserResponse createAccountWithRole(CreateUserRequest request, UserRole role) {
        validateRequest(request);

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
        user.setRole(role);
        user.setPremium(false);
        user.setStatus(UserStatus.ACTIVE);

        UserProfile profile = new UserProfile();
        profile.setUser(user);
        user.setProfile(profile);

        User savedUser = userRepository.save(user);
        if (savedUser.getUsername() == null || savedUser.getUsername().isBlank()) {
            savedUser.setUsername(generateDefaultUsername(email, savedUser.getId()));
            savedUser = userRepository.save(savedUser);
        }
        return userMapper.toResponse(savedUser);
    }


    @Transactional
    public UserResponse updateMyTargetScore(String email, Integer targetScore) {
        if (targetScore == null || targetScore < 10 || targetScore > 990) {
            throw new AppException(ErrorCode.INVALID_TARGET_SCORE);
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        user.setTargetScore(targetScore);
        User updatedUser = userRepository.save(user);
        if (placementOnboardingService != null) {
            placementOnboardingService.tryAutoAssignForTargetScore(updatedUser);
        }
        return userMapper.toResponse(updatedUser);
    }

    @Transactional
    public UserResponse updateMyProfile(String email, UpdateProfileRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        boolean targetScoreChanged = false;
        if (request.getFullName() != null) {
            user.setFullName(trimToNull(request.getFullName()));
        }
        if (request.getUsername() != null) {
            String rawUsername = request.getUsername().trim().replaceFirst("^@+", "").toLowerCase(Locale.ROOT);
            if (!rawUsername.matches("^[a-z0-9._]{3,30}$")) {
                throw new AppException(ErrorCode.USERNAME_INVALID);
            }
            if (userRepository.existsByUsernameIgnoreCaseAndIdNot(rawUsername, user.getId())) {
                throw new AppException(ErrorCode.USERNAME_TAKEN);
            }
            user.setUsername(rawUsername);
        }
        if (request.getBio() != null) {
            String cleanBio = trimToNull(request.getBio());
            user.setBio(cleanBio != null && cleanBio.length() > 300 ? cleanBio.substring(0, 300) : cleanBio);
        }
        if (request.getAvatarUrl() != null) {
            String nextAvatar = trimToNull(request.getAvatarUrl());
            user.setAvatarUrl(nextAvatar);
            if (nextAvatar == null || !nextAvatar.startsWith("cosmetic://")) {
                user.setEquippedAvatarId(null);
            }
        }
        if (request.getCurrentLevel() != null) {
            user.setCurrentLevel(trimToNull(request.getCurrentLevel()));
        }
        if (request.getTargetScore() != null) {
            if (request.getTargetScore() < 10 || request.getTargetScore() > 990) {
                throw new AppException(ErrorCode.INVALID_TARGET_SCORE);
            }
            user.setTargetScore(request.getTargetScore());
            targetScoreChanged = true;
        }

        User saved = userRepository.save(user);
        if (targetScoreChanged && placementOnboardingService != null) {
            placementOnboardingService.tryAutoAssignForTargetScore(saved);
        }
        return userMapper.toResponse(saved);
    }

    @Transactional
    public UserResponse uploadMyAvatar(String email, MultipartFile file) {
        if (file == null || file.isEmpty() || file.getSize() > MAX_AVATAR_BYTES) {
            throw new AppException(ErrorCode.INVALID_FILE);
        }
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String ext = extractExtension(file.getOriginalFilename(), file.getContentType());
        if (!ALLOWED_AVATAR_EXTS.contains(ext)) {
            throw new AppException(ErrorCode.INVALID_FILE);
        }

        Path avatarDir = Paths.get(storageDir == null || storageDir.isBlank() ? "./data" : storageDir.trim())
                .toAbsolutePath()
                .normalize()
                .resolve("uploads")
                .resolve("avatars");
        try {
            Files.createDirectories(avatarDir);
            String filename = "u" + user.getId() + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12) + "." + ext;
            Path target = avatarDir.resolve(filename);
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
            user.setAvatarUrl("/api/media/avatars/" + filename);
            user.setEquippedAvatarId(null);
            User saved = userRepository.save(user);
            return userMapper.toResponse(saved);
        } catch (IOException ex) {
            throw new AppException(ErrorCode.INVALID_FILE);
        }
    }

    private String generateDefaultUsername(String email, Long userId) {
        String prefix = email != null && email.contains("@") ? email.substring(0, email.indexOf('@')) : "learner";
        String clean = prefix.replaceAll("[^a-zA-Z0-9._]", "_").toLowerCase(Locale.ROOT);
        if (clean.length() < 3) {
            clean = "toeic_" + clean;
        }
        return userId != null ? clean + "_" + userId : clean;
    }

    private String extractExtension(String originalName, String contentType) {
        if (originalName != null && originalName.contains(".")) {
            String ext = originalName.substring(originalName.lastIndexOf('.') + 1).trim().toLowerCase(Locale.ROOT);
            if (!ext.isEmpty()) return ext;
        }
        if (contentType != null) {
            if (contentType.contains("png")) return "png";
            if (contentType.contains("webp")) return "webp";
            if (contentType.contains("jpeg") || contentType.contains("jpg")) return "jpg";
        }
        return "jpg";
    }

}
