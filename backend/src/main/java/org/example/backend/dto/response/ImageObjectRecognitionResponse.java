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
public class ImageObjectRecognitionResponse {
    private DetectedObjectItem primaryObject;
    private String sceneDescriptionEn;
    private String sceneDescriptionVi;
    private String source;

    @Builder.Default
    private List<DetectedObjectItem> detectedObjects = new ArrayList<>();

    @Builder.Default
    private List<SemanticDictionaryResponse.SemanticNode> relatedWords = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DetectedObjectItem {
        private Long vocabularyId;
        private String word;
        private String ipa;
        private String partOfSpeech;
        private String cefrLevel;
        private String meaningVi;
        private String meaningEn;
        private String exampleSentence;
        private String exampleTranslation;
        private String category;
        private Double confidence;
    }
}
