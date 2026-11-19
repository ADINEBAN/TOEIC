package org.example.backend.entity;

import lombok.NoArgsConstructor;
import lombok.Getter;
import lombok.Setter;
import org.example.backend.enums.AuthProvider;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor

@Entity
@Table(name = "users")
public class User extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "full_name", length = 255)
    private String fullName;

    @Column(name = "username", length = 60)
    private String username;

    @Column(name = "bio", length = 300)
    private String bio;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "equipped_frame_id", length = 64)
    private String equippedFrameId;

    @Column(name = "equipped_avatar_id", length = 64)
    private String equippedAvatarId;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_provider", nullable = false, length = 30)
    private AuthProvider authProvider = AuthProvider.EMAIL;

    @Column(name = "provider_user_id", length = 255)
    private String providerUserId;

    @Column(name = "current_level", length = 50)
    private String currentLevel;

    @Column(name = "target_score")
    private Integer targetScore;

    @Column(name = "last_login_date")
    private LocalDate lastLoginDate;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "current_login_streak")
    private Integer currentLoginStreak = 0;

    @Column(name = "longest_login_streak")
    private Integer longestLoginStreak = 0;

    @Column(name = "is_premium", nullable = false)
    private Boolean premium = false;

    @Column(name = "diamonds", nullable = false)
    private Integer diamonds = 50;

    @Column(name = "arena_wins", nullable = false)
    private Integer arenaWins = 0;

    @Column(name = "arena_losses", nullable = false)
    private Integer arenaLosses = 0;

    @Column(name = "arena_elo", nullable = false)
    private Integer arenaElo = 1000;

    @Column(name = "learning_xp", nullable = false)
    private Integer learningXp = 0;

    @Column(name = "total_study_minutes", nullable = false)
    private Integer totalStudyMinutes = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 30)
    private UserRole role = UserRole.USER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private UserStatus status = UserStatus.ACTIVE;

    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private UserProfile profile;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<UserLearningPath> learningPaths = new ArrayList<>();
}
