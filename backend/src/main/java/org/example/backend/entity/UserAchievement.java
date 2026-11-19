package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(
        name = "user_achievements",
        uniqueConstraints = @UniqueConstraint(name = "uq_user_achievement", columnNames = {"user_id", "achievement_code"})
)
public class UserAchievement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "achievement_code", nullable = false, length = 50)
    private String achievementCode;

    @Column(name = "title_vi", nullable = false, length = 120)
    private String titleVi;

    @Column(name = "description_vi", nullable = false, length = 255)
    private String descriptionVi;

    @Column(name = "icon_name", nullable = false, length = 40)
    private String iconName;

    @Column(name = "reward_diamonds", nullable = false)
    private Integer rewardDiamonds = 0;

    @Column(name = "unlocked_at", nullable = false)
    private LocalDateTime unlockedAt = LocalDateTime.now();
}
