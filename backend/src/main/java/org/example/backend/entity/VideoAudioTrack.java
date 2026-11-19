package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "video_audio_tracks")
@Getter
@Setter
public class VideoAudioTrack extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_video_id", nullable = false)
    private ImportedVideo importedVideo;

    @Column(name = "audio_file_path", length = 1024)
    private String audioFilePath;

    @Column(name = "codec", length = 40)
    private String codec;

    @Column(name = "sample_rate")
    private Integer sampleRate = 16000;

    @Column(name = "duration_seconds", nullable = false)
    private Integer durationSeconds = 0;

    @Column(name = "chunk_count", nullable = false)
    private Integer chunkCount = 0;

    @Column(name = "chunk_duration_seconds", nullable = false)
    private Integer chunkDurationSeconds = 300;

    @Column(name = "status", nullable = false, length = 40)
    private String status = "PENDING";
}
