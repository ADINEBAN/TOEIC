package org.example.backend.dto.response;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class AdminAnalyticsOverviewResponse {
    private long totalUsers;
    private long activeUsers;
    private long blockedUsers;
    private long verifiedUsers;
    private long freeUsers;
    private long plusUsers;
    private long proUsers;
    private long premiumUsers;
    private long usersWithStreak;
    private long totalQuestions;
    private long totalTests;
    private long publishedTests;
    private long totalTestAttempts;
    private long attemptsLast7Days;
    private double averageAccuracyPercent;
    private int averageToeicScore;
    private int highestToeicScore;
    private long bandUnder450;
    private long band450To649;
    private long band650To849;
    private long band850Plus;
    private long paidOrdersCount;
    private long pendingOrdersCount;
    private long totalRevenueVnd;
    private long revenueLast30DaysVnd;
    private List<RecentOrderSummary> recentPaidOrders = new ArrayList<>();

    @Data
    public static class RecentOrderSummary {
        private String orderCode;
        private String userEmail;
        private String userName;
        private String planCode;
        private String planTier;
        private long amountVnd;
        private LocalDateTime paidAt;
    }
}
