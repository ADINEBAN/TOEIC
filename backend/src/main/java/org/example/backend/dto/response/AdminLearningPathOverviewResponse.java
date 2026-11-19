package org.example.backend.dto.response;

import lombok.Getter;
import lombok.Setter;
import org.example.backend.enums.ModuleType;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
public class AdminLearningPathOverviewResponse {
    private Long id;
    private String code;
    private String title;
    private String description;
    private Integer targetScore;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Integer milestoneCount;
    private Integer moduleCount;
    private Integer estimatedTotalMinutes;
    private Boolean readyForUsers;
    private List<MilestoneNode> milestones;

    @Getter
    @Setter
    public static class MilestoneNode {
        private Long id;
        private Long learningPathId;
        private String title;
        private String description;
        private Integer sortOrder;
        private List<ModuleLinkNode> modules;
    }

    @Getter
    @Setter
    public static class ModuleLinkNode {
        private Long milestoneModuleId;
        private Long milestoneId;
        private Long moduleId;
        private Integer sortOrder;
        private Boolean required;
        private String unlockCondition;
        private String moduleTitle;
        private String moduleDescription;
        private ModuleType moduleType;
        private Integer estimatedMinutes;
        private String difficultyLevel;
        private Boolean moduleActive;
        private Long videoLessonCount;
        private Long flashcardCount;
        private Long practiceSetCount;
    }
}
