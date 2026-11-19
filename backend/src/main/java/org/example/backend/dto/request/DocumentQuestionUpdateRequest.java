package org.example.backend.dto.request;

import lombok.Data;

import java.util.List;

@Data
public class DocumentQuestionUpdateRequest {
    private Integer partNo;
    private Integer originalQuestionNumber;
    private Integer pageNumber;
    private String questionText;
    private List<OptionItem> options;
    private String officialCorrectLabel;
    private Boolean answerKeyVerified;
    private Long passageId;
    private Boolean included;

    @Data
    public static class OptionItem {
        private String optionLabel;
        private String optionText;
    }
}
