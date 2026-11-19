package org.example.backend.dto.request;

import lombok.Data;

@Data
public class VideoImportRequest {
    private String videoUrl;
    private String youtubeUrl;
    private String title;
    private String description;
    private String preferredLevel;
    private String topicHint;
    private Boolean allowPlaylist;
    private String customTranscript;
    private Boolean forceAsr;

    public String getYoutubeOrMediaUrlSafe() {
        if (videoUrl != null && !videoUrl.isBlank()) {
            return videoUrl.trim();
        }
        return youtubeUrl != null ? youtubeUrl.trim() : null;
    }
}
