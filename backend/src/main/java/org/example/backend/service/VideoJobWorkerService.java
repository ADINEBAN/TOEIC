package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import okhttp3.*;
import org.example.backend.dto.response.YoutubeWordLookupResponse;
import org.example.backend.entity.*;
import org.example.backend.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

@Service
@RequiredArgsConstructor
public class VideoJobWorkerService {

    private static final Logger logger = LoggerFactory.getLogger(VideoJobWorkerService.class);
    private static final Set<String> RESUMABLE_STATUSES = Set.of(
            "QUEUED", "FETCHING_METADATA", "DOWNLOADING", "EXTRACTING_AUDIO", "TRANSCRIBING", "TRANSLATING"
    );

    private final ImportedVideoRepository importedVideoRepository;
    private final VideoProcessingJobRepository videoProcessingJobRepository;
    private final VideoAudioTrackRepository videoAudioTrackRepository;
    private final VideoTranscriptRepository videoTranscriptRepository;
    private final VideoSubtitleSegmentRepository videoSubtitleSegmentRepository;
    private final VideoVocabularyItemRepository videoVocabularyItemRepository;
    private final VideoTranslationAndSubtitleService subtitleService;
    private final ObjectMapper objectMapper;

    @Value("${toeic.storage-dir:./data}")
    private String storageDir;

    @Value("${toeic.python-bin:python}")
    private String pythonBin;

    @Value("${toeic.ytdlp-cookies:}")
    private String ytdlpCookies;

    @Value("${toeic.ytdlp-proxy:}")
    private String ytdlpProxy;

    @Value("${toeic.ffmpeg-bin:}")
    private String ffmpegBin;

    @Value("${toeic.whisper-model:tiny.en}")
    private String whisperModel;

    @Value("${toeic.video-chunk-seconds:480}")
    private int chunkDurationSeconds;

    @Value("${toeic.resume-jobs-on-startup:true}")
    private boolean resumeJobsOnStartup;

    @Value("${openai.api-key:}")
    private String openAiApiKey;

    @Value("${openai.whisper-url:https://api.openai.com/v1/audio/transcriptions}")
    private String openAiWhisperUrl;

    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final ExecutorService chunkAsrPool = Executors.newFixedThreadPool(3);
    private final ExecutorService translationWavePool = Executors.newFixedThreadPool(4);
    private final ConcurrentHashMap<Long, Process> activeSubprocesses = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, Boolean> runningJobIds = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CompletableFuture<String>> inFlightStreamRefreshes = new ConcurrentHashMap<>();

    private final OkHttpClient whisperHttpClient = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(180, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .build();

    private final OkHttpClient mediaProxyClient = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build();

    /**
     * Extracts a fresh progressive (video + audio) playback URL from YouTube/source via yt-dlp,
     * deduplicating concurrent requests for the same URL.
     */
    public String extractFreshStreamUrl(String sourceUrl) {
        if (isBlank(sourceUrl)) {
            return null;
        }
        String key = sourceUrl.trim();
        CompletableFuture<String> existing = inFlightStreamRefreshes.get(key);
        if (existing != null && !existing.isDone()) {
            try {
                return existing.get(45, TimeUnit.SECONDS);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return null;
            } catch (Exception ignored) {
                return null;
            }
        }

        CompletableFuture<String> created = new CompletableFuture<>();
        CompletableFuture<String> race = inFlightStreamRefreshes.putIfAbsent(key, created);
        if (race != null) {
            try {
                return race.get(45, TimeUnit.SECONDS);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return null;
            } catch (Exception ignored) {
                return null;
            }
        }

        try {
            Map<String, Object> meta = runPythonBridge(null, List.of(
                    "metadata",
                    "--url", key,
                    "--ffmpeg-bin", ffmpegBin == null ? "" : ffmpegBin
            ), 45);
            String fresh = meta != null && meta.get("streamVideoUrl") != null
                    ? String.valueOf(meta.get("streamVideoUrl")).trim()
                    : "";
            String result = fresh.isBlank() ? null : fresh;
            created.complete(result);
            return result;
        } catch (Exception ex) {
            logger.warn("Failed to refresh stream URL for {}: {}", key, ex.getMessage());
            created.complete(null);
            return null;
        } finally {
            inFlightStreamRefreshes.remove(key, created);
        }
    }

    /**
     * Opens an upstream HTTP stream response forwarding Range headers so mobile ExoPlayer
     * can play and seek cleanly even when direct CDN access is IP-restricted or throttled.
     */
    public Response executeUpstreamMediaRequest(String upstreamUrl, String rangeHeader, boolean headOnly) throws IOException {
        Request.Builder reqBuilder = new Request.Builder()
                .url(upstreamUrl)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36")
                .header("Accept", "*/*");
        if (rangeHeader != null && !rangeHeader.isBlank()) {
            reqBuilder.header("Range", rangeHeader.trim());
        }
        if (headOnly) {
            reqBuilder.head();
        } else {
            reqBuilder.get();
        }
        return mediaProxyClient.newCall(reqBuilder.build()).execute();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumeInterruptedJobsOnStartup() {
        if (!resumeJobsOnStartup) {
            return;
        }
        executor.submit(this::scanAndDispatchPendingJobs);
    }

    /**
     * Watchdog every 12 seconds ensures no newly created QUEUED job ever stays orphaned.
     */
    @Scheduled(fixedDelay = 12000, initialDelay = 12000)
    public void sweepStalledQueuedJobs() {
        if (!resumeJobsOnStartup) {
            return;
        }
        try {
            List<VideoProcessingJob> queued = videoProcessingJobRepository.findByStatusInOrderByCreatedAtAsc(List.of("QUEUED"));
            for (VideoProcessingJob job : queued) {
                if (!Boolean.TRUE.equals(job.getCancelRequested()) && !runningJobIds.containsKey(job.getId())) {
                    logger.info("Watchdog dispatching queued video job id={}", job.getId());
                    submitJob(job.getId(), false, null);
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void scanAndDispatchPendingJobs() {
        try {
            List<VideoProcessingJob> pending = videoProcessingJobRepository.findByStatusInOrderByCreatedAtAsc(RESUMABLE_STATUSES);
            for (VideoProcessingJob job : pending) {
                if (!Boolean.TRUE.equals(job.getCancelRequested())) {
                    logger.info("Resuming interrupted video processing job id={} status={} lastChunk={}",
                            job.getId(), job.getStatus(), job.getLastCompletedChunk());
                    submitJob(job.getId(), false, null);
                }
            }
        } catch (Exception ex) {
            logger.warn("Startup job resumption check skipped: {}", ex.getMessage());
        }
    }

    @PreDestroy
    public void shutdownWorkerPool() {
        for (Process proc : activeSubprocesses.values()) {
            try {
                proc.descendants().forEach(ProcessHandle::destroyForcibly);
                proc.destroyForcibly();
            } catch (Exception ignored) {
            }
        }
        chunkAsrPool.shutdownNow();
        translationWavePool.shutdownNow();
        executor.shutdownNow();
    }

    public void submitJob(Long jobId, boolean forceAsr, String customTranscript) {
        if (runningJobIds.putIfAbsent(jobId, Boolean.TRUE) != null) {
            return;
        }
        executor.submit(() -> {
            try {
                executeJobPipeline(jobId, forceAsr, customTranscript);
            } finally {
                runningJobIds.remove(jobId);
                activeSubprocesses.remove(jobId);
            }
        });
    }

    public void cancelActiveProcess(Long jobId) {
        Process proc = activeSubprocesses.get(jobId);
        if (proc != null) {
            try {
                proc.descendants().forEach(ProcessHandle::destroyForcibly);
                proc.destroyForcibly();
            } catch (Exception ignored) {
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void executeJobPipeline(Long jobId, boolean forceAsr, String customTranscript) {
        // Wait briefly in case caller hasn't flushed commit yet (belt-and-suspenders alongside afterCommit)
        VideoProcessingJob job = null;
        for (int attempt = 0; attempt < 8; attempt++) {
            job = videoProcessingJobRepository.findById(jobId).orElse(null);
            if (job != null) {
                break;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        if (job == null || job.getImportedVideo() == null) {
            return;
        }
        ImportedVideo video = importedVideoRepository.findById(job.getImportedVideo().getId()).orElse(null);
        if (video == null) {
            return;
        }

        if (job.getStartedAt() == null) {
            job.setStartedAt(LocalDateTime.now());
        }
        job.setErrorMessage(null);
        videoProcessingJobRepository.save(job);

        try {
            checkCancelled(jobId);
            if (!Boolean.TRUE.equals(video.getPublished())) {
                video.setWorkflowStatus("DOWNLOADING");
                importedVideoRepository.save(video);
            }

            List<VideoTranslationAndSubtitleService.RawSegmentInput> englishSegments = null;
            String asrEngine = "YOUTUBE_FULL_CAPTIONS";
            String detectedLang = !isBlank(video.getAudioLanguage()) ? video.getAudioLanguage() : "en";

            // Fast Combined Stage 1 + Stage 2 for YouTube videos without forced ASR/custom transcript
            boolean needMeta = video.getDurationSeconds() == null || video.getDurationSeconds() <= 0 || isBlank(video.getStreamVideoUrl());
            boolean tryFastCaptions = isBlank(customTranscript) && !forceAsr && "YOUTUBE".equalsIgnoreCase(video.getPlatform());

            if (needMeta && tryFastCaptions) {
                updateJobStage(job, "FETCHING_METADATA", 8, "Đang lấy nhanh thông tin video & phụ đề gốc song song...");
                Map<String, Object> combined = runPythonBridge(jobId, List.of(
                        "metadata-and-captions",
                        "--url", video.getSourceUrl(),
                        "--ffmpeg-bin", ffmpegBin == null ? "" : ffmpegBin
                ), 90);

                if (combined.get("metadata") instanceof Map<?, ?> metaMap) {
                    applyVideoMetadata(video, (Map<String, Object>) metaMap);
                    importedVideoRepository.save(video);
                }
                if (combined.get("captions") instanceof Map<?, ?> capRes) {
                    boolean complete = Boolean.TRUE.equals(capRes.get("complete"));
                    if (complete && capRes.get("segments") instanceof List<?> rawList && !rawList.isEmpty()) {
                        englishSegments = convertSegmentsList(rawList, 0);
                        asrEngine = capRes.get("engine") != null ? String.valueOf(capRes.get("engine")) : "YOUTUBE_FULL_CAPTIONS";
                        video.setVerifiedMediaDurationSeconds(video.getDurationSeconds());
                        if (!Boolean.TRUE.equals(video.getPublished())) {
                            video.setWorkflowStatus("TRANSLATING");
                        }
                        importedVideoRepository.save(video);
                        job.setDownloadProgress(100);
                        job.setAudioExtractionProgress(100);
                        job.setTranscriptionProgress(100);
                        job.setTotalChunks(1);
                        job.setCompletedChunks(1);
                        job.setLastCompletedChunk(0);
                        updateJobStage(job, "TRANSLATING", 60, "Đã lấy đủ " + englishSegments.size() + " câu phụ đề. Đang dịch song song Anh–Việt...");
                    }
                }
            } else if (needMeta) {
                updateJobStage(job, "FETCHING_METADATA", 5, "Đang lấy thông tin đầy đủ video từ nguồn...");
                Map<String, Object> meta = runPythonBridge(jobId, List.of(
                        "metadata",
                        "--url", video.getSourceUrl(),
                        "--ffmpeg-bin", ffmpegBin == null ? "" : ffmpegBin
                ), 90);
                applyVideoMetadata(video, meta);
                importedVideoRepository.save(video);
            }

            checkCancelled(jobId);
            if (!isBlank(customTranscript)) {
                if (!Boolean.TRUE.equals(video.getPublished())) {
                    video.setWorkflowStatus("TRANSCRIBING");
                    importedVideoRepository.save(video);
                }
                englishSegments = parseFullCustomTranscript(customTranscript, video.getDurationSeconds());
                if (video.getVerifiedMediaDurationSeconds() == null || video.getVerifiedMediaDurationSeconds() <= 0) {
                    int estDur = video.getDurationSeconds() != null && video.getDurationSeconds() > 0
                            ? video.getDurationSeconds()
                            : Math.max(6, englishSegments.size() * 6);
                    video.setDurationSeconds(estDur);
                    video.setVerifiedMediaDurationSeconds(estDur);
                    importedVideoRepository.save(video);
                }
                asrEngine = "CUSTOM_TRANSCRIPT";
                job.setDownloadProgress(100);
                job.setAudioExtractionProgress(100);
                job.setTranscriptionProgress(100);
                if (!Boolean.TRUE.equals(video.getPublished())) {
                    video.setWorkflowStatus("TRANSLATING");
                    importedVideoRepository.save(video);
                }
                updateJobStage(job, "TRANSLATING", 65, "Đang dịch song ngữ toàn bộ transcript...");
            }

            // Fallback fast caption check if metadata already cached earlier
            if (englishSegments == null && tryFastCaptions && !needMeta) {
                updateJobStage(job, "DOWNLOADING", 15, "Đang kiểm tra phụ đề gốc toàn thời lượng video...");
                Map<String, Object> capRes = runPythonBridge(jobId, List.of(
                        "fetch-captions",
                        "--url", video.getSourceUrl(),
                        "--expected-duration", String.valueOf(video.getDurationSeconds() != null ? video.getDurationSeconds() : 0)
                ), 90);

                boolean complete = Boolean.TRUE.equals(capRes.get("complete"));
                if (complete && capRes.get("segments") instanceof List<?> rawList && !rawList.isEmpty()) {
                    englishSegments = convertSegmentsList(rawList, 0);
                    asrEngine = capRes.get("engine") != null ? String.valueOf(capRes.get("engine")) : "YOUTUBE_FULL_CAPTIONS";
                    video.setVerifiedMediaDurationSeconds(video.getDurationSeconds());
                    if (!Boolean.TRUE.equals(video.getPublished())) {
                        video.setWorkflowStatus("TRANSLATING");
                    }
                    importedVideoRepository.save(video);
                    job.setDownloadProgress(100);
                    job.setAudioExtractionProgress(100);
                    job.setTranscriptionProgress(100);
                    job.setTotalChunks(1);
                    job.setCompletedChunks(1);
                    job.setLastCompletedChunk(0);
                    updateJobStage(job, "TRANSLATING", 60, "Đã lấy đủ " + englishSegments.size() + " câu phụ đề. Đang dịch Anh–Việt...");
                }
            }

            // Priority 2: Download FULL audio -> Single-pass FFmpeg segmenting -> Parallel Chunk Whisper ASR
            boolean usedAudioAsr = false;
            if (englishSegments == null) {
                usedAudioAsr = true;
                Path workdir = Paths.get(storageDir, "videos", "vid_" + video.getId()).toAbsolutePath().normalize();
                Files.createDirectories(workdir);

                if (!Boolean.TRUE.equals(video.getPublished())) {
                    video.setWorkflowStatus("DOWNLOADING");
                    importedVideoRepository.save(video);
                }
                updateJobStage(job, "DOWNLOADING", 20, "Đang tải luồng âm thanh & tách phân đoạn FFmpeg nhanh...");
                Map<String, Object> prepRes = runPythonBridge(jobId, List.of(
                        "prepare-audio",
                        "--url", video.getSourceUrl(),
                        "--workdir", workdir.toString(),
                        "--chunk-seconds", String.valueOf(chunkDurationSeconds),
                        "--expected-duration", String.valueOf(video.getDurationSeconds() != null ? video.getDurationSeconds() : 0),
                        "--ffmpeg-bin", ffmpegBin == null ? "" : ffmpegBin
                ), 1800);

                int actualDuration = prepRes.get("actualDurationSeconds") instanceof Number n ? n.intValue() : 0;
                int chunkCount = prepRes.get("chunkCount") instanceof Number n ? n.intValue() : 1;
                String audioFilePath = prepRes.get("audioFilePath") != null ? String.valueOf(prepRes.get("audioFilePath")) : "";

                if (actualDuration > 0 && (video.getDurationSeconds() == null || video.getDurationSeconds() == 0)) {
                    video.setDurationSeconds(actualDuration);
                }
                video.setVerifiedMediaDurationSeconds(actualDuration);
                importedVideoRepository.save(video);

                VideoAudioTrack track = videoAudioTrackRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                        .orElseGet(VideoAudioTrack::new);
                track.setImportedVideo(video);
                track.setAudioFilePath(audioFilePath);
                track.setCodec("mp3_16khz_mono_32k");
                track.setSampleRate(16000);
                track.setDurationSeconds(actualDuration);
                track.setChunkCount(chunkCount);
                track.setChunkDurationSeconds(chunkDurationSeconds);
                track.setStatus("READY");
                videoAudioTrackRepository.save(track);

                job.setDownloadProgress(100);
                job.setAudioExtractionProgress(100);
                job.setTotalChunks(chunkCount);
                if (!Boolean.TRUE.equals(video.getPublished())) {
                    video.setWorkflowStatus("TRANSCRIBING");
                    importedVideoRepository.save(video);
                }
                updateJobStage(job, "TRANSCRIBING", 40, "Đang nhận dạng giọng nói AI song song (" + chunkCount + " phân đoạn)...");

                List<Map<String, Object>> chunks = prepRes.get("chunks") instanceof List<?> cList
                        ? (List<Map<String, Object>>) cList
                        : List.of();

                int resumeFrom = Math.max(0, job.getLastCompletedChunk() + 1);
                if (resumeFrom == 0) {
                    videoSubtitleSegmentRepository.deleteByImportedVideoId(video.getId());
                } else {
                    videoSubtitleSegmentRepository.deleteByImportedVideoIdAndChunkIndexGreaterThanEqual(video.getId(), resumeFrom);
                }

                int runningSeq = videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId()).size();

                // Parallel chunk transcription (waves of 3 chunks) while preserving chronological checkpoint order
                int waveSize = 3;
                for (int waveStart = resumeFrom; waveStart < chunks.size(); waveStart += waveSize) {
                    checkCancelled(jobId);
                    int waveEnd = Math.min(chunks.size(), waveStart + waveSize);
                    List<CompletableFuture<ChunkAsrOutcome>> chunkFutures = new ArrayList<>();

                    for (int cIdx = waveStart; cIdx < waveEnd; cIdx++) {
                        Map<String, Object> chunk = chunks.get(cIdx);
                        String chunkPath = String.valueOf(chunk.get("filePath"));
                        double offsetSec = chunk.get("offsetSeconds") instanceof Number n ? n.doubleValue() : (cIdx * chunkDurationSeconds);
                        chunkFutures.add(CompletableFuture.supplyAsync(() -> {
                            try {
                                return transcribeChunkBestEngine(jobId, chunkPath, offsetSec);
                            } catch (Exception e) {
                                throw new CompletionException(e);
                            }
                        }, chunkAsrPool));
                    }

                    for (int offsetIdx = 0; offsetIdx < chunkFutures.size(); offsetIdx++) {
                        checkCancelled(jobId);
                        int cIdx = waveStart + offsetIdx;
                        ChunkAsrOutcome outcome;
                        try {
                            outcome = chunkFutures.get(offsetIdx).join();
                        } catch (CompletionException ce) {
                            Throwable cause = ce.getCause() != null ? ce.getCause() : ce;
                            if (cause instanceof Exception ex) throw ex;
                            throw new IllegalStateException(cause);
                        }
                        asrEngine = outcome.engine();
                        detectedLang = outcome.detectedLanguage();
                        List<VideoTranslationAndSubtitleService.RawSegmentInput> normalizedChunk =
                                subtitleService.mergeAndNormalizeSegments(outcome.segments());

                        List<VideoSubtitleSegment> entities = new ArrayList<>();
                        for (VideoTranslationAndSubtitleService.RawSegmentInput r : normalizedChunk) {
                            runningSeq++;
                            VideoSubtitleSegment entity = new VideoSubtitleSegment();
                            entity.setImportedVideo(video);
                            entity.setSequenceNumber(runningSeq);
                            entity.setStartTime(r.startTime());
                            entity.setEndTime(r.endTime());
                            entity.setEnglishText(r.englishText());
                            entity.setVietnameseText("");
                            entity.setEnglishNote("Confidence: " + Math.round(r.confidence() * 100) + "%");
                            entity.setConfidence(r.confidence());
                            entity.setUncertain(r.uncertain());
                            entity.setChunkIndex(cIdx);
                            entities.add(entity);
                        }
                        videoSubtitleSegmentRepository.saveAll(entities);

                        job.setLastCompletedChunk(cIdx);
                        job.setCompletedChunks(cIdx + 1);
                        int trPct = (int) Math.round(((double) (cIdx + 1) / Math.max(1, chunks.size())) * 100.0);
                        job.setTranscriptionProgress(trPct);
                        updateJobStage(job, "TRANSCRIBING", 40 + (trPct / 4),
                                "Đã nhận dạng giọng nói phân đoạn " + (cIdx + 1) + "/" + chunks.size());
                    }
                }
            }

            checkCancelled(jobId);
            if (!usedAudioAsr && englishSegments != null) {
                List<VideoTranslationAndSubtitleService.RawSegmentInput> normalized =
                        subtitleService.mergeAndNormalizeSegments(englishSegments);
                videoSubtitleSegmentRepository.deleteByImportedVideoId(video.getId());
                List<VideoSubtitleSegment> initial = new ArrayList<>();
                int seq = 1;
                for (VideoTranslationAndSubtitleService.RawSegmentInput r : normalized) {
                    VideoSubtitleSegment entity = new VideoSubtitleSegment();
                    entity.setImportedVideo(video);
                    entity.setSequenceNumber(seq++);
                    entity.setStartTime(r.startTime());
                    entity.setEndTime(r.endTime());
                    entity.setEnglishText(r.englishText());
                    entity.setVietnameseText("");
                    entity.setEnglishNote("Original spoken English segment");
                    entity.setConfidence(r.confidence());
                    entity.setUncertain(r.uncertain());
                    entity.setChunkIndex(r.chunkIndex());
                    initial.add(entity);
                }
                videoSubtitleSegmentRepository.saveAll(initial);
            }

            // Stage 4: Parallel Batch EN -> VI Translation (batch=35, up to 4 concurrent batches)
            if (!Boolean.TRUE.equals(video.getPublished())) {
                video.setWorkflowStatus("TRANSLATING");
                importedVideoRepository.save(video);
            }
            List<VideoSubtitleSegment> allSegments =
                    videoSubtitleSegmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(video.getId());

            int batchSize = 35;
            int total = allSegments.size();
            List<List<VideoSubtitleSegment>> batches = new ArrayList<>();
            for (int start = 0; start < total; start += batchSize) {
                batches.add(allSegments.subList(start, Math.min(total, start + batchSize)));
            }

            int waveSize = 4;
            int translatedSoFar = 0;
            String contextTitle = video.getTitle();
            for (int wStart = 0; wStart < batches.size(); wStart += waveSize) {
                checkCancelled(jobId);
                int wEnd = Math.min(batches.size(), wStart + waveSize);
                List<List<VideoSubtitleSegment>> waveSlices = batches.subList(wStart, wEnd);

                List<CompletableFuture<List<String>>> futures = new ArrayList<>();
                for (List<VideoSubtitleSegment> slice : waveSlices) {
                    boolean needsTranslation = slice.stream().anyMatch(s -> isBlank(s.getVietnameseText()));
                    if (!needsTranslation) {
                        futures.add(CompletableFuture.completedFuture(null));
                    } else {
                        List<String> texts = slice.stream().map(VideoSubtitleSegment::getEnglishText).toList();
                        futures.add(CompletableFuture.supplyAsync(
                                () -> subtitleService.translateBatchToVietnamese(texts, contextTitle),
                                translationWavePool
                        ));
                    }
                }

                for (int idx = 0; idx < waveSlices.size(); idx++) {
                    List<VideoSubtitleSegment> slice = waveSlices.get(idx);
                    List<String> translated = futures.get(idx).join();
                    if (translated != null) {
                        for (int k = 0; k < slice.size(); k++) {
                            String vi = k < translated.size() && !isBlank(translated.get(k))
                                    ? translated.get(k)
                                    : "[Chưa dịch] " + slice.get(k).getEnglishText();
                            slice.get(k).setVietnameseText(vi);
                        }
                        videoSubtitleSegmentRepository.saveAll(slice);
                    }
                    translatedSoFar += slice.size();
                }

                int tlPct = (int) Math.round(((double) translatedSoFar / Math.max(1, total)) * 100.0);
                job.setTranslationProgress(tlPct);
                updateJobStage(job, "TRANSLATING", 65 + (int) Math.round(tlPct * 0.28),
                        "Đang dịch song ngữ Anh–Việt (" + translatedSoFar + "/" + total + " câu)...");
            }

            // Stage 5: AI Auto-Summarize Blank Fields (Title, Topic, Description, Level) + Save Transcript & Vocabulary
            checkCancelled(jobId);
            updateJobStage(job, "SAVING", 95, "AI đang tóm tắt tiêu đề, chủ đề, mô tả & lưu dữ liệu...");
            applyAiMetadataSummaryIfRequested(video, allSegments);
            saveTranscriptAndVocabulary(video, allSegments, detectedLang, asrEngine);

            boolean personalImport = isPersonalImportVideo(video);
            if (!Boolean.TRUE.equals(video.getPublished())) {
                video.setWorkflowStatus(personalImport ? "PERSONAL" : "REVIEWING");
                video.setPublished(false);
            } else {
                video.setWorkflowStatus("PUBLISHED");
            }
            importedVideoRepository.save(video);

            job.setStatus("COMPLETED");
            job.setOverallProgress(100);
            job.setTranslationProgress(100);
            job.setTranscriptionProgress(100);
            job.setCurrentStageMessage(personalImport
                    ? "Hoàn tất xử lý (" + allSegments.size() + " câu phụ đề). Sẵn sàng học ngay!"
                    : "Hoàn tất xử lý (" + allSegments.size() + " câu phụ đề). Sẵn sàng duyệt & xuất bản.");
            job.setCompletedAt(LocalDateTime.now());
            videoProcessingJobRepository.save(job);
        } catch (CancellationException cex) {
            if (!Boolean.TRUE.equals(video.getPublished())) {
                video.setWorkflowStatus("DRAFT");
                importedVideoRepository.save(video);
            }
            job.setStatus("CANCELLED");
            job.setCurrentStageMessage(isPersonalImportVideo(video)
                    ? "Đã hủy tác vụ xử lý video cá nhân."
                    : "Người quản trị đã hủy tác vụ xử lý video.");
            videoProcessingJobRepository.save(job);
        } catch (Exception ex) {
            logger.error("Video processing failed for jobId={}: {}", jobId, ex.getMessage(), ex);
            if (!Boolean.TRUE.equals(video.getPublished())) {
                video.setWorkflowStatus("FAILED");
                video.setPublished(false);
                importedVideoRepository.save(video);
            }
            job.setStatus("FAILED");
            job.setErrorMessage(ex.getMessage());
            job.setCurrentStageMessage("Xử lý thất bại: " + ex.getMessage());
            videoProcessingJobRepository.save(job);
        }
    }

    @SuppressWarnings("unchecked")
    private void applyAiMetadataSummaryIfRequested(ImportedVideo video, List<VideoSubtitleSegment> allSegments) {
        Map<String, Object> metaMap = readMetadataMap(video.getMetadataJson());
        Map<String, Object> autoFields = metaMap.get("_autoFields") instanceof Map<?, ?> m
                ? new LinkedHashMap<>((Map<String, Object>) m)
                : new LinkedHashMap<>();

        boolean needTitle = Boolean.TRUE.equals(autoFields.get("title"))
                || isBlank(video.getTitle())
                || video.getTitle().startsWith("Đang tải thông tin video");
        boolean needTopic = Boolean.TRUE.equals(autoFields.get("topic"))
                || isBlank(video.getTopic())
                || "General English".equalsIgnoreCase(video.getTopic().trim());
        boolean needDesc = Boolean.TRUE.equals(autoFields.get("description"))
                || isBlank(video.getDescription());
        boolean needLevel = Boolean.TRUE.equals(autoFields.get("level"))
                || isBlank(video.getLevel())
                || "AUTO".equalsIgnoreCase(video.getLevel().trim());

        if (!needTitle && !needTopic && !needDesc && !needLevel) {
            return;
        }

        StringBuilder fullEn = new StringBuilder();
        StringBuilder sampleVi = new StringBuilder();
        for (int i = 0; i < allSegments.size(); i++) {
            VideoSubtitleSegment s = allSegments.get(i);
            if (!isBlank(s.getEnglishText())) {
                if (!fullEn.isEmpty()) fullEn.append(" ");
                fullEn.append(s.getEnglishText().trim());
            }
            if (i < 4 && !isBlank(s.getVietnameseText())) {
                if (!sampleVi.isEmpty()) sampleVi.append(" ");
                sampleVi.append(s.getVietnameseText().trim());
            }
        }

        String rawSourceTitle = metaMap.get("title") != null
                ? String.valueOf(metaMap.get("title"))
                : video.getTitle();

        VideoTranslationAndSubtitleService.VideoMetadataSummary summary =
                subtitleService.summarizeVideoMetadataWithAi(
                        fullEn.toString(),
                        rawSourceTitle,
                        video.getAuthorName(),
                        sampleVi.toString()
                );

        if (needTitle && !isBlank(summary.title())) {
            video.setTitle(summary.title());
        }
        if (needTopic && !isBlank(summary.topic())) {
            video.setTopic(summary.topic());
        }
        if (needDesc && !isBlank(summary.descriptionVi())) {
            video.setDescription(summary.descriptionVi());
        }
        if (needLevel && !isBlank(summary.level())) {
            video.setLevel(summary.level());
        }

        autoFields.put("title", false);
        autoFields.put("topic", false);
        autoFields.put("description", false);
        autoFields.put("level", false);
        metaMap.put("_autoFields", autoFields);
        writeMetadataMap(video, metaMap);
    }

    private Map<String, Object> readMetadataMap(String rawJson) {
        if (isBlank(rawJson)) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(rawJson, new TypeReference<>() {});
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    private void writeMetadataMap(ImportedVideo video, Map<String, Object> map) {
        try {
            video.setMetadataJson(objectMapper.writeValueAsString(map));
        } catch (Exception ignored) {
        }
    }

    private record ChunkAsrOutcome(
            String engine,
            String detectedLanguage,
            List<VideoTranslationAndSubtitleService.RawSegmentInput> segments
    ) {}

    private ChunkAsrOutcome transcribeChunkBestEngine(Long jobId, String chunkPath, double offsetSec) throws Exception {
        if (openAiApiKey != null && !openAiApiKey.isBlank()) {
            try {
                ChunkAsrOutcome apiOut = callOpenAiWhisperApi(chunkPath, offsetSec);
                if (apiOut != null && !apiOut.segments().isEmpty()) {
                    return apiOut;
                }
            } catch (Exception ex) {
                logger.warn("OpenAI Whisper API fallback to local faster-whisper for chunk={}: {}", chunkPath, ex.getMessage());
            }
        }

        Map<String, Object> localRes = runPythonBridge(jobId, List.of(
                "transcribe-chunk",
                "--audio", chunkPath,
                "--offset", String.valueOf(offsetSec),
                "--model", isBlank(whisperModel) ? "tiny.en" : whisperModel
        ), 900);

        String eng = localRes.get("asrEngine") != null ? String.valueOf(localRes.get("asrEngine")) : "FASTER_WHISPER";
        String lang = localRes.get("detectedLanguage") != null ? String.valueOf(localRes.get("detectedLanguage")) : "en";
        List<?> rawList = localRes.get("segments") instanceof List<?> l ? l : List.of();
        return new ChunkAsrOutcome(eng, lang, convertSegmentsList(rawList, 0));
    }

    @SuppressWarnings("unchecked")
    private ChunkAsrOutcome callOpenAiWhisperApi(String chunkPath, double offsetSec) throws IOException {
        File f = new File(chunkPath);
        if (!f.exists() || f.length() > 24L * 1024L * 1024L) {
            return null;
        }
        RequestBody body = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", f.getName(), RequestBody.create(f, MediaType.parse("audio/mpeg")))
                .addFormDataPart("model", "whisper-1")
                .addFormDataPart("response_format", "verbose_json")
                .build();
        Request req = new Request.Builder()
                .url(openAiWhisperUrl)
                .header("Authorization", "Bearer " + openAiApiKey.trim())
                .post(body)
                .build();

        try (Response res = whisperHttpClient.newCall(req).execute()) {
            if (!res.isSuccessful() || res.body() == null) {
                throw new IOException("OpenAI Whisper HTTP " + res.code());
            }
            Map<String, Object> parsed = objectMapper.readValue(res.body().string(), new TypeReference<>() {});
            String lang = parsed.get("language") != null ? String.valueOf(parsed.get("language")) : "en";
            List<VideoTranslationAndSubtitleService.RawSegmentInput> segs = new ArrayList<>();
            if (parsed.get("segments") instanceof List<?> list) {
                for (Object item : list) {
                    if (item instanceof Map<?, ?> m) {
                        double st = offsetSec + (m.get("start") instanceof Number n ? n.doubleValue() : 0.0);
                        double en = offsetSec + (m.get("end") instanceof Number n ? n.doubleValue() : st + 2.0);
                        String txt = m.get("text") != null ? String.valueOf(m.get("text")).trim() : "";
                        double logp = m.get("avg_logprob") instanceof Number n ? n.doubleValue() : -0.35;
                        double conf = Math.max(0.05, Math.min(0.99, Math.exp(logp * 0.65)));
                        boolean uncertain = logp < -1.05;
                        if (!txt.isEmpty()) {
                            segs.add(new VideoTranslationAndSubtitleService.RawSegmentInput(st, en, txt, conf, uncertain, 0));
                        }
                    }
                }
            }
            return new ChunkAsrOutcome("OPENAI_WHISPER_API", lang, segs);
        }
    }

    private void saveTranscriptAndVocabulary(
            ImportedVideo video,
            List<VideoSubtitleSegment> allSegments,
            String detectedLang,
            String asrEngine
    ) {
        StringBuilder fullEn = new StringBuilder();
        double confSum = 0.0;
        int uncertainCount = 0;
        for (VideoSubtitleSegment s : allSegments) {
            if (!fullEn.isEmpty()) fullEn.append(" ");
            fullEn.append(s.getEnglishText());
            confSum += s.getConfidence() != null ? s.getConfidence() : 0.9;
            if (Boolean.TRUE.equals(s.getUncertain())) {
                uncertainCount++;
            }
        }
        double avgConf = allSegments.isEmpty() ? 0.0 : Math.round((confSum / allSegments.size()) * 1000.0) / 1000.0;

        VideoTranscript tr = videoTranscriptRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(video.getId())
                .orElseGet(VideoTranscript::new);
        tr.setImportedVideo(video);
        tr.setDetectedLanguage(detectedLang);
        tr.setAsrEngine(asrEngine);
        tr.setFullEnglishText(fullEn.toString());
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

    private Map<String, Object> runPythonBridge(Long jobId, List<String> subArgs, long timeoutSeconds) throws Exception {
        Path script = resolveVideoScript();
        List<String> cmd = new ArrayList<>();
        cmd.add(pythonBin);
        cmd.add(script.toAbsolutePath().toString());
        cmd.addAll(subArgs);

        ProcessBuilder pb = new ProcessBuilder(cmd);
        if (!isBlank(ytdlpCookies)) {
            pb.environment().put("TOEIC_YTDLP_COOKIES", ytdlpCookies.trim());
        }
        if (!isBlank(ytdlpProxy)) {
            pb.environment().put("TOEIC_YTDLP_PROXY", ytdlpProxy.trim());
        }
        pb.redirectErrorStream(false);
        Process proc = pb.start();
        if (jobId != null) {
            activeSubprocesses.put(jobId, proc);
        }
        try {
            byte[] stdoutBytes = proc.getInputStream().readAllBytes();
            byte[] stderrBytes = proc.getErrorStream().readAllBytes();
            boolean finished = proc.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                proc.destroyForcibly();
                throw new IllegalStateException("Video processing step timed out after " + timeoutSeconds + "s");
            }
            if (jobId != null) {
                checkCancelled(jobId);
            }

            String stdout = new String(stdoutBytes, StandardCharsets.UTF_8).trim();
            String stderr = new String(stderrBytes, StandardCharsets.UTF_8).trim();
            if (proc.exitValue() != 0) {
                if (!stdout.isBlank() && stdout.startsWith("{")) {
                    Map<String, Object> errMap = objectMapper.readValue(stdout, new TypeReference<>() {});
                    throw new IllegalStateException(String.valueOf(errMap.getOrDefault("error", stderr)));
                }
                throw new IllegalStateException(!stderr.isBlank() ? stderr : "Python bridge exited with " + proc.exitValue());
            }
            return objectMapper.readValue(stdout, new TypeReference<>() {});
        } finally {
            if (jobId != null) {
                activeSubprocesses.remove(jobId, proc);
            }
        }
    }

    private Path resolveVideoScript() throws IOException {
        for (Path p : List.of(Paths.get("scripts", "video_processor.py"), Paths.get("backend", "scripts", "video_processor.py"))) {
            if (Files.isRegularFile(p)) {
                return p;
            }
        }
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("scripts/video_processor.py")) {
            if (in != null) {
                Path dir = Paths.get(storageDir, "runtime_scripts").toAbsolutePath().normalize();
                Files.createDirectories(dir);
                Path target = dir.resolve("video_processor.py");
                Files.write(target, in.readAllBytes());
                return target;
            }
        }
        throw new IOException("video_processor.py script not found");
    }

    private void applyVideoMetadata(ImportedVideo video, Map<String, Object> meta) {
        if (meta.get("canonicalUrl") != null) video.setCanonicalUrl(String.valueOf(meta.get("canonicalUrl")));
        if (meta.get("platform") != null) video.setPlatform(String.valueOf(meta.get("platform")));
        if (meta.get("title") != null && (isBlank(video.getTitle()) || video.getTitle().startsWith("Đang tải thông tin video"))) {
            video.setTitle(String.valueOf(meta.get("title")));
        }
        if (meta.get("authorName") != null && isBlank(video.getAuthorName())) {
            video.setAuthorName(String.valueOf(meta.get("authorName")));
        }
        if (meta.get("thumbnailUrl") != null && !String.valueOf(meta.get("thumbnailUrl")).isBlank()) {
            video.setThumbnailUrl(String.valueOf(meta.get("thumbnailUrl")));
        }
        if (meta.get("streamVideoUrl") != null && !String.valueOf(meta.get("streamVideoUrl")).isBlank()) {
            video.setStreamVideoUrl(String.valueOf(meta.get("streamVideoUrl")));
        }
        if (meta.get("audioLanguage") != null) video.setAudioLanguage(String.valueOf(meta.get("audioLanguage")));
        if (meta.get("durationSeconds") instanceof Number n) {
            video.setDurationSeconds(n.intValue());
        }
        // Preserve existing _autoFields and _personalImport marker while storing fetched source metadata
        Map<String, Object> existingMeta = readMetadataMap(video.getMetadataJson());
        Object autoFields = existingMeta.get("_autoFields");
        Object personalFlag = existingMeta.get("_personalImport");
        Map<String, Object> mergedMeta = new LinkedHashMap<>(meta);
        if (autoFields != null) {
            mergedMeta.put("_autoFields", autoFields);
        }
        if (Boolean.TRUE.equals(personalFlag)) {
            mergedMeta.put("_personalImport", true);
        }
        writeMetadataMap(video, mergedMeta);
    }

    private boolean isPersonalImportVideo(ImportedVideo video) {
        if (video == null) {
            return false;
        }
        Map<String, Object> meta = readMetadataMap(video.getMetadataJson());
        return Boolean.TRUE.equals(meta.get("_personalImport"));
    }

    private List<VideoTranslationAndSubtitleService.RawSegmentInput> convertSegmentsList(List<?> rawList, int defaultChunk) {
        List<VideoTranslationAndSubtitleService.RawSegmentInput> out = new ArrayList<>();
        for (Object obj : rawList) {
            if (obj instanceof Map<?, ?> m) {
                double st = m.get("start_time") instanceof Number n ? n.doubleValue() : 0.0;
                double en = m.get("end_time") instanceof Number n ? n.doubleValue() : st + 2.0;
                String txt = m.get("english_text") != null ? String.valueOf(m.get("english_text")) : "";
                double conf = m.get("confidence") instanceof Number n ? n.doubleValue() : 0.92;
                boolean unc = Boolean.TRUE.equals(m.get("uncertain"));
                if (!txt.isBlank()) {
                    out.add(new VideoTranslationAndSubtitleService.RawSegmentInput(st, en, txt, conf, unc, defaultChunk));
                }
            }
        }
        return out;
    }

    private List<VideoTranslationAndSubtitleService.RawSegmentInput> parseFullCustomTranscript(String text, Integer durationSec) {
        String[] lines = text.split("\\r?\\n|(?<=[.!?])\\s+");
        List<String> valid = Arrays.stream(lines).map(String::trim).filter(s -> s.length() >= 3).toList();
        int totalDur = durationSec != null && durationSec > 0 ? durationSec : Math.max(6, valid.size() * 6);
        double step = valid.isEmpty() ? 6.0 : Math.max(2.0, (double) totalDur / valid.size());
        List<VideoTranslationAndSubtitleService.RawSegmentInput> out = new ArrayList<>();
        for (int i = 0; i < valid.size(); i++) {
            double st = i * step;
            double en = (i + 1) * step;
            out.add(new VideoTranslationAndSubtitleService.RawSegmentInput(st, en, valid.get(i), 0.99, false, 0));
        }
        return out;
    }

    private void checkCancelled(Long jobId) {
        VideoProcessingJob latest = videoProcessingJobRepository.findById(jobId).orElse(null);
        if (latest != null && Boolean.TRUE.equals(latest.getCancelRequested())) {
            throw new CancellationException("Job cancelled by user");
        }
    }

    private void updateJobStage(VideoProcessingJob job, String status, int overall, String message) {
        job.setStatus(status);
        job.setOverallProgress(overall);
        job.setCurrentStageMessage(message);
        videoProcessingJobRepository.save(job);
    }

    private boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
