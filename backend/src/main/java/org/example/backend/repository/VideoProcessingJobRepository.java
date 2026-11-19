package org.example.backend.repository;

import org.example.backend.entity.VideoProcessingJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface VideoProcessingJobRepository extends JpaRepository<VideoProcessingJob, Long> {
    List<VideoProcessingJob> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<VideoProcessingJob> findAllByOrderByCreatedAtDesc();
    Optional<VideoProcessingJob> findFirstByImportedVideoIdOrderByCreatedAtDesc(Long importedVideoId);
    List<VideoProcessingJob> findByStatusInOrderByCreatedAtAsc(Collection<String> statuses);
    void deleteByImportedVideoId(Long importedVideoId);
}
