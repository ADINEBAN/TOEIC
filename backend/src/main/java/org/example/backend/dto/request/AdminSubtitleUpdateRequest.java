package org.example.backend.dto.request;

import lombok.Data;

import java.util.List;

@Data
public class AdminSubtitleUpdateRequest {
    private String fullEnglishTranscript;
    private List<SegmentUpdateItem> segments;

    @Data
    public static class SegmentUpdateItem {
        private Long id;
        private Integer sequenceNumber;
        private Double startTime;
        private Double endTime;
        private String englishText;
        private String vietnameseText;
        private String englishNote;
    }
}
