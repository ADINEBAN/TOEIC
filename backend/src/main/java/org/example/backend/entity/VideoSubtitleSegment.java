package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "video_subtitle_segments")
@Getter
@Setter
public class VideoSubtitleSegment extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_video_id", nullable = false)
    private ImportedVideo importedVideo;

    @Column(name = "sequence_number", nullable = false)
    private Integer sequenceNumber;

    @Column(name = "start_time", nullable = false)
    private Double startTime;

    @Column(name = "end_time", nullable = false)
    private Double endTime;

    @Column(name = "english_text", nullable = false, columnDefinition = "TEXT")
    private String englishText;

    @Column(name = "vietnamese_text", nullable = false, columnDefinition = "TEXT")
    private String vietnameseText;

    @Column(name = "english_note", columnDefinition = "TEXT")
    private String englishNote;

    @Column(name = "confidence")
    private Double confidence = 0.9;

    @Column(name = "uncertain", nullable = false)
    private Boolean uncertain = false;

    @Column(name = "chunk_index", nullable = false)
    private Integer chunkIndex = 0;
}
