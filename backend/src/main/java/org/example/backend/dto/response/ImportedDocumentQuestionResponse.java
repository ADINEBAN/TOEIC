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
public class ImportedDocumentQuestionResponse {
    private Long id;
    private Long passageId;
    private String passageCode;
    private Integer partNo;
    private Integer originalQuestionNumber;
    private Integer pageNumber;
    private String questionText;
    private List<OptionDto> options;
    private String officialCorrectLabel;
    private Boolean answerKeyVerified;
    private String aiSuggestedLabel;
    private String aiSuggestedExplanation;
    private Double extractionConfidence;
    private String validationStatus;
    private List<String> validationIssues;
    private Boolean included;
    private Long savedQuestionId;
    private Integer sortOrder;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OptionDto {
        private String optionLabel;
        private String optionText;
    }
}
