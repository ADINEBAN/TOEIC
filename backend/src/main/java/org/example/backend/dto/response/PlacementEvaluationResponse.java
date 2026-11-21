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
public class PlacementEvaluationResponse {
    private int correctCount;
    private int totalQuestions;
    private double accuracyPercent;
    private int estimatedScore;
    private int recommendedTargetScore;
    private String levelLabel;
    private Long recommendedPathId;
    private String recommendedPathTitle;
    private List<PartBreakdownItem> partBreakdown;
    private List<String> weakAreas;
    private List<String> strengths;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PartBreakdownItem {
        private Integer partNo;
        private String skillArea;
        private int correct;
        private int total;
        private double accuracyPercent;
    }
}
