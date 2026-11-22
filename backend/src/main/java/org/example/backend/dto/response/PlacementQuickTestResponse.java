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
public class PlacementQuickTestResponse {
    private List<QuickTestQuestion> questions;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuickTestQuestion {
        private String questionKey;
        private Integer partNo;
        private String skillArea;
        private String questionText;
        private String passageText;
        private String audioUrl;
        private String imageUrl;
        private List<QuickOption> options;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuickOption {
        private String label;
        private String text;
    }
}
