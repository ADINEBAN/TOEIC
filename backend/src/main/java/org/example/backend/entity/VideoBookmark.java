package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "video_bookmarks")
@Getter
@Setter
public class VideoBookmark extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_video_id", nullable = false)
    private ImportedVideo importedVideo;

    @Column(name = "timestamp_seconds", nullable = false)
    private Double timestampSeconds;

    @Column(name = "label", nullable = false, length = 255)
    private String label;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;
}
