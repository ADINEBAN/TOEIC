package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "video_processing_jobs")
@Getter
@Setter
public class VideoProcessingJob extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_video_id", nullable = false)
    private ImportedVideo importedVideo;

    @Column(name = "status", nullable = false, length = 40)
    private String status = "QUEUED";

    @Column(name = "overall_progress", nullable = false)
    private Integer overallProgress = 0;

    @Column(name = "download_progress", nullable = false)
    private Integer downloadProgress = 0;

    @Column(name = "audio_extraction_progress", nullable = false)
    private Integer audioExtractionProgress = 0;

    @Column(name = "transcription_progress", nullable = false)
    private Integer transcriptionProgress = 0;

    @Column(name = "translation_progress", nullable = false)
    private Integer translationProgress = 0;

    @Column(name = "total_chunks", nullable = false)
    private Integer totalChunks = 0;

    @Column(name = "completed_chunks", nullable = false)
    private Integer completedChunks = 0;

    @Column(name = "last_completed_chunk", nullable = false)
    private Integer lastCompletedChunk = -1;

    @Column(name = "current_stage_message", length = 500)
    private String currentStageMessage;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount = 0;

    @Column(name = "cancel_requested", nullable = false)
    private Boolean cancelRequested = false;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;
}
