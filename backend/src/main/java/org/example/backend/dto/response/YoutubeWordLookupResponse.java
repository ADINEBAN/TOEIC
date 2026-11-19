package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class YoutubeWordLookupResponse {
    private String word;
    private String normalizedWord;
    private String pronunciation;
    private String partOfSpeech;
    private String meaningVi;
    private String meaningEn;
    private String exampleSentence;
    private String exampleTranslation;
    private String grammarNote;
    private String source;
}
