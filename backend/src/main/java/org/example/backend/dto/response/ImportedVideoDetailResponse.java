package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportedVideoDetailResponse {
    private Long id;
    private String videoUid;
    private String sourceUrl;
    private String canonicalUrl;
    private String platform;
    private String title;
    private String description;
    private String authorName;
    private String thumbnailUrl;
    private String streamVideoUrl;
    private String audioLanguage;
    private Integer durationSeconds;
    private Integer verifiedMediaDurationSeconds;
    private String durationLabel;
    private String level;
    private String topic;
    private String workflowStatus;
    private Boolean published;
    private LocalDateTime publishedAt;
    private Boolean readyToPublish;
    private List<String> publishBlockers;
    private String fullEnglishTranscript;
    private Boolean favorite;
    private Double lastPositionSeconds;
    private Double playbackSpeed;
    private Boolean completed;
    private Integer diamondsEarned;
    private Integer currentDiamonds;
    private String detectedLanguage;
    private String asrEngine;
    private Double averageConfidence;
    private Integer uncertainSegmentCount;
    private VideoProcessingJobResponse latestJob;
    private List<VideoSubtitleSegmentResponse> segments;
    private List<YoutubeWordLookupResponse> vocabulary;
    private List<YoutubeExerciseItemResponse> exercises;
    private List<VideoBookmarkResponse> bookmarks;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
