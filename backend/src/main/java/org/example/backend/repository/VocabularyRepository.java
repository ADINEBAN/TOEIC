package org.example.backend.repository;

import org.example.backend.entity.Vocabulary;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface VocabularyRepository extends JpaRepository<Vocabulary, Long> {
    List<Vocabulary> findByTopicIdOrderByIdAsc(Long topicId);

    List<Vocabulary> findAllByOrderByIdAsc();

    List<Vocabulary> findByWordIgnoreCaseOrderByIdAsc(String word);

    @Query("SELECT v FROM Vocabulary v LEFT JOIN FETCH v.topic WHERE LOWER(v.word) IN :words ORDER BY v.id ASC")
    List<Vocabulary> findByWordInIgnoreCase(@Param("words") Collection<String> words);

    @Query("""
        SELECT v FROM Vocabulary v
        LEFT JOIN FETCH v.topic t
        WHERE LOWER(v.word) LIKE LOWER(CONCAT(:stem, '%'))
          AND LOWER(v.word) <> LOWER(:exactWord)
        ORDER BY LENGTH(v.word) ASC, v.id ASC
    """)
    List<Vocabulary> findWordFamilyCandidates(
            @Param("stem") String stem,
            @Param("exactWord") String exactWord,
            Pageable pageable
    );

    @Query("""
        SELECT v FROM Vocabulary v
        WHERE v.topic.id = :topicId AND v.id <> :excludeId
        ORDER BY v.id ASC
    """)
    List<Vocabulary> findSameTopicNeighbors(
            @Param("topicId") Long topicId,
            @Param("excludeId") Long excludeId,
            Pageable pageable
    );

    long countByTopicId(Long topicId);

    @Query("SELECT v.topic.id, COUNT(v.id) FROM Vocabulary v WHERE v.topic IS NOT NULL GROUP BY v.topic.id")
    List<Object[]> countGroupedByTopicId();

    @Query("""
        SELECT v FROM Vocabulary v
        JOIN FETCH v.topic t
        WHERE t.active = true
          AND (v.word LIKE CONCAT(:prefixLower, '%') OR v.word LIKE CONCAT(:prefixCap, '%'))
        ORDER BY LENGTH(v.word) ASC, v.id ASC
    """)
    List<Vocabulary> searchPrefixActiveVocabularies(
            @Param("prefixLower") String prefixLower,
            @Param("prefixCap") String prefixCap,
            Pageable pageable
    );

    @Query("""
        SELECT v FROM Vocabulary v
        JOIN FETCH v.topic t
        WHERE t.active = true
          AND (:topicId IS NULL OR t.id = :topicId)
          AND (:level IS NULL OR :level = '' OR UPPER(t.level) = UPPER(:level) OR UPPER(v.difficultyLevel) = UPPER(:level))
          AND (:q IS NULL OR :q = '' OR LOWER(v.word) LIKE LOWER(CONCAT('%', :q, '%')) OR LOWER(v.meaningVi) LIKE LOWER(CONCAT('%', :q, '%')))
        ORDER BY v.id ASC
    """)
    List<Vocabulary> searchActiveVocabularies(
            @Param("topicId") Long topicId,
            @Param("level") String level,
            @Param("q") String q,
            Pageable pageable
    );
}
