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
public class VideoProcessingJobResponse {
    private Long jobId;
    private Long videoId;
    private String status;
    private Integer overallProgress;
    private Integer downloadProgress;
    private Integer audioExtractionProgress;
    private Integer transcriptionProgress;
    private Integer translationProgress;
    private Integer totalChunks;
    private Integer completedChunks;
    private Integer lastCompletedChunk;
    private String currentStageMessage;
    private String errorMessage;
    private Integer retryCount;
    private Boolean cancelRequested;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
}
