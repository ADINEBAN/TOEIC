package org.example.backend.repository;

import org.example.backend.entity.VocabularyTopic;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface VocabularyTopicRepository extends JpaRepository<VocabularyTopic, Long> {
    List<VocabularyTopic> findByActiveTrueOrderByIdAsc();

    @Query("SELECT vt.name FROM VocabularyTopic vt")
    List<String> findAllTopicNames();
}
