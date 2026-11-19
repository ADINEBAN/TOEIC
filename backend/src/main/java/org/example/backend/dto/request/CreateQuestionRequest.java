package org.example.backend.dto.request;

import lombok.Data;
import org.example.backend.enums.QuestionSourceType;

import java.util.List;

@Data
public class CreateQuestionRequest {
    private Integer partNo;
    private String questionText;
    private String explanation;
    private String difficultyLevel;
    private QuestionSourceType sourceType;
    private Integer sourceYear;
    private String audioUrl;
    private String imageUrl;
    private String passageText;
    private String transcript;
    private String questionGroupCode;
    private List<CreateQuestionOptionRequest> options;
}

