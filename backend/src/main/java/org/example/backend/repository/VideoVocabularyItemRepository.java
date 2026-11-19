package org.example.backend.repository;

import org.example.backend.entity.VideoVocabularyItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface VideoVocabularyItemRepository extends JpaRepository<VideoVocabularyItem, Long> {
    List<VideoVocabularyItem> findByImportedVideoIdOrderByIdAsc(Long importedVideoId);

    @Modifying
    @Transactional
    @Query("DELETE FROM VideoVocabularyItem v WHERE v.importedVideo.id = :importedVideoId")
    void deleteByImportedVideoId(@Param("importedVideoId") Long importedVideoId);
}
