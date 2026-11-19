package org.example.backend.dto.response;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class MistakeItemResponse {
    private Long questionId;
    private Integer partNo;
    private String sourceType;
    private String sourceTitle;
    private String questionText;
    private String audioUrl;
    private String imageUrl;
    private String passageText;
    private String transcript;
    private String questionGroupCode;
    private String explanation;
    private String difficultyLevel;
    private String lastSelectedLabel;
    private String correctLabel;
    private Integer wrongCount;
    private LocalDateTime lastWrongAt;
    private List<OptionItem> options;

    @Data
    public static class OptionItem {
        private Long id;
        private String optionLabel;
        private String optionText;
        private Boolean correct;
    }
}
