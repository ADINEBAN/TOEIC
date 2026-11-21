package org.example.backend.dto.request;

import lombok.Data;

import java.util.List;

@Data
public class EvaluatePlacementTestRequest {
    private List<QuickAnswerItem> answers;
    private Integer targetScore;

    @Data
    public static class QuickAnswerItem {
        private String questionKey;
        private String selectedLabel;
    }
}
