package org.example.backend.repository;

import org.example.backend.entity.UserAchievement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserAchievementRepository extends JpaRepository<UserAchievement, Long> {
    List<UserAchievement> findByUserIdOrderByUnlockedAtDesc(Long userId);
    boolean existsByUserIdAndAchievementCode(Long userId, String achievementCode);
}
