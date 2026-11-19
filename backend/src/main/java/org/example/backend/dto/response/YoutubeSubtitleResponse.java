package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class YoutubeSubtitleResponse {
    private String videoId;
    private String youtubeUrl;
    private String streamVideoUrl;
    private String title;
    private String authorName;
    private String thumbnailUrl;
    private String level;
    private String topic;
    private int durationSeconds;
    private String durationLabel;
    private String sourceMode;
    private List<YoutubeSubtitleLineResponse> lines;
    private List<YoutubeWordLookupResponse> vocabulary;
    private List<YoutubeExerciseItemResponse> exercises;
}
