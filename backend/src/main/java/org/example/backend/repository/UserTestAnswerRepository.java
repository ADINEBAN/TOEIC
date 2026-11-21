package org.example.backend.repository;

import org.example.backend.entity.UserTestAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserTestAnswerRepository extends JpaRepository<UserTestAnswer, Long> {
    List<UserTestAnswer> findByAttemptIdOrderByIdAsc(Long attemptId);

    @Query("""
            select a from UserTestAnswer a
            join fetch a.testPartQuestion tpq
            join fetch tpq.question q
            where a.attempt.user.id = :userId and (a.correct = false or a.correct is null)
            order by a.id desc
            """)
    List<UserTestAnswer> findIncorrectAnswersByUserId(@Param("userId") Long userId);

    @Query("""
            select q.partNo, count(a), sum(case when a.correct = true then 1 else 0 end)
            from UserTestAnswer a
            join a.testPartQuestion tpq
            join tpq.question q
            where a.attempt.user.id = :userId and q.partNo is not null
            group by q.partNo
            """)
    List<Object[]> summarizeAccuracyByPart(@Param("userId") Long userId);

    @Modifying
    @Query("delete from UserTestAnswer a where a.testPartQuestion.id = :tpqId")
    void deleteByTestPartQuestionId(@Param("tpqId") Long testPartQuestionId);

    @Modifying
    @Query("delete from UserTestAnswer a where a.testPartQuestion.testPart.id = :testPartId")
    void deleteByTestPartId(@Param("testPartId") Long testPartId);

    @Modifying
    @Query("delete from UserTestAnswer a where a.attempt.test.id = :testId")
    void deleteByTestId(@Param("testId") Long testId);
}
