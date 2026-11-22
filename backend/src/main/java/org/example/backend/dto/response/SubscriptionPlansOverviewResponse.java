package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SubscriptionPlansOverviewResponse {
    private String currentTier;
    private LocalDateTime planExpiresAt;
    private boolean verified;
    private int diamonds;
    private List<PlanOptionDto> plans;
    private List<QuotaStatusDto> quotas;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PlanOptionDto {
        private String planCode;
        private String tier;
        private String title;
        private String cycleLabel;
        private int durationDays;
        private long priceVnd;
        private int bonusDiamonds;
        private Integer diamondCost;
        private String badgeText;
        private List<String> highlights;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuotaStatusDto {
        private String featureKey;
        private String featureTitle;
        private String periodLabel;
        private int usedCount;
        private int limitCount;
        private boolean unlimited;
        private boolean locked;
    }
}
