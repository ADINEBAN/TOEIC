package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DictionaryHistoryItemResponse {
    private Long id;
    private String word;
    private String normalizedWord;
    private String ipa;
    private String partOfSpeech;
    private String cefrLevel;
    private String meaningVi;
    private String source;
    private Integer lookupCount;
    private LocalDateTime lastLookedUpAt;
    private SemanticDictionaryResponse entry;
}
