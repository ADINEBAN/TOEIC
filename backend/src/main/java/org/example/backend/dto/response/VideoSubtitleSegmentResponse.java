package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VideoSubtitleSegmentResponse {
    private Long id;
    private Integer sequenceNumber;
    private Double startTime;
    private Double endTime;
    private String timestampLabel;
    private String rangeLabel;
    private String englishText;
    private String vietnameseText;
    private String englishNote;
    private Double confidence;
    private Boolean uncertain;
}
