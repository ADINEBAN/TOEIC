package org.example.backend.repository;

import org.example.backend.entity.UserVocabularyProgress;
import org.example.backend.enums.VocabularyStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserVocabularyProgressRepository extends JpaRepository<UserVocabularyProgress, Long> {
    List<UserVocabularyProgress> findByUserId(Long userId);
    Optional<UserVocabularyProgress> findByUserIdAndVocabularyId(Long userId, Long vocabularyId);
    long countByUserIdAndStatus(Long userId, VocabularyStatus status);
    long countByUserIdAndLastReviewedAtIsNotNull(Long userId);

    @Query("SELECT p.vocabulary.topic.id, " +
            "SUM(CASE WHEN (p.repetitions > 0 OR p.lastReviewedAt IS NOT NULL) THEN 1 ELSE 0 END), " +
            "SUM(CASE WHEN p.status = :masteredStatus THEN 1 ELSE 0 END) " +
            "FROM UserVocabularyProgress p " +
            "WHERE LOWER(p.user.email) = LOWER(:email) " +
            "GROUP BY p.vocabulary.topic.id")
    List<Object[]> summarizeTopicProgressByUserEmail(
            @Param("email") String email,
            @Param("masteredStatus") VocabularyStatus masteredStatus
    );
}
