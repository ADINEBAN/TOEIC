package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "imported_videos")
@Getter
@Setter
public class ImportedVideo extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "video_uid", nullable = false, length = 128)
    private String videoUid;

    @Column(name = "source_url", nullable = false, length = 1024)
    private String sourceUrl;

    @Column(name = "canonical_url", length = 1024)
    private String canonicalUrl;

    @Column(name = "platform", nullable = false, length = 40)
    private String platform = "YOUTUBE";

    @Column(name = "title", nullable = false, length = 512)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "author_name", length = 255)
    private String authorName;

    @Column(name = "thumbnail_url", length = 1024)
    private String thumbnailUrl;

    @Column(name = "stream_video_url", length = 2048)
    private String streamVideoUrl;

    @Column(name = "local_media_path", length = 1024)
    private String localMediaPath;

    @Column(name = "audio_language", length = 30)
    private String audioLanguage = "en";

    @Column(name = "duration_seconds", nullable = false)
    private Integer durationSeconds = 0;

    @Column(name = "verified_media_duration_seconds", nullable = false)
    private Integer verifiedMediaDurationSeconds = 0;

    @Column(name = "level", length = 20)
    private String level = "B1";

    @Column(name = "topic", length = 120)
    private String topic = "General English";

    @Column(name = "workflow_status", nullable = false, length = 40)
    private String workflowStatus = "DRAFT";

    @Column(name = "is_published", nullable = false)
    private Boolean published = false;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "reviewed_by_user_id")
    private Long reviewedByUserId;

    @Column(name = "metadata_json", columnDefinition = "LONGTEXT")
    private String metadataJson;

    @Column(name = "is_favorite", nullable = false)
    private Boolean favorite = false;
}
