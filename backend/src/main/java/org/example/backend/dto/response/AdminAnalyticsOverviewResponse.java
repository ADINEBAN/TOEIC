package org.example.backend.dto.response;

import lombok.Data;

@Data
public class AdminAnalyticsOverviewResponse {
    private long totalUsers;
    private long activeUsers;
    private long premiumUsers;
    private long usersWithStreak;
    private long totalQuestions;
    private long totalTests;
    private long publishedTests;
    private long totalTestAttempts;
    private double averageAccuracyPercent;
    private int averageToeicScore;
}
