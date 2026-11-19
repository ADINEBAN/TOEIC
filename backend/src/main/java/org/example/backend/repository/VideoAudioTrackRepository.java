package org.example.backend.repository;

import org.example.backend.entity.VideoAudioTrack;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface VideoAudioTrackRepository extends JpaRepository<VideoAudioTrack, Long> {
    Optional<VideoAudioTrack> findFirstByImportedVideoIdOrderByCreatedAtDesc(Long importedVideoId);
    void deleteByImportedVideoId(Long importedVideoId);
}
