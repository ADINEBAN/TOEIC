package org.example.backend.dto.response;

import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
public class WeeklyLeaderboardResponse {
    private int weekOffset;
    private LocalDate weekStartDate;
    private LocalDate weekEndDate;
    private String weekLabel;
    private long secondsUntilWeekClose;
    private int totalActiveLearners;
    private WeeklyLeaderboardEntry myEntry;
    private List<WeeklyRewardTier> rewardTiers;
    private List<WeeklyLeaderboardEntry> entries;

    @Data
    public static class WeeklyLeaderboardEntry {
        private int rank;
        private Long userId;
        private String fullName;
        private String username;
        private String avatarUrl;
        private String equippedFrameId;
        private int level;
        private int weeklyStudyDiamonds;
        private int totalDiamonds;
        private int activitiesCount;
        private int currentStreak;
        private List<String> topBadgeIcons;
    }

    @Data
    public static class WeeklyRewardTier {
        private String rankLabel;
        private int rewardDiamonds;
        private String badgeTitle;
        private String badgeEmoji;
    }
}
