package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class VocabularyTopicSummaryResponse {
    private Long id;
    private String name;
    private String description;
    private String level;
    private Long wordCount;
    private Long studiedCount;
    private Long masteredCount;

    public VocabularyTopicSummaryResponse(Long id, String name, String description, String level, Long wordCount) {
        this(id, name, description, level, wordCount, 0L, 0L);
    }
}
