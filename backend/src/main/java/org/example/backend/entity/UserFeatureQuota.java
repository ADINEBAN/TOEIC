package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "user_feature_quotas",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_user_feature_period",
                columnNames = {"user_id", "feature_key", "period_key"}
        )
)
@Getter
@Setter
public class UserFeatureQuota {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "feature_key", nullable = false, length = 40)
    private String featureKey;

    @Column(name = "period_key", nullable = false, length = 20)
    private String periodKey;

    @Column(name = "used_count", nullable = false)
    private Integer usedCount = 0;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
