package org.example.backend.dto.request;

import lombok.Data;
import org.example.backend.enums.ModuleType;

@Data
public class CreateMilestoneQuickModuleRequest {
    private ModuleType moduleType;
    private String title;
    private String description;
    private String thumbnailUrl;
    private Integer estimatedMinutes;
    private String difficultyLevel;
    private Boolean active;
    private Integer sortOrder;
    private Boolean required;
    private String unlockCondition;
}
