package org.example.backend.dto.response;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class UserLearningPathCatalogItemResponse {
    private Long id;
    private String code;
    private String title;
    private String description;
    private Integer targetScore;
    private Boolean active;
    private Integer milestoneCount;
    private Integer moduleCount;
    private Long videoLessonCount;
    private Long flashcardCount;
    private Long practiceSetCount;
    private Integer estimatedTotalMinutes;
    private List<String> milestoneTitles;
    private Boolean recommended;
    private Boolean enrolled;
}
