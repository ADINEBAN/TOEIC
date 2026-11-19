package org.example.backend.repository;
import org.springframework.data.jpa.repository.JpaRepository;
import org.example.backend.entity.UserVideoProgress;
import org.example.backend.enums.ProgressStatus;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserVideoProgressRepository extends JpaRepository<UserVideoProgress, Long> {
    List<UserVideoProgress> findByUserIdAndLessonIdIn(Long userId, List<Long> lessonIds);

    Optional<UserVideoProgress> findByUserIdAndLessonId(Long userId, Long lessonId);

    long countByUserIdAndStatus(Long userId, ProgressStatus status);

    void deleteByLessonId(Long lessonId);

    @Modifying
    @Query("delete from UserVideoProgress p where p.lesson.module.id = :moduleId")
    void deleteByModuleId(@Param("moduleId") Long moduleId);
}
