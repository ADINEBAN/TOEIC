package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdaptiveRecommendationResponse {
    private Integer targetScore;
    private String currentLevel;
    private Integer weakestPartNo;
    private Double weakestPartAccuracy;
    private Integer mistakeCount;
    private Long dueVocabCount;
    private Long nextModuleId;
    private String nextModuleTitle;
    private String nextModuleReason;
    private List<Long> prioritizedModuleIds;
    private List<PartAccuracyItem> partAccuracies;
    private List<DailyTaskItem> dailyPlan;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PartAccuracyItem {
        private Integer partNo;
        private long correct;
        private long total;
        private double accuracyPercent;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailyTaskItem {
        private String id;
        private String title;
        private String subtitle;
        private String badge;
        private String route;
    }
}
