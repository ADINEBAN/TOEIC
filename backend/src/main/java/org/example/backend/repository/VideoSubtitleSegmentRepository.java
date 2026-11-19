package org.example.backend.repository;

import org.example.backend.entity.VideoSubtitleSegment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface VideoSubtitleSegmentRepository extends JpaRepository<VideoSubtitleSegment, Long> {
    List<VideoSubtitleSegment> findByImportedVideoIdOrderBySequenceNumberAsc(Long importedVideoId);

    @Modifying
    @Transactional
    @Query("DELETE FROM VideoSubtitleSegment s WHERE s.importedVideo.id = :importedVideoId")
    void deleteByImportedVideoId(@Param("importedVideoId") Long importedVideoId);

    @Modifying
    @Transactional
    @Query("DELETE FROM VideoSubtitleSegment s WHERE s.importedVideo.id = :importedVideoId AND s.chunkIndex >= :chunkIndex")
    void deleteByImportedVideoIdAndChunkIndexGreaterThanEqual(
            @Param("importedVideoId") Long importedVideoId,
            @Param("chunkIndex") Integer chunkIndex
    );
}
