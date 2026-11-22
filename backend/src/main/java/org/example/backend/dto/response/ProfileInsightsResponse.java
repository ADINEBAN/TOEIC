package org.example.backend.dto.response;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class ProfileInsightsResponse {
    private Long userId;
    private String fullName;
    private String username;
    private String bio;
    private String avatarUrl;
    private String equippedFrameId;
    private String equippedAvatarId;
    private String currentLevel;
    private Integer targetScore;
    private Boolean premium;
    private boolean verified;
    private String planTier;
    private LocalDateTime planExpiresAt;
    private int diamonds;
    private int weeklyStudyDiamonds;
    private int level;
    private int learningXp;
    private int currentLevelMinXp;
    private int nextLevelXp;
    private int levelProgressPercent;
    private String levelTitle;
    private int currentStreak;
    private int longestStreak;
    private int totalStudyMinutes;
    private LocalDateTime lastActiveAt;
    private String relationStatus;

    private StudyStats stats;
    private List<AchievementItem> achievements;
    private List<DiamondHistoryItem> recentDiamonds;

    @Data
    public static class StudyStats {
        private int completedLessons;
        private int completedModules;
        private int completedPracticeSets;
        private int submittedTests;
        private int reviewedVocabCount;
        private int masteredVocabCount;
        private int completedVideos;
        private int arenaWins;
        private int arenaLosses;
        private int arenaElo;
        private int totalAchievementsUnlocked;
    }

    @Data
    public static class AchievementItem {
        private String code;
        private String title;
        private String description;
        private String iconName;
        private String accentColor;
        private int rewardDiamonds;
        private int currentProgress;
        private int targetProgress;
        private boolean unlocked;
        private LocalDateTime unlockedAt;
    }

    @Data
    public static class DiamondHistoryItem {
        private Long id;
        private String sourceType;
        private int diamondsDelta;
        private boolean studyReward;
        private String description;
        private LocalDateTime createdAt;
    }
}
