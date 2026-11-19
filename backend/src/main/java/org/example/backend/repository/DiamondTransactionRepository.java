package org.example.backend.repository;

import org.example.backend.entity.DiamondTransaction;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface DiamondTransactionRepository extends JpaRepository<DiamondTransaction, Long> {

    boolean existsByUserIdAndSourceTypeAndReferenceKey(Long userId, String sourceType, String referenceKey);

    List<DiamondTransaction> findTop30ByUserIdOrderByCreatedAtDesc(Long userId);

    @Query("""
            select dt.user.id, coalesce(sum(dt.diamondsDelta), 0), count(dt.id)
            from DiamondTransaction dt
            where dt.weekStartDate = :weekStart
              and dt.studyReward = true
              and dt.diamondsDelta > 0
            group by dt.user.id
            order by coalesce(sum(dt.diamondsDelta), 0) desc, count(dt.id) desc, dt.user.id asc
            """)
    List<Object[]> findWeeklyStudyRankings(@Param("weekStart") LocalDate weekStart, Pageable pageable);

    @Query("""
            select coalesce(sum(dt.diamondsDelta), 0)
            from DiamondTransaction dt
            where dt.user.id = :userId
              and dt.weekStartDate = :weekStart
              and dt.studyReward = true
              and dt.diamondsDelta > 0
            """)
    Long sumWeeklyStudyDiamondsByUser(@Param("userId") Long userId, @Param("weekStart") LocalDate weekStart);

    @Query("""
            select count(distinct dt.user.id)
            from DiamondTransaction dt
            where dt.weekStartDate = :weekStart
              and dt.studyReward = true
              and dt.diamondsDelta > 0
            """)
    Long countActiveStudyUsersInWeek(@Param("weekStart") LocalDate weekStart);
}
