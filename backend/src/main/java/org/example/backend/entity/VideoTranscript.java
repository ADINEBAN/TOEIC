package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "video_transcripts")
@Getter
@Setter
public class VideoTranscript extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_video_id", nullable = false)
    private ImportedVideo importedVideo;

    @Column(name = "detected_language", length = 30)
    private String detectedLanguage = "en";

    @Column(name = "asr_engine", length = 60)
    private String asrEngine;

    @Column(name = "full_english_text", columnDefinition = "LONGTEXT")
    private String fullEnglishText;

    @Column(name = "average_confidence")
    private Double averageConfidence = 0.9;

    @Column(name = "uncertain_segment_count", nullable = false)
    private Integer uncertainSegmentCount = 0;
}
