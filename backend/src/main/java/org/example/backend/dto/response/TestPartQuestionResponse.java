package org.example.backend.dto.response;

import lombok.Data;

@Data
public class TestPartQuestionResponse {
    private Long id;
    private Long questionId;
    private Integer sortOrder;
    private String questionText;
    private Integer partNo;
    private String difficultyLevel;
    private String audioUrl;
    private String imageUrl;
    private String passageText;
    private String questionGroupCode;
    private java.util.List<QuestionOptionResponse> options;
}

