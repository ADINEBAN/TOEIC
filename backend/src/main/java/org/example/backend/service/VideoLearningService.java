package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.AdminSubtitleUpdateRequest;
import org.example.backend.dto.request.AdminVideoUpdateRequest;
import org.example.backend.dto.request.VideoBookmarkRequest;
import org.example.backend.dto.request.VideoImportRequest;
import org.example.backend.dto.request.VideoLearningStateRequest;
import org.example.backend.dto.response.*;
import org.example.backend.entity.*;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserRole;
import org.example.backend.exception.AppException;
import org.example.backend.repository.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class VideoLearningService {

    private static final Logger logger = LoggerFactory.getLogger(VideoLearningService.class);
    private static final long STREAM_REFRESH_BUFFER_SECONDS = 1800L;
    private static final int STREAM_COPY_BUFFER_BYTES = 16 * 1024;
    private static final Pattern YOUTUBE_ID_PATTERN = Pattern.compile(
            "(?:youtube\\.com/(?:watch\\?.*?v=|embed/|shorts/|live/)|youtu\\.be/)([A-Za-z0-9_-]{11})"
    );
    private static final Pattern RAW_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final ObjectMapper METADATA_MAPPER = new ObjectMapper();

    private final UserRepository userRepository;
    private final ImportedVideoRepository importedVideoRepository;
    private final VideoProcessingJobRepository videoProcessingJobRepository;
    private final VideoAudioTrackRepository videoAudioTrackRepository;
    private final VideoTranscriptRepository videoTranscriptRepository;
    private final VideoSubtitleSegmentRepository videoSubtitleSegmentRepository;
    private final UserVideoLearningStateRepository userVideoLearningStateRepository;
    private final VideoBookmarkRepository videoBookmarkRepository;
    private final VideoVocabularyItemRepository videoVocabularyItemRepository;
    private final VideoTranslationAndSubtitleService subtitleService;
    private final VideoJobWorkerService workerService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private DiamondRewardService diamondRewardService;

    // =========================================================================
    // ADMIN & CONTENT MANAGER OPERATIONS (RBAC ENFORCED)
    // =========================================================================

    @Transactional
    public ImportedVideoDetailResponse importVideo(String email, VideoImportRequest request) {
        User user = findUser(email);
        requireAdminOrContentManager(user);

        String rawUrl = request != null ? request.getYoutubeOrMediaUrlSafe() : null;
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new AppException(ErrorCode.INVALID_YOUTUBE_URL);
        }

        NormalizedSource source = normalizeAndValidateUrl(rawUrl);

        Optional<ImportedVideo> existingOpt = importedVideoRepository.findFirstByVideoUid(source.videoUid());
        if (existingOpt.isEmpty()) {
            existingOpt = importedVideoRepository.findFirstByUserIdAndVideoUid(user.getId(), source.videoUid());
        }
        if (existingOpt.isPresent()) {
            ImportedVideo existing = existingOpt.get();
            applyOptionalImportMetadata(existing, request);
            VideoProcessingJob latestJob = videoProcessingJobRepository
                    .findFirstByImportedVideoIdOrderByCreatedAtDesc(existing.getId())
                    .orElse(null);

            if (latestJob != null && ("FAILED".equals(latestJob.getStatus()) || "CANCELLED".equals(latestJob.getStatus()))) {
                latestJob.setStatus("QUEUED");
                latestJob.setCancelRequested(false);
                latestJob.setErrorMessage(null);
                latestJob.setRetryCount((latestJob.getRetryCount() == null ? 0 : latestJob.getRetryCount()) + 1);
                latestJob.setCurrentStageMessage("Đang thử lại tác vụ xử lý video...");
                videoProcessingJobRepository.save(latestJob);
                if (!Boolean.TRUE.equals(existing.getPublished())) {
                    existing.setWorkflowStatus("DOWNLOADING");
                }
                importedVideoRepository.save(existing);
                submitJobAfterCommit(latestJob.getId(), Boolean.TRUE.equals(request.getForceAsr()), request.getCustomTranscript());
            } else if (latestJob == null) {
                if (!Boolean.TRUE.equals(existing.getPublished())) {
                    existing.setWorkflowStatus("DOWNLOADING");
                }
                importedVideoRepository.save(existing);
                VideoProcessingJob job = createNewJob(user, existing);
                submitJobAfterCommit(job.getId(), Boolean.TRUE.equals(request.getForceAsr()), request.getCustomTranscript());
            } else {
                if ("QUEUED".equalsIgnoreCase(latestJob.getStatus())) {
                    submitJobAfterCommit(latestJob.getId(), Boolean.TRUE.equals(request.getForceAsr()), request.getCustomTranscript());
                }
                importedVideoRepository.save(existing);
            }
            return buildSummaryOrDetail(user, existing, true, true);
        }

        boolean autoTitle = isBlank(request.getTitle());
        boolean autoDescription = isBlank(request.getDescription());
        boolean autoTopic = isBlank(request.getTopicHint());
        String rawPrefLevel = request.getPreferredLevel() != null ? request.getPreferredLevel().trim() : "";
        boolean autoLevel = rawPrefLevel.isEmpty()
                || "AUTO".equalsIgnoreCase(rawPrefLevel)
                || "Tự động".equalsIgnoreCase(rawPrefLevel);

        ImportedVideo video = new ImportedVideo();
        video.setUser(user);
        video.setVideoUid(source.videoUid());
        video.setSourceUrl(source.canonicalUrl());
        video.setCanonicalUrl(source.canonicalUrl());
        video.setPlatform(source.platform());
        video.setTitle(!autoTitle
                ? request.getTitle().trim()
                : "Đang tải thông tin video (" + source.videoUid() + ")...");
        video.setDescription(!autoDescription ? request.getDescription().trim() : "");
        video.setThumbnailUrl(source.youtubeId() != null ? "https://img.youtube.com/vi/" + source.youtubeId() + "/hqdefault.jpg" : "");
        video.setLevel(!autoLevel ? rawPrefLevel : "AUTO");
        video.setTopic(!autoTopic ? request.getTopicHint().trim() : "");
        video.setMetadataJson(buildAutoFieldsMetadataJson(autoTitle, autoTopic, autoDescription, autoLevel));
        video.setWorkflowStatus("DRAFT");
        video.setPublished(false);
        video = importedVideoRepository.save(video);

        VideoProcessingJob job = createNewJob(user, video);
        video.setWorkflowStatus("DOWNLOADING");
        video = importedVideoRepository.save(video);
        submitJobAfterCommit(job.getId(), Boolean.TRUE.equals(request.getForceAsr()), request.getCustomTranscript());

        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional(readOnly = true)
    public List<ImportedVideoDetailResponse> listAdminVideos(String email, String workflowFilter, String search) {
        User user = findUser(email);
        requireAdminOrContentManager(user);

        List<ImportedVideo> videos = importedVideoRepository.findAllByOrderByUpdatedAtDesc();
        String normFilter = workflowFilter != null ? workflowFilter.trim().toUpperCase(Locale.ROOT) : "";
        String normSearch = search != null ? search.trim().toLowerCase(Locale.ROOT) : "";

        List<ImportedVideoDetailResponse> result = new ArrayList<>();
        for (ImportedVideo v : videos) {
            if (isPersonalImportVideo(v)) {
                continue;
            }
            if (!matchesAdminWorkflowFilter(v, normFilter)) {
                continue;
            }
            if (!normSearch.isEmpty() && !matchesVideoSearch(v, normSearch)) {
                continue;
            }
            result.add(buildSummaryOrDetail(user, v, false, true));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public ImportedVideoDetailResponse getAdminVideoDetail(String email, Long videoId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);
        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public ImportedVideoDetailResponse updateVideoMetadata(String email, Long videoId, AdminVideoUpdateRequest request) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        if (request != null) {
            if (!isBlank(request.getTitle())) {
                video.setTitle(request.getTitle().trim());
            }
            if (request.getDescription() != null) {
                video.setDescription(request.getDescription().trim());
            }
            if (request.getAuthorName() != null) {
                video.setAuthorName(request.getAuthorName().trim());
            }
            if (request.getThumbnailUrl() != null) {
                video.setThumbnailUrl(request.getThumbnailUrl().trim());
            }
            if (!isBlank(request.getLevel())) {
                video.setLevel(request.getLevel().trim());
            }
            if (!isBlank(request.getTopic())) {
                video.setTopic(request.getTopic().trim());
            }
        }

        video = importedVideoRepository.save(video);
        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public ImportedVideoDetailResponse aiSummarizeVideoMetadata(String email, Long videoId, boolean overwriteAll) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        List<VideoSubtitleSegment> segments =
                videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId());
        VideoTranscript transcript = videoTranscriptRepository
                .findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElse(null);

        StringBuilder enBuilder = new StringBuilder();
        if (transcript != null && !isBlank(transcript.getFullEnglishText())) {
            enBuilder.append(transcript.getFullEnglishText());
        } else {
            for (VideoSubtitleSegment s : segments) {
                if (!isBlank(s.getEnglishText())) {
                    if (!enBuilder.isEmpty()) enBuilder.append(" ");
                    enBuilder.append(s.getEnglishText().trim());
                }
            }
        }

        StringBuilder viSample = new StringBuilder();
        for (int i = 0; i < Math.min(4, segments.size()); i++) {
            String vi = segments.get(i).getVietnameseText();
            if (!isBlank(vi)) {
                if (!viSample.isEmpty()) viSample.append(" ");
                viSample.append(vi.trim());
            }
        }

        VideoTranslationAndSubtitleService.VideoMetadataSummary summary =
                subtitleService.summarizeVideoMetadataWithAi(
                        enBuilder.toString(),
                        video.getTitle(),
                        video.getAuthorName(),
                        viSample.toString()
                );

        if (overwriteAll || isBlank(video.getTitle()) || video.getTitle().startsWith("Đang tải thông tin video")) {
            video.setTitle(summary.title());
        }
        if (overwriteAll || isBlank(video.getTopic()) || "General English".equalsIgnoreCase(video.getTopic())) {
            video.setTopic(summary.topic());
        }
        if (overwriteAll || isBlank(video.getDescription())) {
            video.setDescription(summary.descriptionVi());
        }
        if (overwriteAll || isBlank(video.getLevel()) || "AUTO".equalsIgnoreCase(video.getLevel())) {
            video.setLevel(summary.level());
        }

        video = importedVideoRepository.save(video);
        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public ImportedVideoDetailResponse updateSubtitles(String email, Long videoId, AdminSubtitleUpdateRequest request) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        List<VideoSubtitleSegment> existingSegments =
                videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId());

        if (request != null && request.getSegments() != null) {
            Map<Long, VideoSubtitleSegment> existingById = new HashMap<>();
            for (VideoSubtitleSegment s : existingSegments) {
                if (s.getId() != null) {
                    existingById.put(s.getId(), s);
                }
            }

            Set<Long> retainedIds = new HashSet<>();
            List<VideoSubtitleSegment> toSave = new ArrayList<>();
            int seq = 1;
            double prevEnd = 0.0;

            for (AdminSubtitleUpdateRequest.SegmentUpdateItem item : request.getSegments()) {
                if (item == null) {
                    continue;
                }
                String en = item.getEnglishText() != null ? item.getEnglishText().replaceAll("\\s+", " ").trim() : "";
                String vi = item.getVietnameseText() != null ? item.getVietnameseText().replaceAll("\\s+", " ").trim() : "";
                if (en.isEmpty() && vi.isEmpty()) {
                    continue;
                }

                VideoSubtitleSegment seg = (item.getId() != null && existingById.containsKey(item.getId()))
                        ? existingById.get(item.getId())
                        : new VideoSubtitleSegment();

                if (seg.getId() != null) {
                    retainedIds.add(seg.getId());
                }
                seg.setImportedVideo(video);
                seg.setSequenceNumber(seq++);

                double start = item.getStartTime() != null ? Math.max(0.0, item.getStartTime()) : prevEnd;
                double end = item.getEndTime() != null ? Math.max(start + 0.5, item.getEndTime()) : start + 3.0;
                prevEnd = end;

                seg.setStartTime(start);
                seg.setEndTime(end);
                seg.setEnglishText(en);
                seg.setVietnameseText(vi);
                if (item.getEnglishNote() != null) {
                    seg.setEnglishNote(item.getEnglishNote().trim());
                } else if (seg.getEnglishNote() == null) {
                    seg.setEnglishNote("Edited by Admin");
                }
                if (seg.getConfidence() == null) {
                    seg.setConfidence(1.0);
                }
                seg.setUncertain(false);
                if (seg.getChunkIndex() == null) {
                    seg.setChunkIndex(0);
                }
                toSave.add(seg);
            }

            for (VideoSubtitleSegment old : existingSegments) {
                if (old.getId() != null && !retainedIds.contains(old.getId())) {
                    videoSubtitleSegmentRepository.delete(old);
                }
            }
            existingSegments = videoSubtitleSegmentRepository.saveAll(toSave);
        }

        String customFullEn = request != null && !isBlank(request.getFullEnglishTranscript())
                ? request.getFullEnglishTranscript().trim()
                : null;
        refreshTranscriptAndVocabulary(video, existingSegments, customFullEn);

        VideoProcessingJob latestJob = videoProcessingJobRepository
                .findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElse(null);
        if (!Boolean.TRUE.equals(video.getPublished())
                && !"ARCHIVED".equalsIgnoreCase(video.getWorkflowStatus())
                && latestJob != null
                && "COMPLETED".equalsIgnoreCase(latestJob.getStatus())) {
            video.setWorkflowStatus("REVIEWING");
            video = importedVideoRepository.save(video);
        }

        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public ImportedVideoDetailResponse updateSingleSubtitleSegment(
            String email,
            Long videoId,
            Long segmentId,
            AdminSubtitleUpdateRequest.SegmentUpdateItem item
    ) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        VideoSubtitleSegment seg = videoSubtitleSegmentRepository.findById(segmentId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_SEGMENT_NOT_FOUND));
        if (!seg.getImportedVideo().getId().equals(video.getId())) {
            throw new AppException(ErrorCode.VIDEO_SEGMENT_NOT_FOUND);
        }

        if (item != null) {
            if (item.getStartTime() != null && item.getStartTime() >= 0) {
                seg.setStartTime(item.getStartTime());
            }
            if (item.getEndTime() != null && item.getEndTime() > seg.getStartTime()) {
                seg.setEndTime(item.getEndTime());
            }
            if (item.getEnglishText() != null) {
                seg.setEnglishText(item.getEnglishText().replaceAll("\\s+", " ").trim());
            }
            if (item.getVietnameseText() != null) {
                seg.setVietnameseText(item.getVietnameseText().replaceAll("\\s+", " ").trim());
            }
            if (item.getEnglishNote() != null) {
                seg.setEnglishNote(item.getEnglishNote().trim());
            }
            seg.setUncertain(false);
            videoSubtitleSegmentRepository.save(seg);
        }

        List<VideoSubtitleSegment> allSegments =
                videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId());
        refreshTranscriptAndVocabulary(video, allSegments, null);

        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public ImportedVideoDetailResponse publishVideo(String email, Long videoId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        VideoProcessingJob latestJob = videoProcessingJobRepository
                .findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElse(null);
        VideoTranscript transcript = videoTranscriptRepository
                .findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElse(null);
        List<VideoSubtitleSegment> segments =
                videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId());

        List<String> blockers = evaluatePublishBlockers(video, latestJob, transcript, segments);
        if (!blockers.isEmpty()) {
            throw new AppException(ErrorCode.VIDEO_PUBLISH_REQUIREMENTS_NOT_MET);
        }

        video.setPublished(true);
        video.setWorkflowStatus("PUBLISHED");
        video.setPublishedAt(LocalDateTime.now());
        video.setReviewedByUserId(user.getId());
        video = importedVideoRepository.save(video);

        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public ImportedVideoDetailResponse unpublishVideo(String email, Long videoId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        video.setPublished(false);
        video.setWorkflowStatus("REVIEWING");
        video = importedVideoRepository.save(video);

        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public ImportedVideoDetailResponse archiveVideo(String email, Long videoId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        video.setPublished(false);
        video.setWorkflowStatus("ARCHIVED");
        video = importedVideoRepository.save(video);

        return buildSummaryOrDetail(user, video, true, true);
    }

    @Transactional
    public void deleteVideo(String email, Long videoId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        ImportedVideo video = findVideoOrThrow(videoId);

        VideoProcessingJob latestJob = videoProcessingJobRepository
                .findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElse(null);
        if (latestJob != null) {
            latestJob.setCancelRequested(true);
            videoProcessingJobRepository.save(latestJob);
            workerService.cancelActiveProcess(latestJob.getId());
        }

        videoBookmarkRepository.deleteByImportedVideoId(video.getId());
        userVideoLearningStateRepository.deleteByImportedVideoId(video.getId());
        videoVocabularyItemRepository.deleteByImportedVideoId(video.getId());
        videoSubtitleSegmentRepository.deleteByImportedVideoId(video.getId());
        videoTranscriptRepository.deleteByImportedVideoId(video.getId());
        videoAudioTrackRepository.deleteByImportedVideoId(video.getId());
        videoProcessingJobRepository.deleteByImportedVideoId(video.getId());
        importedVideoRepository.delete(video);
    }

    @Transactional(readOnly = true)
    public VideoProcessingJobResponse getJobStatus(String email, Long jobId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        VideoProcessingJob job = findJobOrThrow(jobId);
        return toJobResponse(job);
    }

    @Transactional
    public VideoProcessingJobResponse cancelJob(String email, Long jobId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        VideoProcessingJob job = findJobOrThrow(jobId);

        job.setCancelRequested(true);
        if (!"COMPLETED".equals(job.getStatus()) && !"FAILED".equals(job.getStatus())) {
            job.setStatus("CANCELLED");
            job.setCurrentStageMessage("Người quản trị đã hủy tác vụ xử lý video.");
        }
        job = videoProcessingJobRepository.save(job);

        ImportedVideo video = job.getImportedVideo();
        if (video != null && !Boolean.TRUE.equals(video.getPublished())) {
            video.setWorkflowStatus("DRAFT");
            importedVideoRepository.save(video);
        }

        workerService.cancelActiveProcess(job.getId());
        return toJobResponse(job);
    }

    @Transactional
    public VideoProcessingJobResponse retryJob(String email, Long jobId) {
        User user = findUser(email);
        requireAdminOrContentManager(user);
        VideoProcessingJob job = findJobOrThrow(jobId);

        job.setCancelRequested(false);
        job.setStatus("QUEUED");
        job.setErrorMessage(null);
        job.setRetryCount((job.getRetryCount() == null ? 0 : job.getRetryCount()) + 1);
        int nextSegment = Math.max(0, (job.getLastCompletedChunk() != null ? job.getLastCompletedChunk() : -1) + 1) + 1;
        job.setCurrentStageMessage("Đang khởi động lại từ phân đoạn #" + nextSegment);
        job = videoProcessingJobRepository.save(job);

        ImportedVideo video = job.getImportedVideo();
        if (video != null && !Boolean.TRUE.equals(video.getPublished())) {
            video.setWorkflowStatus("DOWNLOADING");
            importedVideoRepository.save(video);
        }

        submitJobAfterCommit(job.getId(), false, null);
        return toJobResponse(job);
    }

    // =========================================================================
    // USER VIDEO LEARNING LIBRARY & PERSONAL IMPORT OPERATIONS
    // =========================================================================

    @Transactional
    public ImportedVideoDetailResponse importPersonalVideo(String email, VideoImportRequest request) {
        User user = findUser(email);

        String rawUrl = request != null ? request.getYoutubeOrMediaUrlSafe() : null;
        if (rawUrl == null || rawUrl.isBlank()) {
            throw new AppException(ErrorCode.INVALID_YOUTUBE_URL);
        }

        NormalizedSource source = normalizeAndValidateUrl(rawUrl);

        // 1. Reuse existing personal video belonging strictly to this user
        Optional<ImportedVideo> ownExisting = importedVideoRepository.findFirstByUserIdAndVideoUid(user.getId(), source.videoUid());
        if (ownExisting.isPresent()) {
            ImportedVideo existing = ownExisting.get();
            if (isPublishedForLearner(existing) || isPersonalImportVideo(existing)) {
                applyOptionalImportMetadata(existing, request);
                VideoProcessingJob latestJob = videoProcessingJobRepository
                        .findFirstByImportedVideoIdOrderByCreatedAtDesc(existing.getId())
                        .orElse(null);

                if (latestJob != null && ("FAILED".equals(latestJob.getStatus()) || "CANCELLED".equals(latestJob.getStatus()))) {
                    latestJob.setStatus("QUEUED");
                    latestJob.setCancelRequested(false);
                    latestJob.setErrorMessage(null);
                    latestJob.setRetryCount((latestJob.getRetryCount() == null ? 0 : latestJob.getRetryCount()) + 1);
                    latestJob.setCurrentStageMessage("Đang thử lại tác vụ xử lý video cá nhân...");
                    videoProcessingJobRepository.save(latestJob);
                    if (!Boolean.TRUE.equals(existing.getPublished())) {
                        existing.setWorkflowStatus("DOWNLOADING");
                    }
                    importedVideoRepository.save(existing);
                    submitJobAfterCommit(latestJob.getId(), Boolean.TRUE.equals(request.getForceAsr()), request.getCustomTranscript());
                } else if (latestJob == null) {
                    if (!Boolean.TRUE.equals(existing.getPublished())) {
                        existing.setWorkflowStatus("DOWNLOADING");
                    }
                    importedVideoRepository.save(existing);
                    VideoProcessingJob job = createNewJob(user, existing);
                    submitJobAfterCommit(job.getId(), Boolean.TRUE.equals(request.getForceAsr()), request.getCustomTranscript());
                } else {
                    if ("QUEUED".equalsIgnoreCase(latestJob.getStatus())) {
                        submitJobAfterCommit(latestJob.getId(), Boolean.TRUE.equals(request.getForceAsr()), request.getCustomTranscript());
                    }
                    ensureFreshStreamUrl(existing, false);
                    importedVideoRepository.save(existing);
                }
                return buildSummaryOrDetail(user, existing, true, false);
            }
        }

        // 2. If Admin has already published this exact video in curated library, open it immediately
        List<ImportedVideo> publishedMatches = importedVideoRepository.findByPublishedTrueOrderByPublishedAtDescUpdatedAtDesc();
        for (ImportedVideo pub : publishedMatches) {
            if (isPublishedForLearner(pub) && source.videoUid().equals(pub.getVideoUid())) {
                ensureFreshStreamUrl(pub, false);
                return buildSummaryOrDetail(user, pub, true, false);
            }
        }

        // 3. Otherwise create a private personal video owned strictly by this user
        boolean autoTitle = request == null || isBlank(request.getTitle());
        boolean autoDescription = request == null || isBlank(request.getDescription());
        boolean autoTopic = request == null || isBlank(request.getTopicHint());
        String rawPrefLevel = request != null && request.getPreferredLevel() != null ? request.getPreferredLevel().trim() : "";
        boolean autoLevel = rawPrefLevel.isEmpty()
                || "AUTO".equalsIgnoreCase(rawPrefLevel)
                || "Tự động".equalsIgnoreCase(rawPrefLevel);

        ImportedVideo video = new ImportedVideo();
        video.setUser(user);
        video.setVideoUid(source.videoUid());
        video.setSourceUrl(source.canonicalUrl());
        video.setCanonicalUrl(source.canonicalUrl());
        video.setPlatform(source.platform());
        video.setTitle(!autoTitle
                ? request.getTitle().trim()
                : "Đang tải thông tin video (" + source.videoUid() + ")...");
        video.setDescription(!autoDescription ? request.getDescription().trim() : "");
        video.setThumbnailUrl(source.youtubeId() != null ? "https://img.youtube.com/vi/" + source.youtubeId() + "/hqdefault.jpg" : "");
        video.setLevel(!autoLevel ? rawPrefLevel : "AUTO");
        video.setTopic(!autoTopic ? request.getTopicHint().trim() : "");
        video.setMetadataJson(buildAutoFieldsMetadataJson(autoTitle, autoTopic, autoDescription, autoLevel, true));
        video.setWorkflowStatus("DRAFT");
        video.setPublished(false);
        video = importedVideoRepository.save(video);

        VideoProcessingJob job = createNewJob(user, video);
        video.setWorkflowStatus("DOWNLOADING");
        video = importedVideoRepository.save(video);
        submitJobAfterCommit(
                job.getId(),
                request != null && Boolean.TRUE.equals(request.getForceAsr()),
                request != null ? request.getCustomTranscript() : null
        );

        return buildSummaryOrDetail(user, video, true, false);
    }

    @Transactional(readOnly = true)
    public VideoProcessingJobResponse getPersonalJobStatus(String email, Long jobId) {
        User user = findUser(email);
        VideoProcessingJob job = requirePersonalJobAccess(user, jobId);
        return toJobResponse(job);
    }

    @Transactional
    public VideoProcessingJobResponse cancelPersonalJob(String email, Long jobId) {
        User user = findUser(email);
        VideoProcessingJob job = requirePersonalJobAccess(user, jobId);

        job.setCancelRequested(true);
        if (!"COMPLETED".equals(job.getStatus()) && !"FAILED".equals(job.getStatus())) {
            job.setStatus("CANCELLED");
            job.setCurrentStageMessage("Đã hủy tác vụ xử lý video cá nhân.");
        }
        job = videoProcessingJobRepository.save(job);

        ImportedVideo video = job.getImportedVideo();
        if (video != null && !Boolean.TRUE.equals(video.getPublished())) {
            video.setWorkflowStatus("DRAFT");
            importedVideoRepository.save(video);
        }
        workerService.cancelActiveProcess(job.getId());
        return toJobResponse(job);
    }

    @Transactional
    public VideoProcessingJobResponse retryPersonalJob(String email, Long jobId) {
        User user = findUser(email);
        VideoProcessingJob job = requirePersonalJobAccess(user, jobId);

        job.setCancelRequested(false);
        job.setStatus("QUEUED");
        job.setErrorMessage(null);
        job.setRetryCount((job.getRetryCount() == null ? 0 : job.getRetryCount()) + 1);
        job.setCurrentStageMessage("Đang thử lại tác vụ xử lý video cá nhân...");
        job = videoProcessingJobRepository.save(job);

        ImportedVideo video = job.getImportedVideo();
        if (video != null && !Boolean.TRUE.equals(video.getPublished())) {
            video.setWorkflowStatus("DOWNLOADING");
            importedVideoRepository.save(video);
        }

        submitJobAfterCommit(job.getId(), false, null);
        return toJobResponse(job);
    }

    @Transactional
    public void deletePersonalVideo(String email, Long videoId) {
        User user = findUser(email);
        ImportedVideo video = findVideoOrThrow(videoId);
        boolean isOwnerPersonal = video.getUser() != null
                && video.getUser().getId().equals(user.getId())
                && isPersonalImportVideo(video)
                && !Boolean.TRUE.equals(video.getPublished());
        if (!isOwnerPersonal) {
            throw new AccessDeniedException("Only your own personal imported videos can be removed here");
        }

        VideoProcessingJob latestJob = videoProcessingJobRepository
                .findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElse(null);
        if (latestJob != null) {
            latestJob.setCancelRequested(true);
            videoProcessingJobRepository.save(latestJob);
            workerService.cancelActiveProcess(latestJob.getId());
        }

        videoBookmarkRepository.deleteByImportedVideoId(video.getId());
        userVideoLearningStateRepository.deleteByImportedVideoId(video.getId());
        videoVocabularyItemRepository.deleteByImportedVideoId(video.getId());
        videoSubtitleSegmentRepository.deleteByImportedVideoId(video.getId());
        videoTranscriptRepository.deleteByImportedVideoId(video.getId());
        videoAudioTrackRepository.deleteByImportedVideoId(video.getId());
        videoProcessingJobRepository.deleteByImportedVideoId(video.getId());
        importedVideoRepository.delete(video);
    }

    @Transactional(readOnly = true)
    public List<ImportedVideoDetailResponse> listPublishedVideos(
            String email,
            String search,
            String level,
            String topic,
            Boolean favoritesOnly
    ) {
        User user = findUser(email);
        Map<Long, ImportedVideo> combinedById = new LinkedHashMap<>();
        for (ImportedVideo pv : importedVideoRepository.findByUserIdOrderByUpdatedAtDesc(user.getId())) {
            if (isPersonalImportVideo(pv) && !Boolean.TRUE.equals(pv.getPublished())) {
                combinedById.put(pv.getId(), pv);
            }
        }
        for (ImportedVideo pub : importedVideoRepository.findByPublishedTrueOrderByPublishedAtDescUpdatedAtDesc()) {
            if (isPublishedForLearner(pub)) {
                combinedById.putIfAbsent(pub.getId(), pub);
            }
        }
        if (combinedById.isEmpty()) {
            return List.of();
        }

        Map<Long, UserVideoLearningState> stateByVideoId = new HashMap<>();
        for (UserVideoLearningState st : userVideoLearningStateRepository.findByUserId(user.getId())) {
            if (st.getImportedVideo() != null && st.getImportedVideo().getId() != null) {
                stateByVideoId.put(st.getImportedVideo().getId(), st);
            }
        }

        String normSearch = search != null ? search.trim().toLowerCase(Locale.ROOT) : "";
        String normLevel = level != null ? level.trim().toUpperCase(Locale.ROOT) : "";
        String normTopic = topic != null ? topic.trim().toLowerCase(Locale.ROOT) : "";
        boolean onlyFav = Boolean.TRUE.equals(favoritesOnly);

        List<ImportedVideoDetailResponse> result = new ArrayList<>();
        for (ImportedVideo v : combinedById.values()) {
            if (!isAccessibleForLearner(user, v)) {
                continue;
            }
            if (!normLevel.isEmpty() && !"ALL".equals(normLevel)) {
                String vLvl = v.getLevel() != null ? v.getLevel().trim().toUpperCase(Locale.ROOT) : "";
                if (!vLvl.equals(normLevel)) {
                    continue;
                }
            }
            if (!normTopic.isEmpty() && !"all".equals(normTopic)) {
                String vTop = v.getTopic() != null ? v.getTopic().trim().toLowerCase(Locale.ROOT) : "";
                if (!vTop.contains(normTopic)) {
                    continue;
                }
            }
            if (!normSearch.isEmpty() && !matchesVideoSearch(v, normSearch)) {
                continue;
            }

            UserVideoLearningState state = stateByVideoId.get(v.getId());
            boolean isFav = state != null && Boolean.TRUE.equals(state.getFavorite());
            if (onlyFav && !isFav) {
                continue;
            }

            result.add(buildSummaryOrDetailWithPreloadedState(user, v, state, false, false));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public List<ImportedVideoDetailResponse> listMyVideos(String email) {
        return listPublishedVideos(email, null, null, null, false);
    }

    @Transactional
    public ImportedVideoDetailResponse getPublishedVideoDetail(String email, Long videoId) {
        User user = findUser(email);
        ImportedVideo video = requireAccessibleVideoForLearner(user, videoId);
        if (!isActivelyImporting(video)) {
            ensureFreshStreamUrl(video, false);
        }
        return buildSummaryOrDetail(user, video, true, false);
    }

    private boolean isActivelyImporting(ImportedVideo video) {
        if (video == null || video.getWorkflowStatus() == null) {
            return false;
        }
        String st = video.getWorkflowStatus().trim().toUpperCase(Locale.ROOT);
        return Set.of("DRAFT", "QUEUED", "FETCHING_METADATA", "DOWNLOADING", "EXTRACTING_AUDIO", "TRANSCRIBING", "TRANSLATING")
                .contains(st);
    }

    @Transactional
    public ImportedVideoDetailResponse getVideoDetail(String email, Long videoId) {
        return getPublishedVideoDetail(email, videoId);
    }

    @Transactional
    public ImportedVideoDetailResponse refreshVideoStream(String email, Long videoId) {
        User user = findUser(email);
        boolean privileged = isAdminOrContentManager(user);
        ImportedVideo video = privileged ? findVideoOrThrow(videoId) : requireAccessibleVideoForLearner(user, videoId);
        ensureFreshStreamUrl(video, true);
        return buildSummaryOrDetail(user, video, true, false);
    }

    public void streamVideoMedia(
            String email,
            Long videoId,
            String rangeHeader,
            boolean headOnly,
            HttpServletResponse response
    ) throws IOException {
        User user = findUser(email);
        boolean privileged = isAdminOrContentManager(user);
        ImportedVideo video = privileged ? findVideoOrThrow(videoId) : requireAccessibleVideoForLearner(user, videoId);

        Path localPath = resolveExistingLocalMediaPath(video);
        if (localPath != null) {
            streamLocalMediaFile(localPath, rangeHeader, headOnly, response);
            return;
        }

        String upstreamUrl = ensureFreshStreamUrl(video, false);
        if (isBlank(upstreamUrl)) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "Video stream unavailable");
            return;
        }

        if (upstreamUrl.trim().startsWith("/")) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "Local media file missing");
            return;
        }

        try {
            Response upstream = workerService.executeUpstreamMediaRequest(upstreamUrl, rangeHeader, headOnly);
            if (upstream.code() == HttpServletResponse.SC_FORBIDDEN || upstream.code() == 410) {
                upstream.close();
                String refreshedUrl = ensureFreshStreamUrl(video, true);
                if (isBlank(refreshedUrl)) {
                    response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "Unable to refresh expired video stream");
                    return;
                }
                upstream = workerService.executeUpstreamMediaRequest(refreshedUrl, rangeHeader, headOnly);
            }

            try (Response activeResp = upstream) {
                if (!activeResp.isSuccessful() && activeResp.code() != HttpServletResponse.SC_PARTIAL_CONTENT) {
                    response.sendError(activeResp.code(), "Upstream media returned HTTP " + activeResp.code());
                    return;
                }
                response.setStatus(activeResp.code());
                String contentType = activeResp.header("Content-Type");
                response.setContentType(!isBlank(contentType) ? contentType : "video/mp4");
                response.setHeader("Accept-Ranges", "bytes");
                String contentRange = activeResp.header("Content-Range");
                if (!isBlank(contentRange)) {
                    response.setHeader("Content-Range", contentRange);
                }
                String contentLength = activeResp.header("Content-Length");
                if (!isBlank(contentLength)) {
                    response.setHeader("Content-Length", contentLength);
                }
                if (headOnly || activeResp.body() == null) {
                    return;
                }
                copyStreamSafely(activeResp.body().byteStream(), response.getOutputStream(), Long.MAX_VALUE);
            }
        } catch (IOException ex) {
            if (!isClientAbortException(ex)) {
                logger.warn("Media proxy failed for video {}: {}", videoId, ex.getMessage());
                if (!response.isCommitted()) {
                    response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "Failed to proxy video media stream");
                }
            }
        }
    }

    @Transactional
    public ImportedVideoDetailResponse updateLearningState(
            String email,
            Long videoId,
            VideoLearningStateRequest request
    ) {
        User user = findUser(email);
        boolean privileged = isAdminOrContentManager(user);
        ImportedVideo video = privileged ? findVideoOrThrow(videoId) : requireAccessibleVideoForLearner(user, videoId);

        UserVideoLearningState state = userVideoLearningStateRepository
                .findByUserIdAndImportedVideoId(user.getId(), video.getId())
                .orElseGet(() -> {
                    UserVideoLearningState s = new UserVideoLearningState();
                    s.setUser(user);
                    s.setImportedVideo(video);
                    return s;
                });

        if (request != null) {
            if (request.getFavorite() != null) {
                state.setFavorite(request.getFavorite());
            }
            if (request.getLastPositionSeconds() != null && request.getLastPositionSeconds() >= 0) {
                state.setLastPositionSeconds(request.getLastPositionSeconds());
            }
            if (request.getPlaybackSpeed() != null && request.getPlaybackSpeed() >= 0.5 && request.getPlaybackSpeed() <= 2.5) {
                state.setPlaybackSpeed(request.getPlaybackSpeed());
            }
            if (request.getCompleted() != null) {
                state.setCompleted(request.getCompleted());
            }
        }
        userVideoLearningStateRepository.save(state);
        int diamondsEarned = 0;
        if (diamondRewardService != null && Boolean.TRUE.equals(state.getCompleted())) {
            int mins = Math.max(2, (video.getDurationSeconds() != null ? video.getDurationSeconds() : 120) / 60);
            diamondsEarned = diamondRewardService.grantStudyReward(
                    user, "VIDEO_COMPLETE", "video:" + video.getId(), 20, 40, mins,
                    "Hoàn thành video song ngữ: " + video.getTitle(), true);
        }
        ImportedVideoDetailResponse res = buildSummaryOrDetailWithPreloadedState(user, video, state, false, false);
        res.setDiamondsEarned(diamondsEarned);
        res.setCurrentDiamonds(user.getDiamonds());
        return res;
    }

    @Transactional
    public VideoBookmarkResponse addBookmark(String email, Long videoId, VideoBookmarkRequest request) {
        User user = findUser(email);
        ImportedVideo video = isAdminOrContentManager(user)
                ? findVideoOrThrow(videoId)
                : requireAccessibleVideoForLearner(user, videoId);

        double ts = request != null && request.getTimestampSeconds() != null
                ? Math.max(0.0, request.getTimestampSeconds())
                : 0.0;

        VideoBookmark bm = new VideoBookmark();
        bm.setUser(user);
        bm.setImportedVideo(video);
        bm.setTimestampSeconds(ts);
        bm.setLabel(request != null && !isBlank(request.getLabel())
                ? request.getLabel().trim()
                : "Bookmark @" + formatClock((int) Math.floor(ts)));
        bm.setNote(request != null && request.getNote() != null ? request.getNote().trim() : "");
        bm = videoBookmarkRepository.save(bm);

        return VideoBookmarkResponse.builder()
                .id(bm.getId())
                .timestampSeconds(bm.getTimestampSeconds())
                .timestampLabel(formatClock((int) Math.floor(bm.getTimestampSeconds())))
                .label(bm.getLabel())
                .note(bm.getNote())
                .createdAt(bm.getCreatedAt())
                .build();
    }

    @Transactional
    public void deleteBookmark(String email, Long videoId, Long bookmarkId) {
        User user = findUser(email);
        ImportedVideo video = isAdminOrContentManager(user)
                ? findVideoOrThrow(videoId)
                : requireAccessibleVideoForLearner(user, videoId);

        VideoBookmark bm = videoBookmarkRepository.findById(bookmarkId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_NOTE_NOT_FOUND));
        if (!bm.getUser().getId().equals(user.getId()) || !bm.getImportedVideo().getId().equals(video.getId())) {
            throw new AccessDeniedException("Cannot delete another user's video bookmark");
        }
        videoBookmarkRepository.delete(bm);
    }

    @Transactional(readOnly = true)
    public String exportSubtitles(String email, Long videoId, String format) {
        User user = findUser(email);
        ImportedVideo video = isAdminOrContentManager(user)
                ? findVideoOrThrow(videoId)
                : requireAccessibleVideoForLearner(user, videoId);

        List<VideoSubtitleSegment> segments =
                videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId());
        return subtitleService.exportSubtitles(segments, format, video.getTitle());
    }

    // =========================================================================
    // INTERNAL HELPERS & READINESS EVALUATION
    // =========================================================================

    public List<String> evaluatePublishBlockers(
            ImportedVideo video,
            VideoProcessingJob latestJob,
            VideoTranscript transcript,
            List<VideoSubtitleSegment> segments
    ) {
        List<String> blockers = new ArrayList<>();

        if (latestJob == null || !"COMPLETED".equalsIgnoreCase(latestJob.getStatus())) {
            blockers.add("Quá trình xử lý video chưa hoàn tất (trạng thái Job phải là COMPLETED).");
        }

        Integer expectedDur = video.getDurationSeconds();
        Integer verifiedDur = video.getVerifiedMediaDurationSeconds();
        if (expectedDur == null || expectedDur <= 0 || verifiedDur == null || verifiedDur <= 0) {
            blockers.add("Chưa xác minh được thời lượng đầy đủ của video.");
        } else {
            int tolerance = Math.max(15, (int) Math.ceil(expectedDur * 0.10));
            if (Math.abs(expectedDur - verifiedDur) > tolerance) {
                blockers.add("Thời lượng đã xử lý (" + verifiedDur + "s) không khớp với thời lượng video gốc (" + expectedDur + "s).");
            }
        }

        if (transcript == null || isBlank(transcript.getFullEnglishText())) {
            blockers.add("Chưa có transcript tiếng Anh đầy đủ.");
        }

        if (segments == null || segments.isEmpty()) {
            blockers.add("Chưa có danh sách phụ đề đồng bộ.");
        } else {
            boolean missingBilingual = segments.stream()
                    .anyMatch(s -> isBlank(s.getEnglishText()) || isBlank(s.getVietnameseText()));
            if (missingBilingual) {
                blockers.add("Tất cả phân đoạn phụ đề phải có đầy đủ câu tiếng Anh và bản dịch tiếng Việt.");
            }
        }

        if (isBlank(video.getTitle())
                || video.getTitle().startsWith("Đang tải thông tin video")
                || isBlank(video.getSourceUrl())) {
            blockers.add("Thông tin tiêu đề hoặc URL nguồn của video chưa hợp lệ.");
        }

        return blockers;
    }

    private void refreshTranscriptAndVocabulary(
            ImportedVideo video,
            List<VideoSubtitleSegment> allSegments,
            String customFullEnglish
    ) {
        StringBuilder fullEn = new StringBuilder();
        double confSum = 0.0;
        int uncertainCount = 0;
        for (VideoSubtitleSegment s : allSegments) {
            if (!isBlank(s.getEnglishText())) {
                if (!fullEn.isEmpty()) {
                    fullEn.append(" ");
                }
                fullEn.append(s.getEnglishText().trim());
            }
            confSum += s.getConfidence() != null ? s.getConfidence() : 1.0;
            if (Boolean.TRUE.equals(s.getUncertain())) {
                uncertainCount++;
            }
        }
        double avgConf = allSegments.isEmpty() ? 0.0 : Math.round((confSum / allSegments.size()) * 1000.0) / 1000.0;

        VideoTranscript tr = videoTranscriptRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElseGet(VideoTranscript::new);
        tr.setImportedVideo(video);
        if (isBlank(tr.getDetectedLanguage())) {
            tr.setDetectedLanguage(video.getAudioLanguage() != null ? video.getAudioLanguage() : "en");
        }
        if (isBlank(tr.getAsrEngine())) {
            tr.setAsrEngine("ADMIN_EDITED");
        }
        tr.setFullEnglishText(!isBlank(customFullEnglish) ? customFullEnglish : fullEn.toString());
        tr.setAverageConfidence(avgConf);
        tr.setUncertainSegmentCount(uncertainCount);
        videoTranscriptRepository.save(tr);

        List<YoutubeWordLookupResponse> extracted = subtitleService.extractKeyVocabulary(allSegments);
        videoVocabularyItemRepository.deleteByImportedVideoId(video.getId());
        List<VideoVocabularyItem> vocabEntities = new ArrayList<>();
        for (YoutubeWordLookupResponse v : extracted) {
            VideoVocabularyItem entity = new VideoVocabularyItem();
            entity.setImportedVideo(video);
            entity.setWord(v.getWord());
            entity.setNormalizedWord(v.getNormalizedWord());
            entity.setPronunciation(v.getPronunciation());
            entity.setPartOfSpeech(v.getPartOfSpeech());
            entity.setMeaningVi(v.getMeaningVi());
            entity.setMeaningEn(v.getMeaningEn());
            entity.setExampleSentence(v.getExampleSentence());
            entity.setExampleTranslation(v.getExampleTranslation());
            entity.setGrammarNote(v.getGrammarNote());
            entity.setSource(v.getSource());
            vocabEntities.add(entity);
        }
        videoVocabularyItemRepository.saveAll(vocabEntities);
    }

    private ImportedVideoDetailResponse buildSummaryOrDetail(
            User user,
            ImportedVideo video,
            boolean includeFullContent,
            boolean includeAdminMeta
    ) {
        UserVideoLearningState state = userVideoLearningStateRepository
                .findByUserIdAndImportedVideoId(user.getId(), video.getId())
                .orElse(null);
        return buildSummaryOrDetailWithPreloadedState(user, video, state, includeFullContent, includeAdminMeta);
    }

    private ImportedVideoDetailResponse buildSummaryOrDetailWithPreloadedState(
            User user,
            ImportedVideo video,
            UserVideoLearningState state,
            boolean includeFullContent,
            boolean includeAdminMeta
    ) {
        VideoProcessingJob latestJob = (includeAdminMeta || isPersonalImportVideo(video))
                ? videoProcessingJobRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId()).orElse(null)
                : null;
        VideoTranscript transcript = (includeFullContent || includeAdminMeta)
                ? videoTranscriptRepository
                        .findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                        .orElse(null)
                : null;

        List<VideoSubtitleSegment> rawSegments = (includeFullContent || includeAdminMeta)
                ? videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId())
                : List.of();

        List<VideoSubtitleSegmentResponse> segmentDtos = List.of();
        List<YoutubeWordLookupResponse> vocabDtos = List.of();
        List<YoutubeExerciseItemResponse> exerciseDtos = List.of();
        List<VideoBookmarkResponse> bookmarkDtos = List.of();

        if (includeFullContent) {
            segmentDtos = rawSegments.stream()
                    .map(s -> {
                        double safeStart = s.getStartTime() != null ? s.getStartTime() : 0.0;
                        double safeEnd = s.getEndTime() != null ? s.getEndTime() : safeStart;
                        String stLbl = formatClock((int) Math.floor(safeStart));
                        String enLbl = formatClock((int) Math.floor(safeEnd));
                        return VideoSubtitleSegmentResponse.builder()
                                .id(s.getId())
                                .sequenceNumber(s.getSequenceNumber())
                                .startTime(safeStart)
                                .endTime(safeEnd)
                                .timestampLabel(stLbl)
                                .rangeLabel(stLbl + " – " + enLbl)
                                .englishText(s.getEnglishText())
                                .vietnameseText(s.getVietnameseText())
                                .englishNote(s.getEnglishNote())
                                .confidence(s.getConfidence())
                                .uncertain(s.getUncertain())
                                .build();
                    })
                    .toList();

            List<VideoVocabularyItem> vocabs = videoVocabularyItemRepository.findByImportedVideoIdOrderByIdAsc(video.getId());
            vocabDtos = vocabs.stream()
                    .map(v -> YoutubeWordLookupResponse.builder()
                            .word(v.getWord())
                            .normalizedWord(v.getNormalizedWord())
                            .pronunciation(v.getPronunciation())
                            .partOfSpeech(v.getPartOfSpeech())
                            .meaningVi(v.getMeaningVi())
                            .meaningEn(v.getMeaningEn())
                            .exampleSentence(v.getExampleSentence())
                            .exampleTranslation(v.getExampleTranslation())
                            .grammarNote(v.getGrammarNote())
                            .source(v.getSource())
                            .build())
                    .toList();

            exerciseDtos = subtitleService.buildExercisesFromSegments(rawSegments);

            bookmarkDtos = videoBookmarkRepository
                    .findByUserIdAndImportedVideoIdOrderByTimestampSecondsAsc(user.getId(), video.getId())
                    .stream()
                    .map(bm -> VideoBookmarkResponse.builder()
                            .id(bm.getId())
                            .timestampSeconds(bm.getTimestampSeconds())
                            .timestampLabel(formatClock((int) Math.floor(bm.getTimestampSeconds())))
                            .label(bm.getLabel())
                            .note(bm.getNote())
                            .createdAt(bm.getCreatedAt())
                            .build())
                    .toList();
        }

        List<String> blockers = includeAdminMeta
                ? evaluatePublishBlockers(video, latestJob, transcript, rawSegments)
                : List.of();
        Boolean readyToPublish = includeAdminMeta ? blockers.isEmpty() : null;

        int dur = video.getDurationSeconds() != null ? video.getDurationSeconds() : 0;
        boolean userFavorite = state != null && Boolean.TRUE.equals(state.getFavorite());

        return ImportedVideoDetailResponse.builder()
                .id(video.getId())
                .videoUid(video.getVideoUid())
                .sourceUrl(video.getSourceUrl())
                .canonicalUrl(video.getCanonicalUrl())
                .platform(video.getPlatform())
                .title(video.getTitle())
                .description(video.getDescription())
                .authorName(video.getAuthorName())
                .thumbnailUrl(video.getThumbnailUrl())
                .streamVideoUrl(video.getStreamVideoUrl())
                .audioLanguage(video.getAudioLanguage())
                .durationSeconds(dur)
                .verifiedMediaDurationSeconds(video.getVerifiedMediaDurationSeconds())
                .durationLabel(formatClock(dur))
                .level(video.getLevel())
                .topic(video.getTopic())
                .workflowStatus(video.getWorkflowStatus())
                .published(Boolean.TRUE.equals(video.getPublished()))
                .publishedAt(video.getPublishedAt())
                .readyToPublish(readyToPublish)
                .publishBlockers(includeAdminMeta ? blockers : null)
                .fullEnglishTranscript(includeFullContent && transcript != null ? transcript.getFullEnglishText() : null)
                .favorite(userFavorite)
                .lastPositionSeconds(state != null ? state.getLastPositionSeconds() : 0.0)
                .playbackSpeed(state != null ? state.getPlaybackSpeed() : 1.0)
                .completed(state != null ? state.getCompleted() : false)
                .detectedLanguage(transcript != null ? transcript.getDetectedLanguage() : video.getAudioLanguage())
                .asrEngine(transcript != null ? transcript.getAsrEngine() : null)
                .averageConfidence(transcript != null ? transcript.getAverageConfidence() : null)
                .uncertainSegmentCount(transcript != null ? transcript.getUncertainSegmentCount() : 0)
                .latestJob(latestJob != null ? toJobResponse(latestJob) : null)
                .segments(segmentDtos)
                .vocabulary(vocabDtos)
                .exercises(exerciseDtos)
                .bookmarks(bookmarkDtos)
                .createdAt(video.getCreatedAt())
                .updatedAt(video.getUpdatedAt())
                .build();
    }

    private void applyOptionalImportMetadata(ImportedVideo video, VideoImportRequest request) {
        if (request == null) {
            return;
        }
        if (!isBlank(request.getTitle())) {
            video.setTitle(request.getTitle().trim());
        }
        if (!isBlank(request.getDescription())) {
            video.setDescription(request.getDescription().trim());
        }
        if (!isBlank(request.getPreferredLevel())) {
            video.setLevel(request.getPreferredLevel().trim());
        }
        if (!isBlank(request.getTopicHint())) {
            video.setTopic(request.getTopicHint().trim());
        }
    }

    private boolean matchesAdminWorkflowFilter(ImportedVideo video, String normFilter) {
        if (normFilter == null || normFilter.isEmpty() || "ALL".equals(normFilter)) {
            return true;
        }
        String status = video.getWorkflowStatus() != null
                ? video.getWorkflowStatus().trim().toUpperCase(Locale.ROOT)
                : "DRAFT";
        return switch (normFilter) {
            case "PROCESSING" -> Set.of("DRAFT", "DOWNLOADING", "TRANSCRIBING", "TRANSLATING", "QUEUED").contains(status);
            case "FAILED_OR_ARCHIVED" -> Set.of("FAILED", "ARCHIVED").contains(status);
            default -> status.equals(normFilter);
        };
    }

    private boolean matchesVideoSearch(ImportedVideo video, String normSearch) {
        return containsIgnoreCase(video.getTitle(), normSearch)
                || containsIgnoreCase(video.getDescription(), normSearch)
                || containsIgnoreCase(video.getAuthorName(), normSearch)
                || containsIgnoreCase(video.getTopic(), normSearch)
                || containsIgnoreCase(video.getVideoUid(), normSearch)
                || containsIgnoreCase(video.getSourceUrl(), normSearch);
    }

    private boolean containsIgnoreCase(String field, String needleLower) {
        return field != null && field.toLowerCase(Locale.ROOT).contains(needleLower);
    }

    private boolean isPublishedForLearner(ImportedVideo video) {
        return video != null
                && Boolean.TRUE.equals(video.getPublished())
                && "PUBLISHED".equalsIgnoreCase(video.getWorkflowStatus());
    }

    private boolean isPersonalImportVideo(ImportedVideo video) {
        if (video == null || isBlank(video.getMetadataJson())) {
            return false;
        }
        try {
            Map<String, Object> meta = METADATA_MAPPER.readValue(video.getMetadataJson(), new TypeReference<>() {});
            return Boolean.TRUE.equals(meta.get("_personalImport"));
        } catch (Exception ignored) {
            return video.getMetadataJson().contains("\"_personalImport\":true");
        }
    }

    private boolean isAccessibleForLearner(User viewer, ImportedVideo video) {
        if (isPublishedForLearner(video)) {
            return true;
        }
        return viewer != null
                && video != null
                && isPersonalImportVideo(video)
                && video.getUser() != null
                && video.getUser().getId().equals(viewer.getId());
    }

    private ImportedVideo requireAccessibleVideoForLearner(User viewer, Long videoId) {
        ImportedVideo video = importedVideoRepository.findById(videoId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_IMPORT_NOT_FOUND));
        if (!isAccessibleForLearner(viewer, video)) {
            throw new AppException(ErrorCode.VIDEO_IMPORT_NOT_FOUND);
        }
        return video;
    }

    private VideoProcessingJob requirePersonalJobAccess(User viewer, Long jobId) {
        VideoProcessingJob job = findJobOrThrow(jobId);
        ImportedVideo video = job.getImportedVideo();
        boolean ownerMatch = job.getUser() != null
                && job.getUser().getId().equals(viewer.getId())
                && video != null
                && (isPersonalImportVideo(video) || isPublishedForLearner(video));
        if (!ownerMatch && !isAdminOrContentManager(viewer)) {
            throw new AccessDeniedException("Cannot access another user's video processing job");
        }
        return job;
    }

    private ImportedVideo requirePublishedVideoForLearner(Long videoId) {
        ImportedVideo video = importedVideoRepository.findById(videoId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_IMPORT_NOT_FOUND));
        if (!isPublishedForLearner(video)) {
            throw new AppException(ErrorCode.VIDEO_IMPORT_NOT_FOUND);
        }
        return video;
    }

    private String buildAutoFieldsMetadataJson(
            boolean autoTitle,
            boolean autoTopic,
            boolean autoDescription,
            boolean autoLevel
    ) {
        return buildAutoFieldsMetadataJson(autoTitle, autoTopic, autoDescription, autoLevel, false);
    }

    private String buildAutoFieldsMetadataJson(
            boolean autoTitle,
            boolean autoTopic,
            boolean autoDescription,
            boolean autoLevel,
            boolean personalImport
    ) {
        return String.format(
                Locale.ROOT,
                "{\"_autoFields\":{\"title\":%b,\"topic\":%b,\"description\":%b,\"level\":%b},\"_personalImport\":%b}",
                autoTitle, autoTopic, autoDescription, autoLevel, personalImport
        );
    }

    private ImportedVideo findVideoOrThrow(Long videoId) {
        return importedVideoRepository.findById(videoId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_IMPORT_NOT_FOUND));
    }

    private VideoProcessingJob findJobOrThrow(Long jobId) {
        return videoProcessingJobRepository.findById(jobId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_IMPORT_NOT_FOUND));
    }

    private boolean isAdminOrContentManager(User user) {
        if (user == null || user.getRole() == null) {
            return false;
        }
        return user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.CONTENT_MANAGER;
    }

    private void requireAdminOrContentManager(User user) {
        if (!isAdminOrContentManager(user)) {
            throw new AccessDeniedException("Only Admin or Content Manager users are allowed to perform this video management operation");
        }
    }

    private void submitJobAfterCommit(Long jobId, boolean forceAsr, String customTranscript) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    workerService.submitJob(jobId, forceAsr, customTranscript);
                }
            });
        } else {
            workerService.submitJob(jobId, forceAsr, customTranscript);
        }
    }



    private VideoProcessingJob createNewJob(User user, ImportedVideo video) {
        VideoProcessingJob job = new VideoProcessingJob();
        job.setUser(user);
        job.setImportedVideo(video);
        job.setStatus("QUEUED");
        job.setOverallProgress(0);
        job.setCurrentStageMessage("Đã đưa video vào hàng đợi xử lý...");
        return videoProcessingJobRepository.save(job);
    }

    private VideoProcessingJobResponse toJobResponse(VideoProcessingJob job) {
        return VideoProcessingJobResponse.builder()
                .jobId(job.getId())
                .videoId(job.getImportedVideo() != null ? job.getImportedVideo().getId() : null)
                .status(job.getStatus())
                .overallProgress(job.getOverallProgress())
                .downloadProgress(job.getDownloadProgress())
                .audioExtractionProgress(job.getAudioExtractionProgress())
                .transcriptionProgress(job.getTranscriptionProgress())
                .translationProgress(job.getTranslationProgress())
                .totalChunks(job.getTotalChunks())
                .completedChunks(job.getCompletedChunks())
                .lastCompletedChunk(job.getLastCompletedChunk())
                .currentStageMessage(job.getCurrentStageMessage())
                .errorMessage(job.getErrorMessage())
                .retryCount(job.getRetryCount())
                .cancelRequested(job.getCancelRequested())
                .startedAt(job.getStartedAt())
                .completedAt(job.getCompletedAt())
                .build();
    }

    private record NormalizedSource(String videoUid, String youtubeId, String canonicalUrl, String platform) {}

    private NormalizedSource normalizeAndValidateUrl(String rawUrl) {
        String trimmed = rawUrl.trim();
        if (RAW_ID_PATTERN.matcher(trimmed).matches()) {
            return new NormalizedSource(trimmed, trimmed, "https://www.youtube.com/watch?v=" + trimmed, "YOUTUBE");
        }
        Matcher m = YOUTUBE_ID_PATTERN.matcher(trimmed);
        if (m.find()) {
            String vid = m.group(1);
            return new NormalizedSource(vid, vid, "https://www.youtube.com/watch?v=" + vid, "YOUTUBE");
        }
        try {
            URI uri = URI.create(trimmed);
            String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                throw new AppException(ErrorCode.INVALID_YOUTUBE_URL);
            }
            String hash = sha256Short(trimmed);
            return new NormalizedSource("url_" + hash, null, trimmed, "EXTERNAL");
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_YOUTUBE_URL);
        }
    }

    private String sha256Short(String val) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(val.getBytes(StandardCharsets.UTF_8))).substring(0, 16);
        } catch (Exception ex) {
            return String.valueOf(Math.abs(val.hashCode()));
        }
    }

    private String ensureFreshStreamUrl(ImportedVideo video, boolean forceRefresh) {
        if (video == null) {
            return null;
        }
        if (!forceRefresh && !isStreamUrlMissingOrExpired(video)) {
            return video.getStreamVideoUrl();
        }
        String targetUrl = !isBlank(video.getCanonicalUrl()) ? video.getCanonicalUrl().trim() : video.getSourceUrl();
        if (isBlank(targetUrl)) {
            return video.getStreamVideoUrl();
        }
        try {
            String freshUrl = workerService.extractFreshStreamUrl(targetUrl);
            if (!isBlank(freshUrl) && !freshUrl.equals(video.getStreamVideoUrl())) {
                video.setStreamVideoUrl(freshUrl);
                importedVideoRepository.save(video);
            }
        } catch (Exception ex) {
            logger.warn("Unable to refresh stream URL for video {}: {}", video.getId(), ex.getMessage());
        }
        return video.getStreamVideoUrl();
    }

    boolean isStreamUrlMissingOrExpired(ImportedVideo video) {
        if (video == null) {
            return false;
        }
        if (resolveExistingLocalMediaPath(video) != null) {
            return false;
        }
        String streamUrl = video.getStreamVideoUrl();
        if (isBlank(streamUrl)) {
            return !isBlank(video.getSourceUrl()) || !isBlank(video.getCanonicalUrl());
        }
        String trimmed = streamUrl.trim();
        if (trimmed.startsWith("/")) {
            return false;
        }
        if (YOUTUBE_ID_PATTERN.matcher(trimmed).find()) {
            return true;
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.contains("googlevideo.com")) {
            long expireEpoch = extractExpireEpoch(trimmed);
            if (expireEpoch <= 0) {
                return true;
            }
            return expireEpoch <= Instant.now().getEpochSecond() + STREAM_REFRESH_BUFFER_SECONDS;
        }
        return false;
    }

    private long extractExpireEpoch(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl);
            String query = uri.getRawQuery();
            if (isBlank(query)) {
                return -1L;
            }
            for (String pair : query.split("&")) {
                int idx = pair.indexOf('=');
                if (idx <= 0) {
                    continue;
                }
                String k = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                if ("expire".equalsIgnoreCase(k)) {
                    String v = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8).trim();
                    return Long.parseLong(v);
                }
            }
        } catch (Exception ignored) {
            return -1L;
        }
        return -1L;
    }

    private Path resolveExistingLocalMediaPath(ImportedVideo video) {
        if (video == null || isBlank(video.getLocalMediaPath())) {
            return null;
        }
        try {
            Path p = Paths.get(video.getLocalMediaPath().trim()).toAbsolutePath().normalize();
            return Files.isRegularFile(p) ? p : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void streamLocalMediaFile(
            Path localPath,
            String rangeHeader,
            boolean headOnly,
            HttpServletResponse response
    ) throws IOException {
        long fileLength = Files.size(localPath);
        long start = 0L;
        long end = Math.max(0L, fileLength - 1);
        boolean partial = false;

        if (!isBlank(rangeHeader) && rangeHeader.trim().toLowerCase(Locale.ROOT).startsWith("bytes=")) {
            String spec = rangeHeader.trim().substring(6).split(",")[0].trim();
            int dashIdx = spec.indexOf('-');
            if (dashIdx >= 0) {
                String startStr = spec.substring(0, dashIdx).trim();
                String endStr = spec.substring(dashIdx + 1).trim();
                try {
                    if (startStr.isEmpty() && !endStr.isEmpty()) {
                        long suffixLen = Long.parseLong(endStr);
                        start = Math.max(0L, fileLength - suffixLen);
                    } else if (!startStr.isEmpty()) {
                        start = Long.parseLong(startStr);
                        if (!endStr.isEmpty()) {
                            end = Math.min(fileLength - 1, Long.parseLong(endStr));
                        }
                    }
                    partial = true;
                } catch (NumberFormatException ignored) {
                    partial = false;
                }
            }
        }

        if (fileLength > 0 && (start >= fileLength || start > end)) {
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            response.setHeader("Content-Range", "bytes */" + fileLength);
            return;
        }

        long contentLen = fileLength == 0 ? 0 : (end - start + 1);
        response.setStatus(partial ? HttpServletResponse.SC_PARTIAL_CONTENT : HttpServletResponse.SC_OK);
        response.setContentType(detectVideoContentType(localPath));
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Length", String.valueOf(contentLen));
        if (partial) {
            response.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileLength);
        }
        if (headOnly || contentLen == 0) {
            return;
        }

        try (RandomAccessFile raf = new RandomAccessFile(localPath.toFile(), "r");
             OutputStream out = response.getOutputStream()) {
            raf.seek(start);
            byte[] buffer = new byte[STREAM_COPY_BUFFER_BYTES];
            long remaining = contentLen;
            while (remaining > 0) {
                int toRead = (int) Math.min(buffer.length, remaining);
                int read = raf.read(buffer, 0, toRead);
                if (read < 0) {
                    break;
                }
                out.write(buffer, 0, read);
                remaining -= read;
            }
            out.flush();
        } catch (IOException ex) {
            if (!isClientAbortException(ex)) {
                throw ex;
            }
        }
    }

    private String detectVideoContentType(Path path) {
        String name = path.getFileName() != null ? path.getFileName().toString().toLowerCase(Locale.ROOT) : "";
        if (name.endsWith(".webm")) return "video/webm";
        if (name.endsWith(".m4a")) return "audio/mp4";
        if (name.endsWith(".mp3")) return "audio/mpeg";
        if (name.endsWith(".mov")) return "video/quicktime";
        return "video/mp4";
    }

    private void copyStreamSafely(InputStream in, OutputStream out, long maxBytes) throws IOException {
        byte[] buffer = new byte[STREAM_COPY_BUFFER_BYTES];
        long remaining = maxBytes;
        try {
            while (remaining > 0) {
                int toRead = (int) Math.min(buffer.length, remaining);
                int read = in.read(buffer, 0, toRead);
                if (read < 0) {
                    break;
                }
                out.write(buffer, 0, read);
                remaining -= read;
            }
            out.flush();
        } catch (IOException ex) {
            if (!isClientAbortException(ex)) {
                throw ex;
            }
        }
    }

    private boolean isClientAbortException(IOException ex) {
        String msg = ex != null && ex.getMessage() != null ? ex.getMessage().toLowerCase(Locale.ROOT) : "";
        String cls = ex != null ? ex.getClass().getSimpleName().toLowerCase(Locale.ROOT) : "";
        return cls.contains("clientabort")
                || msg.contains("broken pipe")
                || msg.contains("connection reset")
                || msg.contains("an existing connection was forcibly closed")
                || msg.contains("stream closed");
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private String formatClock(int sec) {
        int s = Math.max(0, sec);
        int hrs = s / 3600;
        int mins = (s % 3600) / 60;
        int rem = s % 60;
        return hrs > 0
                ? String.format(Locale.ROOT, "%02d:%02d:%02d", hrs, mins, rem)
                : String.format(Locale.ROOT, "%02d:%02d", mins, rem);
    }
}
