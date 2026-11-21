package org.example.backend.repository;

import org.example.backend.entity.UserPracticeAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserPracticeAnswerRepository extends JpaRepository<UserPracticeAnswer, Long> {
    List<UserPracticeAnswer> findByAttemptIdOrderByIdAsc(Long attemptId);

    @Query("""
            select a from UserPracticeAnswer a
            join fetch a.question q
            where a.attempt.user.id = :userId and (a.correct = false or a.correct is null)
            order by a.id desc
            """)
    List<UserPracticeAnswer> findIncorrectAnswersByUserId(@Param("userId") Long userId);

    @Query("""
            select q.partNo, count(a), sum(case when a.correct = true then 1 else 0 end)
            from UserPracticeAnswer a
            join a.question q
            where a.attempt.user.id = :userId and q.partNo is not null
            group by q.partNo
            """)
    List<Object[]> summarizeAccuracyByPart(@Param("userId") Long userId);

    @Modifying
    @Query("delete from UserPracticeAnswer a where a.attempt.practiceSet.id = :practiceSetId")
    void deleteByPracticeSetId(@Param("practiceSetId") Long practiceSetId);

    @Modifying
    @Query("delete from UserPracticeAnswer a where a.attempt.practiceSet.module.id = :moduleId")
    void deleteByModuleId(@Param("moduleId") Long moduleId);
}
