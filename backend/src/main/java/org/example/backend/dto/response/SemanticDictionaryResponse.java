package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SemanticDictionaryResponse {
    private Long vocabularyId;
    private String word;
    private String normalizedWord;
    private String ipa;
    private String partOfSpeech;
    private String cefrLevel;
    private String topicName;
    private String meaningVi;
    private String meaningEn;
    private String usageNote;
    private String source;

    @Builder.Default
    private boolean cached = false;

    @Builder.Default
    private boolean partial = false;

    @Builder.Default
    private List<ExampleEntry> examples = new ArrayList<>();

    @Builder.Default
    private SemanticNetwork semanticNetwork = new SemanticNetwork();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExampleEntry {
        private String english;
        private String vietnamese;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SemanticNode {
        private Long vocabularyId;
        private String word;
        private String ipa;
        private String partOfSpeech;
        private String meaningVi;
        private String cefrLevel;
        private String relationType;
        private String relationLabel;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CollocationEntry {
        private String phrase;
        private String meaningVi;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SemanticNetwork {
        @Builder.Default
        private List<SemanticNode> synonyms = new ArrayList<>();

        @Builder.Default
        private List<SemanticNode> antonyms = new ArrayList<>();

        @Builder.Default
        private List<SemanticNode> wordFamily = new ArrayList<>();

        @Builder.Default
        private List<SemanticNode> relatedWords = new ArrayList<>();

        @Builder.Default
        private List<CollocationEntry> collocations = new ArrayList<>();
    }
}
