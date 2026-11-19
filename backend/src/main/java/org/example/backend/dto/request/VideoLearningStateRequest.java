package org.example.backend.dto.request;

import lombok.Data;

@Data
public class VideoLearningStateRequest {
    private Double lastPositionSeconds;
    private Double playbackSpeed;
    private Boolean completed;
    private Boolean favorite;
}
