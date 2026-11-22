package org.example.backend.dto.response;

import lombok.Data;
import java.time.LocalDateTime;
import org.example.backend.enums.AuthProvider;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
@Data
public class UserResponse {
    private Long id;
    private String email;
    private String fullName;
    private String username;
    private String bio;
    private String avatarUrl;
    private String equippedFrameId;
    private String equippedAvatarId;
    private AuthProvider authProvider;
    private String providerUserId;
    private String currentLevel;
    private Integer targetScore;
    private Boolean premium;
    private Boolean verified;
    private String planTier;
    private LocalDateTime planExpiresAt;
    private Integer diamonds;
    private Integer arenaWins;
    private Integer arenaLosses;
    private Integer arenaElo;
    private Integer learningXp;
    private Integer totalStudyMinutes;
    private Integer level;
    private Integer currentLevelMinXp;
    private Integer nextLevelXp;
    private Integer levelProgressPercent;
    private String levelTitle;
    private UserRole role;
    private UserStatus status;
    private Long profileId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
