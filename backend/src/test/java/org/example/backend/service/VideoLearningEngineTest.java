package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.dto.request.AdminSubtitleUpdateRequest;
import org.example.backend.dto.request.AdminVideoUpdateRequest;
import org.example.backend.dto.request.VideoBookmarkRequest;
import org.example.backend.dto.request.VideoImportRequest;
import org.example.backend.dto.request.VideoLearningStateRequest;
import org.example.backend.dto.response.ImportedVideoDetailResponse;
import org.example.backend.dto.response.VideoBookmarkResponse;
import org.example.backend.dto.response.VideoProcessingJobResponse;
import org.example.backend.entity.*;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserRole;
import org.example.backend.exception.AppException;
import org.example.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VideoLearningEngineTest {

    @TempDir
    Path tempDir;

    @Mock private UserRepository userRepository;
    @Mock private ImportedVideoRepository importedVideoRepository;
    @Mock private VideoProcessingJobRepository jobRepository;
    @Mock private VideoAudioTrackRepository audioTrackRepository;
    @Mock private VideoTranscriptRepository transcriptRepository;
    @Mock private VideoSubtitleSegmentRepository segmentRepository;
    @Mock private UserVideoLearningStateRepository stateRepository;
    @Mock private VideoBookmarkRepository bookmarkRepository;
    @Mock private VideoVocabularyItemRepository vocabRepository;
    @Mock private VocabularyRepository coreVocabRepository;
    @Mock private VideoJobWorkerService workerService;

    private ObjectMapper objectMapper;
    private VideoTranslationAndSubtitleService subtitleService;
    private VideoLearningService videoLearningService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        subtitleService = new VideoTranslationAndSubtitleService(objectMapper, coreVocabRepository);
        videoLearningService = new VideoLearningService(
                userRepository,
                importedVideoRepository,
                jobRepository,
                audioTrackRepository,
                transcriptRepository,
                segmentRepository,
                stateRepository,
                bookmarkRepository,
                vocabRepository,
                subtitleService,
                workerService
        );
    }

    @Test
    void handlesFullDurationsFor1Min10Min30MinAnd60PlusMinWithoutTruncation() {
        int[] testDurationsSec = {60, 600, 1800, 3600, 5400}; // 1m, 10m, 30m, 60m, 90m
        for (int duration : testDurationsSec) {
            List<VideoTranslationAndSubtitleService.RawSegmentInput> raw = new ArrayList<>();
            int chunkSize = 300;
            for (int t = 0; t < duration; t += 15) {
                int chunkIdx = t / chunkSize;
                raw.add(new VideoTranslationAndSubtitleService.RawSegmentInput(
                        t, t + 14.5,
                        "Segment spoken cleanly at timestamp " + t + " seconds.",
                        0.92, false, chunkIdx
                ));
            }
            raw.add(new VideoTranslationAndSubtitleService.RawSegmentInput(
                    0.0, 14.5, "Segment spoken cleanly at timestamp 0 seconds.", 0.92, false, 0
            ));

            List<VideoTranslationAndSubtitleService.RawSegmentInput> merged = subtitleService.mergeAndNormalizeSegments(raw);
            assertEquals(duration / 15, merged.size(), "Duration " + duration + "s must not be truncated");
            double firstStart = merged.get(0).startTime();
            double lastEnd = merged.get(merged.size() - 1).endTime();
            assertTrue(firstStart >= 0.0);
            assertTrue(lastEnd > duration - 20, "Final subtitle timestamp must span full video length for " + duration + "s");

            for (int i = 1; i < merged.size(); i++) {
                assertTrue(merged.get(i).startTime() >= merged.get(i - 1).endTime(), "Subtitles must not overlap unintentionally");
                assertTrue(merged.get(i).endTime() > merged.get(i).startTime());
            }
        }
    }

    @Test
    void verifiesRealFfmpegAudioExtractionDurationAndChunkOrdering() throws Exception {
        Path audioWav = tempDir.resolve("long_sample_125s.mp3");
        String genCmd = String.format(
                "import imageio_ffmpeg, subprocess; ff=imageio_ffmpeg.get_ffmpeg_exe(); " +
                "subprocess.check_call([ff, '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=125', '-b:a', '32k', r'%s'])",
                audioWav.toAbsolutePath()
        );
        Process p1 = new ProcessBuilder("python", "-c", genCmd).start();
        assertEquals(0, p1.waitFor());

        Path workDir = tempDir.resolve("chunk_work");
        ProcessBuilder pb = new ProcessBuilder(
                "python",
                Path.of("scripts", "video_processor.py").toAbsolutePath().toString(),
                "prepare-audio",
                "--url", audioWav.toUri().toString(),
                "--workdir", workDir.toString(),
                "--chunk-seconds", "45",
                "--expected-duration", "125"
        );
        pb.redirectErrorStream(false);
        Process proc = pb.start();
        String stdout = new String(proc.getInputStream().readAllBytes());
        assertEquals(0, proc.waitFor(), "prepare-audio should succeed cleanly");

        Map<String, Object> result = objectMapper.readValue(stdout, new TypeReference<>() {});
        int actualDur = ((Number) result.get("actualDurationSeconds")).intValue();
        int chunkCount = ((Number) result.get("chunkCount")).intValue();
        assertTrue(actualDur >= 123 && actualDur <= 127, "Must extract complete 125s audio, not truncate to 60s");
        assertEquals(3, chunkCount, "125s split at 45s chunks = 3 chronological chunks");

        ProcessBuilder mismatchPb = new ProcessBuilder(
                "python",
                Path.of("scripts", "video_processor.py").toAbsolutePath().toString(),
                "prepare-audio",
                "--url", audioWav.toUri().toString(),
                "--workdir", tempDir.resolve("mismatch_work").toString(),
                "--chunk-seconds", "45",
                "--expected-duration", "3600"
        );
        Process mismatchProc = mismatchPb.start();
        String errOut = new String(mismatchProc.getInputStream().readAllBytes());
        assertNotEquals(0, mismatchProc.waitFor());
        assertTrue(errOut.contains("DURATION_MISMATCH"));
    }

    @Test
    void exportsSubtitlesPreservingUtf8VietnameseDiacritics() throws Exception {
        VideoSubtitleSegment seg1 = new VideoSubtitleSegment();
        seg1.setSequenceNumber(1);
        seg1.setStartTime(0.0);
        seg1.setEndTime(4.25);
        seg1.setEnglishText("Learning a new language requires consistent practice.");
        seg1.setVietnameseText("Việc học một ngôn ngữ mới đòi hỏi sự luyện tập thường xuyên.");
        seg1.setConfidence(0.95);
        seg1.setUncertain(false);

        String biSrt = subtitleService.exportSubtitles(List.of(seg1), "srt_bilingual", "Practice Video");
        assertTrue(biSrt.contains("00:00:00,000 --> 00:00:04,250"));
        assertTrue(biSrt.contains("Learning a new language requires consistent practice."));
        assertTrue(biSrt.contains("Việc học một ngôn ngữ mới đòi hỏi sự luyện tập thường xuyên."));

        String enSrt = subtitleService.exportSubtitles(List.of(seg1), "srt_en", "Practice Video");
        assertTrue(enSrt.contains("Learning a new language"));
        assertFalse(enSrt.contains("Việc học"));

        String viSrt = subtitleService.exportSubtitles(List.of(seg1), "srt_vi", "Practice Video");
        assertFalse(viSrt.contains("Learning a new language"));
        assertTrue(viSrt.contains("ngôn ngữ"));

        String vtt = subtitleService.exportSubtitles(List.of(seg1), "vtt", "Practice Video");
        assertTrue(vtt.startsWith("WEBVTT"));
        assertTrue(vtt.contains("00:00:00.000 --> 00:00:04.250"));

        String json = subtitleService.exportSubtitles(List.of(seg1), "json", "Practice Video");
        Map<?, ?> parsed = objectMapper.readValue(json, Map.class);
        assertEquals(1, parsed.get("segmentCount"));
    }

    @Test
    void enforcesAdminAndContentManagerRbacWhileBlockingRegularUsers() throws Exception {
        User admin = new User();
        admin.setId(1L);
        admin.setEmail("admin@toeic.test");
        admin.setRole(UserRole.ADMIN);

        User contentManager = new User();
        contentManager.setId(2L);
        contentManager.setEmail("cm@toeic.test");
        contentManager.setRole(UserRole.CONTENT_MANAGER);

        User regularUser = new User();
        regularUser.setId(3L);
        regularUser.setEmail("learner@toeic.test");
        regularUser.setRole(UserRole.USER);

        when(userRepository.findByEmail("admin@toeic.test")).thenReturn(Optional.of(admin));
        when(userRepository.findByEmail("cm@toeic.test")).thenReturn(Optional.of(contentManager));
        when(userRepository.findByEmail("learner@toeic.test")).thenReturn(Optional.of(regularUser));

        // Regular user MUST be denied on import, listAdmin, edit metadata, edit subtitles, publish, unpublish, archive, delete, and job retry/cancel
        VideoImportRequest importReq = new VideoImportRequest();
        importReq.setVideoUrl("https://youtu.be/dQw4w9WgXcQ");
        assertThrows(AccessDeniedException.class, () -> videoLearningService.importVideo("learner@toeic.test", importReq));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.listAdminVideos("learner@toeic.test", null, null));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.updateVideoMetadata("learner@toeic.test", 101L, new AdminVideoUpdateRequest()));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.updateSubtitles("learner@toeic.test", 101L, new AdminSubtitleUpdateRequest()));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.publishVideo("learner@toeic.test", 101L));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.unpublishVideo("learner@toeic.test", 101L));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.archiveVideo("learner@toeic.test", 101L));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.deleteVideo("learner@toeic.test", 101L));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.cancelJob("learner@toeic.test", 501L));
        assertThrows(AccessDeniedException.class, () -> videoLearningService.retryJob("learner@toeic.test", 501L));

        // Admin & Content Manager can import, cancel, retry, and run concurrent imports cleanly
        ImportedVideo existingVid = new ImportedVideo();
        existingVid.setId(101L);
        existingVid.setUser(admin);
        existingVid.setVideoUid("dQw4w9WgXcQ");
        existingVid.setSourceUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        existingVid.setTitle("Existing Full Video");
        existingVid.setDurationSeconds(2700);
        existingVid.setWorkflowStatus("FAILED");
        existingVid.setPublished(false);

        VideoProcessingJob failedJob = new VideoProcessingJob();
        failedJob.setId(501L);
        failedJob.setUser(admin);
        failedJob.setImportedVideo(existingVid);
        failedJob.setStatus("FAILED");
        failedJob.setLastCompletedChunk(4);
        failedJob.setRetryCount(0);

        when(importedVideoRepository.findFirstByVideoUid("dQw4w9WgXcQ")).thenReturn(Optional.of(existingVid));
        when(jobRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(101L)).thenReturn(Optional.of(failedJob));
        when(jobRepository.findById(501L)).thenReturn(Optional.of(failedJob));
        when(jobRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(importedVideoRepository.save(any())).thenAnswer(inv -> {
            ImportedVideo v = inv.getArgument(0);
            if (v.getId() == null) v.setId((long) (Math.abs(v.getVideoUid().hashCode()) % 10000 + 200));
            return v;
        });

        ImportedVideoDetailResponse dupRes = videoLearningService.importVideo("admin@toeic.test", importReq);
        assertEquals(101L, dupRes.getId());
        assertEquals("DOWNLOADING", dupRes.getWorkflowStatus());
        assertEquals(1, failedJob.getRetryCount());
        verify(workerService, times(1)).submitJob(eq(501L), eq(false), any());

        VideoProcessingJobResponse cancelled = videoLearningService.cancelJob("cm@toeic.test", 501L);
        assertEquals("CANCELLED", cancelled.getStatus());
        assertEquals("DRAFT", existingVid.getWorkflowStatus());
        verify(workerService, times(1)).cancelActiveProcess(501L);

        VideoProcessingJobResponse retried = videoLearningService.retryJob("cm@toeic.test", 501L);
        assertEquals("QUEUED", retried.getStatus());
        assertEquals("DOWNLOADING", existingVid.getWorkflowStatus());
        assertEquals(2, retried.getRetryCount());

        // Concurrent imports by Content Manager
        when(importedVideoRepository.findFirstByVideoUid("8jPQjjsBbIc")).thenReturn(Optional.empty());
        when(importedVideoRepository.findFirstByVideoUid("HXV3zeQKqGY")).thenReturn(Optional.empty());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch latch = new CountDownLatch(2);
        for (String id : List.of("8jPQjjsBbIc", "HXV3zeQKqGY")) {
            pool.submit(() -> {
                try {
                    VideoImportRequest req = new VideoImportRequest();
                    req.setVideoUrl("https://www.youtube.com/watch?v=" + id);
                    req.setTitle("TOEIC Lecture " + id);
                    videoLearningService.importVideo("cm@toeic.test", req);
                } finally {
                    latch.countDown();
                }
            });
        }
        assertTrue(latch.await(5, TimeUnit.SECONDS));
        pool.shutdownNow();
    }

    @Test
    void enforcesPublishingReadinessWorkflowSubtitleEditingAndLearnerLibraryVisibility() {
        User admin = new User();
        admin.setId(1L);
        admin.setEmail("admin@toeic.test");
        admin.setRole(UserRole.ADMIN);

        User learnerA = new User();
        learnerA.setId(10L);
        learnerA.setEmail("learnerA@toeic.test");
        learnerA.setRole(UserRole.USER);

        User learnerB = new User();
        learnerB.setId(11L);
        learnerB.setEmail("learnerB@toeic.test");
        learnerB.setRole(UserRole.USER);

        when(userRepository.findByEmail("admin@toeic.test")).thenReturn(Optional.of(admin));
        when(userRepository.findByEmail("learnerA@toeic.test")).thenReturn(Optional.of(learnerA));
        when(userRepository.findByEmail("learnerB@toeic.test")).thenReturn(Optional.of(learnerB));

        ImportedVideo reviewingVid = new ImportedVideo();
        reviewingVid.setId(301L);
        reviewingVid.setUser(admin);
        reviewingVid.setVideoUid("toeicVid301");
        reviewingVid.setSourceUrl("https://www.youtube.com/watch?v=toeicVid301");
        reviewingVid.setTitle("TOEIC Part 7 Business Email Strategy");
        reviewingVid.setDescription("Detailed walkthrough of double-passage business correspondence.");
        reviewingVid.setLevel("B2");
        reviewingVid.setTopic("Business Correspondence");
        reviewingVid.setDurationSeconds(900);
        reviewingVid.setVerifiedMediaDurationSeconds(900);
        reviewingVid.setWorkflowStatus("REVIEWING");
        reviewingVid.setPublished(false);

        ImportedVideo failedVid = new ImportedVideo();
        failedVid.setId(302L);
        failedVid.setUser(admin);
        failedVid.setVideoUid("failedVid302");
        failedVid.setSourceUrl("https://www.youtube.com/watch?v=failedVid302");
        failedVid.setTitle("Broken Draft Video");
        failedVid.setWorkflowStatus("FAILED");
        failedVid.setPublished(false);

        VideoProcessingJob completedJob = new VideoProcessingJob();
        completedJob.setId(801L);
        completedJob.setUser(admin);
        completedJob.setImportedVideo(reviewingVid);
        completedJob.setStatus("COMPLETED");
        completedJob.setOverallProgress(100);

        VideoTranscript transcript = new VideoTranscript();
        transcript.setId(901L);
        transcript.setImportedVideo(reviewingVid);
        transcript.setDetectedLanguage("en");
        transcript.setAsrEngine("OPENAI_WHISPER_API");
        transcript.setFullEnglishText("Please review the attached invoice before Friday.");

        List<VideoSubtitleSegment> segments = new ArrayList<>();
        VideoSubtitleSegment seg = new VideoSubtitleSegment();
        seg.setId(1001L);
        seg.setImportedVideo(reviewingVid);
        seg.setSequenceNumber(1);
        seg.setStartTime(0.0);
        seg.setEndTime(5.5);
        seg.setEnglishText("Please review the attached invoice before Friday.");
        seg.setVietnameseText(""); // Missing Vietnamese translation initially!
        segments.add(seg);

        Map<String, UserVideoLearningState> stateStore = new HashMap<>();
        List<VideoBookmark> bookmarkStore = new ArrayList<>();

        when(importedVideoRepository.findById(301L)).thenReturn(Optional.of(reviewingVid));
        when(importedVideoRepository.findById(302L)).thenReturn(Optional.of(failedVid));
        when(importedVideoRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(jobRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(301L)).thenReturn(Optional.of(completedJob));
        when(transcriptRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(301L)).thenReturn(Optional.of(transcript));
        when(transcriptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(segmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(301L)).thenAnswer(inv -> new ArrayList<>(segments));
        when(segmentRepository.saveAll(anyIterable())).thenAnswer(inv -> {
            segments.clear();
            @SuppressWarnings("unchecked")
            Iterable<VideoSubtitleSegment> items = (Iterable<VideoSubtitleSegment>) inv.getArgument(0);
            for (VideoSubtitleSegment item : items) segments.add(item);
            return new ArrayList<>(segments);
        });
        when(importedVideoRepository.findByPublishedTrueOrderByPublishedAtDescUpdatedAtDesc()).thenAnswer(inv -> {
            List<ImportedVideo> pub = new ArrayList<>();
            if (Boolean.TRUE.equals(reviewingVid.getPublished())) pub.add(reviewingVid);
            if (Boolean.TRUE.equals(failedVid.getPublished())) pub.add(failedVid);
            return pub;
        });
        when(stateRepository.findByUserIdAndImportedVideoId(anyLong(), anyLong())).thenAnswer(inv ->
                Optional.ofNullable(stateStore.get(inv.getArgument(0) + ":" + inv.getArgument(1))));
        when(stateRepository.findByUserId(anyLong())).thenAnswer(inv -> {
            Long uid = inv.getArgument(0);
            return stateStore.values().stream().filter(s -> s.getUser().getId().equals(uid)).toList();
        });
        when(stateRepository.save(any())).thenAnswer(inv -> {
            UserVideoLearningState s = inv.getArgument(0);
            stateStore.put(s.getUser().getId() + ":" + s.getImportedVideo().getId(), s);
            return s;
        });
        when(bookmarkRepository.save(any())).thenAnswer(inv -> {
            VideoBookmark bm = inv.getArgument(0);
            bm.setId((long) (bookmarkStore.size() + 1));
            bookmarkStore.add(bm);
            return bm;
        });
        when(bookmarkRepository.findById(anyLong())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return bookmarkStore.stream().filter(b -> b.getId().equals(id)).findFirst();
        });
        when(bookmarkRepository.findByUserIdAndImportedVideoIdOrderByTimestampSecondsAsc(anyLong(), anyLong())).thenAnswer(inv -> {
            Long uid = inv.getArgument(0);
            Long vid = inv.getArgument(1);
            return bookmarkStore.stream()
                    .filter(b -> b.getUser().getId().equals(uid) && b.getImportedVideo().getId().equals(vid))
                    .toList();
        });

        // 1. Before publish: REVIEWING and FAILED videos are completely invisible to regular users!
        assertTrue(videoLearningService.listPublishedVideos("learnerA@toeic.test", null, null, null, false).isEmpty());
        AppException unpublishedAccess = assertThrows(AppException.class,
                () -> videoLearningService.getPublishedVideoDetail("learnerA@toeic.test", 301L));
        assertEquals(ErrorCode.VIDEO_IMPORT_NOT_FOUND, unpublishedAccess.getErrorCode());

        AppException failedAccess = assertThrows(AppException.class,
                () -> videoLearningService.getPublishedVideoDetail("learnerA@toeic.test", 302L));
        assertEquals(ErrorCode.VIDEO_IMPORT_NOT_FOUND, failedAccess.getErrorCode());

        // 2. Publish gate blocks publishing when bilingual subtitle translation is incomplete!
        AppException blockedPublish = assertThrows(AppException.class,
                () -> videoLearningService.publishVideo("admin@toeic.test", 301L));
        assertEquals(ErrorCode.VIDEO_PUBLISH_REQUIREMENTS_NOT_MET, blockedPublish.getErrorCode());

        // 3. Admin edits bilingual subtitles before publishing
        AdminSubtitleUpdateRequest subEdit = new AdminSubtitleUpdateRequest();
        AdminSubtitleUpdateRequest.SegmentUpdateItem item = new AdminSubtitleUpdateRequest.SegmentUpdateItem();
        item.setId(1001L);
        item.setStartTime(0.0);
        item.setEndTime(5.5);
        item.setEnglishText("Please review the attached invoice before Friday.");
        item.setVietnameseText("Vui lòng kiểm tra hóa đơn đính kèm trước thứ Sáu.");
        subEdit.setSegments(List.of(item));

        ImportedVideoDetailResponse afterEdit = videoLearningService.updateSubtitles("admin@toeic.test", 301L, subEdit);
        assertTrue(afterEdit.getReadyToPublish(), "Blockers should be empty after completing bilingual subtitles");
        assertEquals("REVIEWING", afterEdit.getWorkflowStatus());

        // 4. Admin publishes video -> appears in User Learning Library!
        ImportedVideoDetailResponse published = videoLearningService.publishVideo("admin@toeic.test", 301L);
        assertTrue(published.getPublished());
        assertEquals("PUBLISHED", published.getWorkflowStatus());
        assertNotNull(published.getPublishedAt());

        List<ImportedVideoDetailResponse> learnerList =
                videoLearningService.listPublishedVideos("learnerA@toeic.test", "invoice", "B2", null, false);
        assertTrue(learnerList.isEmpty(), "Search on non-matching title/desc returns empty");

        List<ImportedVideoDetailResponse> matchingList =
                videoLearningService.listPublishedVideos("learnerA@toeic.test", "correspondence", "B2", "Business", false);
        assertEquals(1, matchingList.size());
        assertEquals(301L, matchingList.get(0).getId());

        // 5. Learner A tracks progress, favorites video, and bookmarks timestamp; Learner B remains isolated!
        VideoLearningStateRequest stateReq = new VideoLearningStateRequest();
        stateReq.setFavorite(true);
        stateReq.setLastPositionSeconds(42.5);
        stateReq.setPlaybackSpeed(1.25);
        ImportedVideoDetailResponse stateResA = videoLearningService.updateLearningState("learnerA@toeic.test", 301L, stateReq);
        assertTrue(stateResA.getFavorite());
        assertEquals(42.5, stateResA.getLastPositionSeconds());
        assertEquals(1.25, stateResA.getPlaybackSpeed());

        ImportedVideoDetailResponse detailB = videoLearningService.getPublishedVideoDetail("learnerB@toeic.test", 301L);
        assertFalse(detailB.getFavorite(), "Learner A's favorite must NOT mutate Learner B's state");
        assertEquals(0.0, detailB.getLastPositionSeconds());

        VideoBookmarkRequest bmReq = new VideoBookmarkRequest();
        bmReq.setTimestampSeconds(3.2);
        bmReq.setLabel("Important phrase");
        VideoBookmarkResponse savedBm = videoLearningService.addBookmark("learnerA@toeic.test", 301L, bmReq);
        assertThrows(AccessDeniedException.class,
                () -> videoLearningService.deleteBookmark("learnerB@toeic.test", 301L, savedBm.getId()));

        // 6. Admin unpublishes video -> immediately disappears from Learner Library!
        videoLearningService.unpublishVideo("admin@toeic.test", 301L);
        assertTrue(videoLearningService.listPublishedVideos("learnerA@toeic.test", null, null, null, false).isEmpty());
        assertThrows(AppException.class, () -> videoLearningService.getPublishedVideoDetail("learnerA@toeic.test", 301L));
    }

    @Test
    void transcribesRealEnglishSpeechWithFasterWhisperAndAppliesChunkOffset() throws Exception {
        if (!System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            return;
        }
        Path spokenWav = tempDir.resolve("toeic_speech.wav");
        String psCmd = String.format(
                "Add-Type -AssemblyName System.Speech; " +
                "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
                "$s.SetOutputToWaveFile('%s'); " +
                "$s.Speak('Welcome to the quarterly budget meeting. Please review the financial report carefully.'); " +
                "$s.Dispose()",
                spokenWav.toAbsolutePath().toString().replace("'", "''")
        );
        Process synth = new ProcessBuilder("powershell", "-NoProfile", "-Command", psCmd).start();
        assertEquals(0, synth.waitFor());
        assertTrue(Files.size(spokenWav) > 4000);

        ProcessBuilder pb = new ProcessBuilder(
                "python",
                Path.of("scripts", "video_processor.py").toAbsolutePath().toString(),
                "transcribe-chunk",
                "--audio", spokenWav.toAbsolutePath().toString(),
                "--offset", "300",
                "--model", "tiny.en"
        );
        Process proc = pb.start();
        String stdout = new String(proc.getInputStream().readAllBytes());
        assertEquals(0, proc.waitFor(), "transcribe-chunk must exit 0");

        Map<String, Object> res = objectMapper.readValue(stdout, new TypeReference<>() {});
        assertEquals("en", res.get("detectedLanguage"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> segs = (List<Map<String, Object>>) res.get("segments");
        assertNotNull(segs);
        assertFalse(segs.isEmpty(), "Whisper must recognize real English speech");

        StringBuilder fullText = new StringBuilder();
        for (Map<String, Object> seg : segs) {
            double st = ((Number) seg.get("start_time")).doubleValue();
            double conf = ((Number) seg.get("confidence")).doubleValue();
            assertTrue(st >= 300.0, "Timestamp must reflect global chunk offset >= 300s");
            assertTrue(conf > 0.1 && conf <= 1.0);
            fullText.append(String.valueOf(seg.get("english_text"))).append(" ");
        }
        String joined = fullText.toString().toLowerCase(Locale.ROOT);
        assertTrue(joined.contains("budget") || joined.contains("meeting") || joined.contains("report"),
                "Transcribed speech should contain spoken TOEIC words, got: " + joined);
    }

    @Test
    void resumesInterruptedChunkProcessingJobAndCompletesFullTranslation() throws Exception {
        if (!System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            return;
        }
        Path spokenWav = tempDir.resolve("chunk1_speech.wav");
        String psCmd = String.format(
                "Add-Type -AssemblyName System.Speech; " +
                "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
                "$s.SetOutputToWaveFile('%s'); " +
                "$s.Speak('The marketing proposal was approved by management.'); " +
                "$s.Dispose()",
                spokenWav.toAbsolutePath().toString().replace("'", "''")
        );
        assertEquals(0, new ProcessBuilder("powershell", "-NoProfile", "-Command", psCmd).start().waitFor());

        Path fullMp3 = tempDir.resolve("resumable_full.mp3");
        String concatPy = String.format(
                "import imageio_ffmpeg, subprocess; ff=imageio_ffmpeg.get_ffmpeg_exe(); " +
                "subprocess.check_call([ff,'-y','-f','lavfi','-t','42','-i','anullsrc=r=16000:cl=mono','-i',r'%s'," +
                "'-filter_complex','[0:a][1:a]concat=n=2:v=0:a=1[out]','-map','[out]','-b:a','32k',r'%s'])",
                spokenWav.toAbsolutePath(), fullMp3.toAbsolutePath()
        );
        assertEquals(0, new ProcessBuilder("python", "-c", concatPy).start().waitFor());

        User owner = new User();
        owner.setId(9L);
        owner.setEmail("resume@toeic.test");
        owner.setRole(UserRole.ADMIN);

        ImportedVideo video = new ImportedVideo();
        video.setId(909L);
        video.setUser(owner);
        video.setPlatform("DIRECT_MEDIA");
        video.setTitle("Resumable Meeting Video");
        video.setSourceUrl(fullMp3.toUri().toString());
        video.setStreamVideoUrl(fullMp3.toUri().toString());
        video.setAudioLanguage("en");
        video.setDurationSeconds(46);
        video.setWorkflowStatus("TRANSCRIBING");
        video.setPublished(false);

        VideoProcessingJob interruptedJob = new VideoProcessingJob();
        interruptedJob.setId(777L);
        interruptedJob.setUser(owner);
        interruptedJob.setImportedVideo(video);
        interruptedJob.setStatus("TRANSCRIBING");
        interruptedJob.setLastCompletedChunk(0);
        interruptedJob.setCancelRequested(false);

        List<VideoSubtitleSegment> storedSegments = new CopyOnWriteArrayList<>();
        VideoSubtitleSegment existingChunk0 = new VideoSubtitleSegment();
        existingChunk0.setImportedVideo(video);
        existingChunk0.setSequenceNumber(1);
        existingChunk0.setStartTime(1.0);
        existingChunk0.setEndTime(5.0);
        existingChunk0.setEnglishText("Earlier checkpoint segment from chunk zero.");
        existingChunk0.setVietnameseText("");
        existingChunk0.setConfidence(0.95);
        existingChunk0.setUncertain(false);
        existingChunk0.setChunkIndex(0);
        storedSegments.add(existingChunk0);

        when(jobRepository.findByStatusInOrderByCreatedAtAsc(any())).thenReturn(List.of(interruptedJob));
        when(jobRepository.findById(777L)).thenReturn(Optional.of(interruptedJob));
        when(importedVideoRepository.findById(909L)).thenReturn(Optional.of(video));
        when(importedVideoRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(jobRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(audioTrackRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(909L)).thenReturn(Optional.empty());
        when(audioTrackRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(transcriptRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(909L)).thenReturn(Optional.empty());
        when(transcriptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        doAnswer(inv -> {
            int minChunk = inv.getArgument(1);
            storedSegments.removeIf(s -> s.getChunkIndex() != null && s.getChunkIndex() >= minChunk);
            return null;
        }).when(segmentRepository).deleteByImportedVideoIdAndChunkIndexGreaterThanEqual(eq(909L), anyInt());
        when(segmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(909L))
                .thenAnswer(inv -> new ArrayList<>(storedSegments));
        when(segmentRepository.saveAll(anyIterable())).thenAnswer(inv -> {
            @SuppressWarnings("unchecked")
            Iterable<VideoSubtitleSegment> items = (Iterable<VideoSubtitleSegment>) inv.getArgument(0);
            for (VideoSubtitleSegment s : items) {
                if (!storedSegments.contains(s)) {
                    storedSegments.add(s);
                }
            }
            return storedSegments;
        });

        VideoJobWorkerService realWorker = new VideoJobWorkerService(
                importedVideoRepository,
                jobRepository,
                audioTrackRepository,
                transcriptRepository,
                segmentRepository,
                vocabRepository,
                subtitleService,
                objectMapper
        );
        ReflectionTestUtils.setField(realWorker, "storageDir", tempDir.resolve("worker_data").toString());
        ReflectionTestUtils.setField(realWorker, "pythonBin", "python");
        ReflectionTestUtils.setField(realWorker, "whisperModel", "tiny.en");
        ReflectionTestUtils.setField(realWorker, "chunkDurationSeconds", 40);
        ReflectionTestUtils.setField(realWorker, "resumeJobsOnStartup", true);
        ReflectionTestUtils.setField(realWorker, "openAiApiKey", "");

        realWorker.resumeInterruptedJobsOnStartup();

        long deadline = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < deadline
                && !"COMPLETED".equals(interruptedJob.getStatus())
                && !"FAILED".equals(interruptedJob.getStatus())) {
            Thread.sleep(150);
        }
        realWorker.shutdownWorkerPool();

        assertEquals("COMPLETED", interruptedJob.getStatus(), "Worker error: " + interruptedJob.getErrorMessage());
        assertEquals(100, interruptedJob.getOverallProgress());
        assertEquals("REVIEWING", video.getWorkflowStatus(), "Completed job must transition video to REVIEWING until Admin publishes");
        assertFalse(video.getPublished());
        assertTrue(storedSegments.size() >= 2, "Must preserve chunk 0 and append chunk 1");
        assertEquals("Earlier checkpoint segment from chunk zero.", storedSegments.get(0).getEnglishText());
        assertTrue(storedSegments.stream().anyMatch(s -> s.getStartTime() >= 40.0),
                "Resumed chunk 1 must have timestamps starting at >= 40.0s");
        assertTrue(storedSegments.stream().allMatch(s -> s.getVietnameseText() != null && !s.getVietnameseText().isBlank()),
                "All resumed and newly transcribed segments must be translated");
    }

    @Test
    void autoSummarizesBlankTitleTopicDescriptionAndLevelWithoutOverwritingManualFields() {
        User admin = new User();
        admin.setId(1L);
        admin.setEmail("admin@toeic.test");
        admin.setRole(UserRole.ADMIN);
        when(userRepository.findByEmail("admin@toeic.test")).thenReturn(Optional.of(admin));

        ImportedVideo blankVideo = new ImportedVideo();
        blankVideo.setId(444L);
        blankVideo.setUser(admin);
        blankVideo.setVideoUid("izW0M6kY5RA");
        blankVideo.setSourceUrl("https://www.youtube.com/watch?v=izW0M6kY5RA");
        blankVideo.setTitle("Đang tải thông tin video (izW0M6kY5RA)...");
        blankVideo.setTopic("");
        blankVideo.setDescription("");
        blankVideo.setLevel("AUTO");

        VideoTranscript tr = new VideoTranscript();
        tr.setImportedVideo(blankVideo);
        tr.setFullEnglishText(
                "In this business meeting we discuss budget strategy, client respect, marketing deadlines, and workplace communication."
        );

        VideoSubtitleSegment seg = new VideoSubtitleSegment();
        seg.setImportedVideo(blankVideo);
        seg.setSequenceNumber(1);
        seg.setStartTime(0.0);
        seg.setEndTime(5.0);
        seg.setEnglishText("In this business meeting we discuss budget strategy and client communication.");
        seg.setVietnameseText("Trong cuộc họp kinh doanh này chúng ta thảo luận về chiến lược ngân sách và giao tiếp khách hàng.");

        when(importedVideoRepository.findById(444L)).thenReturn(Optional.of(blankVideo));
        when(importedVideoRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(segmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(444L)).thenReturn(List.of(seg));
        when(transcriptRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(444L)).thenReturn(Optional.of(tr));

        ImportedVideoDetailResponse summarized = videoLearningService.aiSummarizeVideoMetadata("admin@toeic.test", 444L, false);
        assertFalse(summarized.getTitle().startsWith("Đang tải"), "Blank title must be replaced by AI summary");
        assertFalse(summarized.getTopic().isBlank(), "Blank topic must be summarized automatically");
        assertEquals("Business & Workplace", summarized.getTopic());
        assertFalse(summarized.getDescription().isBlank(), "Blank description must be summarized in Vietnamese");
        assertNotEquals("AUTO", summarized.getLevel());

        // When overwriteAll=false, explicit admin fields MUST NOT be overwritten
        blankVideo.setTitle("Custom Admin Title");
        blankVideo.setTopic("Custom Topic");
        ImportedVideoDetailResponse preserved = videoLearningService.aiSummarizeVideoMetadata("admin@toeic.test", 444L, false);
        assertEquals("Custom Admin Title", preserved.getTitle());
        assertEquals("Custom Topic", preserved.getTopic());
    }

    @Test
    void stripsMusicNoiseMarkersAndSplitsLongWhisperSegmentsShort() {
        List<VideoTranslationAndSubtitleService.RawSegmentInput> noisyLong = List.of(
                new VideoTranslationAndSubtitleService.RawSegmentInput(0.0, 2.0, "[music] ♪ [âm nhạc]", 0.9, false, 0),
                new VideoTranslationAndSubtitleService.RawSegmentInput(
                        2.0,
                        14.0,
                        "[Music] >> Did you finish your report tonight? >> Yes, I tried really hard and finished everything before the final meeting with our manager.",
                        0.95,
                        false,
                        0
                )
        );

        List<VideoTranslationAndSubtitleService.RawSegmentInput> normalized = subtitleService.mergeAndNormalizeSegments(noisyLong);
        assertTrue(normalized.size() >= 3, "Long multi-speaker Whisper segment must split into multiple short lines");
        for (var seg : normalized) {
            String lower = seg.englishText().toLowerCase(Locale.ROOT);
            assertFalse(lower.contains("[music]"));
            assertFalse(lower.contains("[âm nhạc]"));
            assertFalse(seg.englishText().contains(">>"));
            assertTrue(seg.englishText().split("\\s+").length <= 10, "Each segment should be short (<=10 words): " + seg.englishText());
            assertTrue(seg.endTime() > seg.startTime());
        }
    }

    @Test
    void refreshesExpiredGooglevideoStreamUrlWhenOpeningVideoDetail() {
        User learner = new User();
        learner.setId(70L);
        learner.setEmail("learner@toeic.test");
        learner.setRole(UserRole.USER);

        long expiredEpoch = Instant.now().getEpochSecond() - 3600L;
        long freshEpoch = Instant.now().getEpochSecond() + 21600L;
        String expiredUrl = "https://rr4---sn-test.googlevideo.com/videoplayback?expire=" + expiredEpoch + "&itag=18&mime=video%2Fmp4";
        String freshUrl = "https://rr1---sn-test.googlevideo.com/videoplayback?expire=" + freshEpoch + "&itag=18&mime=video%2Fmp4";

        ImportedVideo video = new ImportedVideo();
        video.setId(555L);
        video.setVideoUid("E0bdcoSj9Q8");
        video.setSourceUrl("https://www.youtube.com/watch?v=E0bdcoSj9Q8");
        video.setCanonicalUrl("https://www.youtube.com/watch?v=E0bdcoSj9Q8");
        video.setPlatform("YOUTUBE");
        video.setTitle("Grocery Shopping English");
        video.setStreamVideoUrl(expiredUrl);
        video.setWorkflowStatus("PUBLISHED");
        video.setPublished(true);
        video.setDurationSeconds(1291);
        video.setVerifiedMediaDurationSeconds(1291);

        assertTrue(videoLearningService.isStreamUrlMissingOrExpired(video));

        when(userRepository.findByEmail("learner@toeic.test")).thenReturn(Optional.of(learner));
        when(importedVideoRepository.findById(555L)).thenReturn(Optional.of(video));
        when(workerService.extractFreshStreamUrl("https://www.youtube.com/watch?v=E0bdcoSj9Q8")).thenReturn(freshUrl);
        when(importedVideoRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(stateRepository.findByUserIdAndImportedVideoId(70L, 555L)).thenReturn(Optional.empty());
        when(transcriptRepository.findFirstByImportedVideoIdOrderByCreatedAtDesc(555L)).thenReturn(Optional.empty());
        when(segmentRepository.findByImportedVideoIdOrderBySequenceNumberAsc(555L)).thenReturn(List.of());
        when(vocabRepository.findByImportedVideoIdOrderByIdAsc(555L)).thenReturn(List.of());
        when(bookmarkRepository.findByUserIdAndImportedVideoIdOrderByTimestampSecondsAsc(70L, 555L)).thenReturn(List.of());

        ImportedVideoDetailResponse detail = videoLearningService.getPublishedVideoDetail("learner@toeic.test", 555L);
        assertEquals(freshUrl, detail.getStreamVideoUrl());
        assertFalse(videoLearningService.isStreamUrlMissingOrExpired(video));
        verify(workerService, times(1)).extractFreshStreamUrl("https://www.youtube.com/watch?v=E0bdcoSj9Q8");
        verify(importedVideoRepository).save(video);
    }

    @Test
    void streamsLocalMediaWithHttpByteRangesAndFullContent() throws Exception {
        User learner = new User();
        learner.setId(71L);
        learner.setEmail("stream@toeic.test");
        learner.setRole(UserRole.USER);

        Path mp4 = tempDir.resolve("sample_lesson.mp4");
        byte[] payload = "0123456789ABCDEFGHIJKLMNOPQRSTUV".getBytes(StandardCharsets.UTF_8);
        Files.write(mp4, payload);

        ImportedVideo video = new ImportedVideo();
        video.setId(556L);
        video.setVideoUid("local556");
        video.setSourceUrl("https://example.com/local556.mp4");
        video.setPlatform("DIRECT_MEDIA");
        video.setTitle("Sample Local MP4");
        video.setLocalMediaPath(mp4.toAbsolutePath().toString());
        video.setWorkflowStatus("PUBLISHED");
        video.setPublished(true);

        assertFalse(videoLearningService.isStreamUrlMissingOrExpired(video));

        when(userRepository.findByEmail("stream@toeic.test")).thenReturn(Optional.of(learner));
        when(importedVideoRepository.findById(556L)).thenReturn(Optional.of(video));

        MockHttpServletResponse rangeResp = new MockHttpServletResponse();
        videoLearningService.streamVideoMedia("stream@toeic.test", 556L, "bytes=4-13", false, rangeResp);
        assertEquals(206, rangeResp.getStatus());
        assertEquals("video/mp4", rangeResp.getContentType());
        assertEquals("bytes", rangeResp.getHeader("Accept-Ranges"));
        assertEquals("bytes 4-13/32", rangeResp.getHeader("Content-Range"));
        assertEquals("10", rangeResp.getHeader("Content-Length"));
        assertEquals("456789ABCD", rangeResp.getContentAsString());

        MockHttpServletResponse headResp = new MockHttpServletResponse();
        videoLearningService.streamVideoMedia("stream@toeic.test", 556L, "bytes=0-15", true, headResp);
        assertEquals(206, headResp.getStatus());
        assertEquals("16", headResp.getHeader("Content-Length"));
        assertEquals(0, headResp.getContentAsByteArray().length);
    }
}
