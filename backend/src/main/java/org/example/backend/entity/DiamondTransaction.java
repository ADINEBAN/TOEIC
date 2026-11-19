package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "diamond_transactions")
public class DiamondTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "source_type", nullable = false, length = 40)
    private String sourceType;

    @Column(name = "reference_key", length = 120)
    private String referenceKey;

    @Column(name = "diamonds_delta", nullable = false)
    private Integer diamondsDelta;

    @Column(name = "is_study_reward", nullable = false)
    private Boolean studyReward = true;

    @Column(name = "description_vi", nullable = false, length = 255)
    private String descriptionVi;

    @Column(name = "week_start_date", nullable = false)
    private LocalDate weekStartDate;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
