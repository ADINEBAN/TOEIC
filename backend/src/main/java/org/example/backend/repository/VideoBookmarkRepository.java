package org.example.backend.repository;

import org.example.backend.entity.VideoBookmark;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VideoBookmarkRepository extends JpaRepository<VideoBookmark, Long> {
    List<VideoBookmark> findByUserIdAndImportedVideoIdOrderByTimestampSecondsAsc(Long userId, Long importedVideoId);
    void deleteByImportedVideoId(Long importedVideoId);
}
