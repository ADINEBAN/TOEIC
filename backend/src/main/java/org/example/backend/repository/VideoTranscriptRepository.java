package org.example.backend.repository;

import org.example.backend.entity.VideoTranscript;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface VideoTranscriptRepository extends JpaRepository<VideoTranscript, Long> {
    Optional<VideoTranscript> findFirstByImportedVideoIdOrderByCreatedAtDesc(Long importedVideoId);
    void deleteByImportedVideoId(Long importedVideoId);
}
