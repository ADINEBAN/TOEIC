package org.example.backend.dto.response;

import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;
import java.util.List;
import org.example.backend.enums.QuestionSourceType;
@Getter
@Setter
public class QuestionResponse {
    private Long id;
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
    private List<QuestionOptionResponse> options;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
