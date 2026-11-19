package org.example.backend.repository;

import org.example.backend.entity.UserVideoLearningState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserVideoLearningStateRepository extends JpaRepository<UserVideoLearningState, Long> {
    Optional<UserVideoLearningState> findByUserIdAndImportedVideoId(Long userId, Long importedVideoId);
    List<UserVideoLearningState> findByUserId(Long userId);
    long countByUserIdAndCompletedTrue(Long userId);
    void deleteByImportedVideoId(Long importedVideoId);
}
