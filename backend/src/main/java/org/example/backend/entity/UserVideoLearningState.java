package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "user_video_learning_states")
@Getter
@Setter
public class UserVideoLearningState extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_video_id", nullable = false)
    private ImportedVideo importedVideo;

    @Column(name = "last_position_seconds", nullable = false)
    private Double lastPositionSeconds = 0.0;

    @Column(name = "playback_speed", nullable = false)
    private Double playbackSpeed = 1.0;

    @Column(name = "completed", nullable = false)
    private Boolean completed = false;

    @Column(name = "is_favorite", nullable = false)
    private Boolean favorite = false;
}
