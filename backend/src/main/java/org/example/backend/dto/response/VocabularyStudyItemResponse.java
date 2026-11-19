package org.example.backend.dto.response;

import lombok.Data;
import org.example.backend.enums.VocabularyStatus;

import java.time.LocalDateTime;

@Data
public class VocabularyStudyItemResponse {
    private Long vocabularyId;
    private Long topicId;
    private String topicName;
    private String word;
    private String ipa;
    private String audioUrl;
    private String meaningVi;
    private String meaningEn;
    private String exampleSentence;
    private String exampleTranslation;
    private String partOfSpeech;
    private String difficultyLevel;
    private Integer familiarityLevel;
    private Double easeFactor;
    private Integer intervalDays;
    private Integer repetitions;
    private LocalDateTime lastReviewedAt;
    private LocalDateTime nextReviewAt;
    private VocabularyStatus status;
    private Integer diamondsEarned;
    private Integer currentDiamonds;
}
