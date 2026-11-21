package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionImportResponse {
    private int totalParsed;
    private int importedCount;
    private int skippedDuplicateCount;
    private int aiExplainedCount;
    private List<QuestionResponse> items;
}
