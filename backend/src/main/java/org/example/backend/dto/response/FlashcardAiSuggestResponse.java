package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FlashcardAiSuggestResponse {
    private String englishWord;
    private String meaningVi;
    private String pronunciation;
    private String exampleSentence;
    private String source;
}
