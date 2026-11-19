package org.example.backend.dto.response;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class TestAttemptResponse {
    private Long attemptId;
    private Long testId;
    private String testTitle;
    private LocalDateTime startedAt;
    private LocalDateTime submittedAt;
    private Double score;
    private Integer listeningScore;
    private Integer readingScore;
    private Integer toeicScore;
    private Integer correctCount;
    private Integer totalQuestions;
    private Integer diamondsEarned;
    private Integer currentDiamonds;
    private List<PartScoreBreakdown> partBreakdown;
    private List<QuestionAnswerResult> answers;

    @Data
    public static class PartScoreBreakdown {
        private Integer partNo;
        private String partSection;
        private Integer correctCount;
        private Integer totalCount;
        private Double accuracy;
    }

    @Data
    public static class QuestionAnswerResult {
        private Long testPartQuestionId;
        private Integer partNo;
        private String questionText;
        private String explanation;
        private String difficultyLevel;
        private String sourceType;
        private Integer sourceYear;
        private String audioUrl;
        private String imageUrl;
        private String passageText;
        private String transcript;
        private String questionGroupCode;
        private String selectedLabel;
        private String correctLabel;
        private Boolean correct;
        private List<OptionInfo> options;
    }

    @Data
    public static class OptionInfo {
        private String optionLabel;
        private String optionText;
        private Boolean correct;
    }
}



