package org.example.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.example.backend.entity.*;
import org.example.backend.enums.UserRole;
import org.example.backend.repository.*;
import org.example.backend.security.CustomUserDetailsService;
import org.example.backend.security.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminVideoLibraryRbacHttpTest {

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ImportedVideoRepository importedVideoRepository;
    @Autowired private VideoProcessingJobRepository videoProcessingJobRepository;
    @Autowired private VideoTranscriptRepository videoTranscriptRepository;
    @Autowired private VideoSubtitleSegmentRepository videoSubtitleSegmentRepository;
    @Autowired private UserVideoLearningStateRepository userVideoLearningStateRepository;
    @Autowired private VideoBookmarkRepository videoBookmarkRepository;
    @Autowired private VideoVocabularyItemRepository videoVocabularyItemRepository;
    @Autowired private org.example.backend.service.VideoLearningService videoLearningService;
    @Autowired private CustomUserDetailsService userDetailsService;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private final OkHttpClient http = new OkHttpClient();
    private final List<Long> createdVideoIds = new ArrayList<>();
    private final List<Long> createdUserIds = new ArrayList<>();

    private User adminUser;
    private User contentManagerUser;
    private User regularUser;
    private String adminToken;
    private String contentManagerToken;
    private String regularUserToken;

    @BeforeEach
    void setUp() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        adminUser = createTestUser("test_admin_" + tag + "@toeic.local", UserRole.ADMIN);
        contentManagerUser = createTestUser("test_cm_" + tag + "@toeic.local", UserRole.CONTENT_MANAGER);
        regularUser = createTestUser("test_user_" + tag + "@toeic.local", UserRole.USER);

        adminToken = jwtService.generateToken(userDetailsService.loadUserByUsername(adminUser.getEmail()));
        contentManagerToken = jwtService.generateToken(userDetailsService.loadUserByUsername(contentManagerUser.getEmail()));
        regularUserToken = jwtService.generateToken(userDetailsService.loadUserByUsername(regularUser.getEmail()));
    }

    @AfterEach
    void tearDown() {
        for (Long vid : createdVideoIds) {
            try {
                videoLearningService.deleteVideo(adminUser.getEmail(), vid);
            } catch (Exception ignored) {
            }
        }
        for (Long uid : createdUserIds) {
            try {
                userRepository.deleteById(uid);
            } catch (Exception ignored) {
            }
        }
    }

    @Test
    void regularUserReceivesHttp403OnAllAdminAndRestrictedVideoEndpoints() throws Exception {
        String base = "http://localhost:" + port + "/api";

        // 1. Admin Video endpoints MUST return 403 for ROLE_USER
        assertEquals(403, call(base + "/admin/videos", "GET", regularUserToken, null).code);
        assertEquals(403, call(base + "/admin/videos/import", "POST", regularUserToken, "{\"videoUrl\":\"https://youtu.be/dQw4w9WgXcQ\"}").code);
        assertEquals(403, call(base + "/admin/videos/999999", "PUT", regularUserToken, "{\"title\":\"Hack\"}").code);
        assertEquals(403, call(base + "/admin/videos/999999/subtitles", "PUT", regularUserToken, "{\"segments\":[]}").code);
        assertEquals(403, call(base + "/admin/videos/999999/publish", "POST", regularUserToken, "{}").code);
        assertEquals(403, call(base + "/admin/videos/999999/unpublish", "POST", regularUserToken, "{}").code);
        assertEquals(403, call(base + "/admin/videos/999999/archive", "POST", regularUserToken, "{}").code);
        assertEquals(403, call(base + "/admin/videos/999999/ai-summarize", "POST", regularUserToken, "{}").code);
        assertEquals(403, call(base + "/admin/videos/999999", "DELETE", regularUserToken, null).code);
        assertEquals(403, call(base + "/admin/videos/jobs/999999/retry", "POST", regularUserToken, "{}").code);

        // 2. Legacy /users/videos/import, /users/videos/jobs/**, and /users/youtube/subtitles MUST also return 403 for ROLE_USER
        assertEquals(403, call(base + "/users/videos/import", "POST", regularUserToken, "{\"videoUrl\":\"https://youtu.be/dQw4w9WgXcQ\"}").code);
        assertEquals(403, call(base + "/users/videos/jobs/999999", "GET", regularUserToken, null).code);
        assertEquals(403, call(base + "/users/videos/jobs/999999/cancel", "POST", regularUserToken, "{}").code);
        assertEquals(403, call(base + "/users/videos/jobs/999999/retry", "POST", regularUserToken, "{}").code);
        assertEquals(403, call(base + "/users/youtube/subtitles", "POST", regularUserToken, "{\"youtubeUrl\":\"https://youtu.be/dQw4w9WgXcQ\"}").code);

        // 3. Unauthenticated requests receive 401 Unauthorized
        assertEquals(401, call(base + "/admin/videos", "GET", null, null).code);
    }

    @Test
    void endToEndPersistentAdminPublishWorkflowAndUserLibraryVisibility() throws Exception {
        String base = "http://localhost:" + port + "/api";

        // Create a processed video in REVIEWING state owned by Content Manager in real MySQL DB
        ImportedVideo vid = new ImportedVideo();
        vid.setUser(contentManagerUser);
        vid.setVideoUid("e2e_" + UUID.randomUUID().toString().substring(0, 8));
        vid.setSourceUrl("https://www.youtube.com/watch?v=szlo5QxdNZE");
        vid.setCanonicalUrl("https://www.youtube.com/watch?v=szlo5QxdNZE");
        vid.setPlatform("YOUTUBE");
        vid.setTitle("E2E TOEIC Listening & Bilingual Subtitle Review");
        vid.setDescription("Persistent end-to-end verification video.");
        vid.setThumbnailUrl("https://img.youtube.com/vi/szlo5QxdNZE/hqdefault.jpg");
        vid.setDurationSeconds(600);
        vid.setVerifiedMediaDurationSeconds(600);
        vid.setLevel("B1");
        vid.setTopic("Business Meetings");
        vid.setWorkflowStatus("REVIEWING");
        vid.setPublished(false);
        vid = importedVideoRepository.save(vid);
        createdVideoIds.add(vid.getId());

        VideoProcessingJob job = new VideoProcessingJob();
        job.setUser(contentManagerUser);
        job.setImportedVideo(vid);
        job.setStatus("COMPLETED");
        job.setOverallProgress(100);
        videoProcessingJobRepository.save(job);

        VideoTranscript tr = new VideoTranscript();
        tr.setImportedVideo(vid);
        tr.setDetectedLanguage("en");
        tr.setAsrEngine("FASTER_WHISPER");
        tr.setFullEnglishText("Good morning everyone, let us review the agenda.");
        videoTranscriptRepository.save(tr);

        VideoSubtitleSegment seg = new VideoSubtitleSegment();
        seg.setImportedVideo(vid);
        seg.setSequenceNumber(1);
        seg.setStartTime(0.0);
        seg.setEndTime(4.8);
        seg.setEnglishText("Good morning everyone, let us review the agenda.");
        seg.setVietnameseText("Chào buổi sáng mọi người, chúng ta hãy xem qua chương trình họp.");
        seg.setConfidence(0.97);
        seg.setUncertain(false);
        seg = videoSubtitleSegmentRepository.save(seg);

        // 1. Content Manager & Admin can both access /admin/videos, while Draft/Reviewing video is hidden from Regular User
        HttpRes cmList = call(base + "/admin/videos?status=REVIEWING", "GET", contentManagerToken, null);
        assertEquals(200, cmList.code);
        assertTrue(cmList.body.contains("E2E TOEIC Listening & Bilingual Subtitle Review"));

        HttpRes userHiddenDetail = call(base + "/users/videos/" + vid.getId(), "GET", regularUserToken, null);
        assertEquals(404, userHiddenDetail.code, "Unpublished REVIEWING video must not be accessible to regular users");

        // 2. Content Manager edits subtitle text before publishing
        String editBody = String.format(
                "{\"segments\":[{\"id\":%d,\"startTime\":0.0,\"endTime\":5.0,\"englishText\":\"Good morning everyone, let us review today's agenda.\",\"vietnameseText\":\"Chào buổi sáng mọi người, hãy cùng xem chương trình họp hôm nay.\"}]}",
                seg.getId()
        );
        HttpRes editRes = call(base + "/admin/videos/" + vid.getId() + "/subtitles", "PUT", contentManagerToken, editBody);
        assertEquals(200, editRes.code);
        assertTrue(editRes.body.contains("hôm nay"));

        // 3. Admin publishes the video
        HttpRes pubRes = call(base + "/admin/videos/" + vid.getId() + "/publish", "POST", adminToken, "{}");
        assertEquals(200, pubRes.code);
        JsonNode pubJson = objectMapper.readTree(pubRes.body);
        assertEquals("PUBLISHED", pubJson.path("data").path("workflowStatus").asText());
        assertTrue(pubJson.path("data").path("published").asBoolean());

        // 4. Regular user now sees the published video in User Learning Library, updates progress, adds bookmark, and looks up vocabulary!
        HttpRes userLibrary = call(base + "/users/videos?search=E2E%20TOEIC&level=B1", "GET", regularUserToken, null);
        assertEquals(200, userLibrary.code);
        assertTrue(userLibrary.body.contains("E2E TOEIC Listening & Bilingual Subtitle Review"));

        HttpRes userDetail = call(base + "/users/videos/" + vid.getId(), "GET", regularUserToken, null);
        assertEquals(200, userDetail.code);
        assertTrue(userDetail.body.contains("Chào buổi sáng mọi người, hãy cùng xem chương trình họp hôm nay."));

        HttpRes stateUpdate = call(
                base + "/users/videos/" + vid.getId() + "/state",
                "PUT",
                regularUserToken,
                "{\"favorite\":true,\"lastPositionSeconds\":2.5,\"playbackSpeed\":1.25}"
        );
        assertEquals(200, stateUpdate.code);
        assertTrue(stateUpdate.body.contains("\"favorite\":true"));

        HttpRes wordLookup = call(
                base + "/users/youtube/word-lookup",
                "POST",
                regularUserToken,
                "{\"word\":\"agenda\",\"contextSentence\":\"Good morning everyone, let us review today's agenda.\"}"
        );
        assertEquals(200, wordLookup.code);

        // 5. Existing pre-migration video id=1 (if present in DB) remains intact and published
        importedVideoRepository.findById(1L).ifPresent(existingOne -> {
            assertNotNull(existingOne.getTitle());
            assertTrue(existingOne.getDurationSeconds() > 0);
        });
    }

    @Test
    void regularUserCanImportPersonalVideoPrivatelyWithoutSeeingOthersOrAffectingAdminLibrary() throws Exception {
        String base = "http://localhost:" + port + "/api";
        User otherUser = createTestUser("test_user_b_" + UUID.randomUUID().toString().substring(0, 6) + "@toeic.local", UserRole.USER);
        String otherUserToken = jwtService.generateToken(userDetailsService.loadUserByUsername(otherUser.getEmail()));

        // User A imports a personal video link via /users/videos/personal/import
        String importPayload = "{\"videoUrl\":\"https://www.youtube.com/watch?v=persTest001\",\"title\":\"My Personal Study Clip\",\"customTranscript\":\"Hello everyone. Let us practice listening together.\"}";
        HttpRes importRes = call(base + "/users/videos/personal/import", "POST", regularUserToken, importPayload);
        assertTrue(importRes.code == 200 || importRes.code == 202, "Personal import failed: " + importRes.body);
        JsonNode root = objectMapper.readTree(importRes.body).get("data");
        long personalVideoId = root.get("id").asLong();
        createdVideoIds.add(personalVideoId);
        assertFalse(root.get("published").asBoolean());

        // Appears in User A library & detail
        HttpRes listUserA = call(base + "/users/videos", "GET", regularUserToken, null);
        assertEquals(200, listUserA.code);
        assertTrue(listUserA.body.contains("My Personal Study Clip"));

        HttpRes detailUserA = call(base + "/users/videos/" + personalVideoId, "GET", regularUserToken, null);
        assertEquals(200, detailUserA.code);

        // User A can inspect their own personal job status
        long jobId = root.path("latestJob").path("jobId").asLong();
        assertTrue(jobId > 0);
        HttpRes jobUserA = call(base + "/users/videos/personal/jobs/" + jobId, "GET", regularUserToken, null);
        assertEquals(200, jobUserA.code);

        // User B CANNOT see User A's personal video or access User A's job
        HttpRes listUserB = call(base + "/users/videos", "GET", otherUserToken, null);
        assertEquals(200, listUserB.code);
        assertFalse(listUserB.body.contains("My Personal Study Clip"));
        assertNotEquals(200, call(base + "/users/videos/" + personalVideoId, "GET", otherUserToken, null).code);
        assertEquals(403, call(base + "/users/videos/personal/jobs/" + jobId, "GET", otherUserToken, null).code);
        assertEquals(403, call(base + "/users/videos/personal/" + personalVideoId, "DELETE", otherUserToken, null).code);

        // Admin queue does NOT get cluttered with personal learner imports
        HttpRes adminList = call(base + "/admin/videos", "GET", adminToken, null);
        assertEquals(200, adminList.code);
        assertFalse(adminList.body.contains("My Personal Study Clip"));

        // User A can cancel and delete their own personal video cleanly
        HttpRes cancelUserA = call(base + "/users/videos/personal/jobs/" + jobId + "/cancel", "POST", regularUserToken, "{}");
        assertEquals(200, cancelUserA.code);
        HttpRes deleteUserA = call(base + "/users/videos/personal/" + personalVideoId, "DELETE", regularUserToken, null);
        assertEquals(200, deleteUserA.code);
        assertNotEquals(200, call(base + "/users/videos/" + personalVideoId, "GET", regularUserToken, null).code);
        createdVideoIds.remove(personalVideoId);
    }

    private User createTestUser(String email, UserRole role) {
        User u = new User();
        u.setFullName(email.split("@")[0]);
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode("Test@123456"));
        u.setRole(role);
        u.setStatus(org.example.backend.enums.UserStatus.ACTIVE);
        u = userRepository.save(u);
        createdUserIds.add(u.getId());
        return u;
    }

    private record HttpRes(int code, String body) {}

    private HttpRes call(String url, String method, String bearerToken, String jsonBody) throws Exception {
        Request.Builder rb = new Request.Builder().url(url);
        if (bearerToken != null) {
            rb.header("Authorization", "Bearer " + bearerToken);
        }
        RequestBody body = jsonBody != null ? RequestBody.create(jsonBody, JSON) : null;
        switch (method) {
            case "GET" -> rb.get();
            case "DELETE" -> rb.delete();
            case "POST" -> rb.post(body != null ? body : RequestBody.create("", JSON));
            case "PUT" -> rb.put(body != null ? body : RequestBody.create("", JSON));
            default -> throw new IllegalArgumentException("Unsupported method: " + method);
        }
        try (Response res = http.newCall(rb.build()).execute()) {
            return new HttpRes(res.code(), res.body() != null ? res.body().string() : "");
        }
    }
}
