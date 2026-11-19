package org.example.backend.repository;

import org.example.backend.entity.UserCosmetic;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserCosmeticRepository extends JpaRepository<UserCosmetic, Long> {
    List<UserCosmetic> findByUserId(Long userId);
    boolean existsByUserIdAndCosmeticId(Long userId, String cosmeticId);
}
