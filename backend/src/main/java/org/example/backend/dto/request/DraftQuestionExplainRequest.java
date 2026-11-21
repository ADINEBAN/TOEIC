package org.example.backend.dto.request;

import lombok.Data;

@Data
public class DraftQuestionExplainRequest {
    private Integer partNo;
    private String questionText;
    private String optionA;
    private String optionB;
    private String optionC;
    private String optionD;
    private String correctLabel;
    private String passageText;
    private String transcript;
    private String explanation;
}
