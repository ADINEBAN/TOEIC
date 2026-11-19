package org.example.backend.dto.request;

import lombok.Data;

@Data
public class YoutubeSubtitleRequest {
    private String youtubeUrl;
    private String customTranscript;
    private String topicHint;
    private String preferredLevel;
}
