package org.example.backend.repository;

import org.example.backend.entity.UserDictionaryHistory;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserDictionaryHistoryRepository extends JpaRepository<UserDictionaryHistory, Long> {
    List<UserDictionaryHistory> findByUserIdOrderByLastLookedUpAtDesc(Long userId, Pageable pageable);

    Optional<UserDictionaryHistory> findByUserIdAndNormalizedWord(Long userId, String normalizedWord);

    void deleteByUserIdAndNormalizedWord(Long userId, String normalizedWord);

    void deleteByUserId(Long userId);
}
