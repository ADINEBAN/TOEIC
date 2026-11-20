package org.example.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.example.backend.entity.LearningModule;
import org.example.backend.entity.User;
import org.example.backend.enums.ModuleType;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import org.example.backend.repository.LearningModuleRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.VideoLessonRepository;
import org.example.backend.security.CustomUserDetailsService;
import org.example.backend.security.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CloudinaryUploadLocalFallbackHttpTest {

    @TempDir
    static Path tempStorageDir;

    @DynamicPropertySource
    static void overrideProperties(DynamicPropertyRegistry registry) {
        registry.add("toeic.storage-dir", () -> tempStorageDir.toAbsolutePath().toString());
        registry.add("cloudinary.cloud-name", () -> "");
        registry.add("cloudinary.api-key", () -> "");
        registry.add("cloudinary.api-secret", () -> "");
    }

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private LearningModuleRepository learningModuleRepository;
    @Autowired private VideoLessonRepository videoLessonRepository;
    @Autowired private CustomUserDetailsService userDetailsService;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private final OkHttpClient http = new OkHttpClient();
    private final List<Long> createdLessonIds = new ArrayList<>();
    private final List<Long> createdModuleIds = new ArrayList<>();
    private final List<Long> createdUserIds = new ArrayList<>();

    private String adminToken;

    @BeforeEach
    void setUp() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        User admin = new User();
        admin.setEmail("test_upload_admin_" + tag + "@toeic.local");
        admin.setFullName("Upload Admin");
        admin.setPasswordHash(passwordEncoder.encode("Test@12345"));
        admin.setRole(UserRole.ADMIN);
        admin.setStatus(UserStatus.ACTIVE);
        admin = userRepository.save(admin);
        createdUserIds.add(admin.getId());

        adminToken = jwtService.generateToken(userDetailsService.loadUserByUsername(admin.getEmail()));
    }

    @AfterEach
    void tearDown() {
        for (Long id : createdLessonIds) {
            videoLessonRepository.deleteById(id);
        }
        for (Long id : createdModuleIds) {
            learningModuleRepository.deleteById(id);
        }
        for (Long id : createdUserIds) {
            userRepository.deleteById(id);
        }
    }

    @Test
    void uploadMovLocallyWithoutCloudinaryConfigAndServeViaRangeRequest() throws Exception {
        byte[] dummyMovBytes = "ftypqt  dummy-mov-video-payload-123456".getBytes(StandardCharsets.UTF_8);

        MultipartBody body = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                        "file",
                        "IMG_1126.MOV",
                        RequestBody.create(dummyMovBytes, MediaType.parse("video/quicktime"))
                )
                .build();

        Request uploadReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/admin/video-lessons/upload")
                .header("Authorization", "Bearer " + adminToken)
                .post(body)
                .build();

        String playbackUrl;
        try (Response uploadResp = http.newCall(uploadReq).execute()) {
            String raw = uploadResp.body() == null ? "" : uploadResp.body().string();
            assertEquals(200, uploadResp.code(), "Expected 200 OK on local upload fallback, got: " + raw);
            JsonNode json = objectMapper.readTree(raw);
            JsonNode data = json.path("data");
            playbackUrl = data.path("playbackUrl").asText();
            assertTrue(playbackUrl.startsWith("http://localhost:" + port + "/api/media/videos/"),
                    "Expected local playbackUrl under /api/media/videos/, got: " + playbackUrl);
            assertEquals("mov", data.path("format").asText());
            assertEquals(dummyMovBytes.length, data.path("bytes").asLong());
        }

        // Public HEAD and GET without JWT (as ExoPlayer / Android Media3 / <video> probes media URLs)
        Request headReq = new Request.Builder().url(playbackUrl).head().build();
        try (Response headResp = http.newCall(headReq).execute()) {
            assertEquals(200, headResp.code(), "Public media HEAD must succeed without auth for ExoPlayer");
        }

        Request getReq = new Request.Builder().url(playbackUrl).get().build();
        try (Response getResp = http.newCall(getReq).execute()) {
            assertEquals(200, getResp.code(), "Public media stream must be accessible without auth");
            byte[] fetched = getResp.body() == null ? new byte[0] : getResp.body().bytes();
            assertArrayEquals(dummyMovBytes, fetched);
        }

        // Range request check for seeking support
        Request rangeReq = new Request.Builder()
                .url(playbackUrl)
                .header("Range", "bytes=0-3")
                .get()
                .build();
        try (Response rangeResp = http.newCall(rangeReq).execute()) {
            assertEquals(206, rangeResp.code(), "Expected 206 Partial Content for byte-range video streaming");
            byte[] partial = rangeResp.body() == null ? new byte[0] : rangeResp.body().bytes();
            assertArrayEquals("ftyp".getBytes(StandardCharsets.UTF_8), partial);
        }
    }

    @Test
    void uploadAndCreateVideoLessonSucceedsWithoutCloudinaryConfig() throws Exception {
        LearningModule module = new LearningModule();
        module.setTitle("Test Upload Module " + UUID.randomUUID().toString().substring(0, 6));
        module.setModuleType(ModuleType.VIDEO);
        module.setEstimatedMinutes(15);
        module.setActive(true);
        module = learningModuleRepository.save(module);
        createdModuleIds.add(module.getId());

        byte[] dummyMp4 = "ftypisom-dummy-mp4-data".getBytes(StandardCharsets.UTF_8);
        String metadataJson = String.format(
                "{\"moduleId\":%d,\"title\":\"Clip Test\",\"description\":\"Local upload\",\"sortOrder\":1,\"free\":true,\"published\":true}",
                module.getId()
        );

        MultipartBody body = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                        "file",
                        "lesson_clip.mp4",
                        RequestBody.create(dummyMp4, MediaType.parse("video/mp4"))
                )
                .addFormDataPart("data", metadataJson)
                .build();

        Request req = new Request.Builder()
                .url("http://localhost:" + port + "/api/admin/video-lessons/upload-and-create")
                .header("Authorization", "Bearer " + adminToken)
                .post(body)
                .build();

        try (Response resp = http.newCall(req).execute()) {
            String raw = resp.body() == null ? "" : resp.body().string();
            JsonNode root = objectMapper.readTree(raw);
            JsonNode data = root.path("data");
            if (data.path("id").canConvertToLong()) {
                createdLessonIds.add(data.path("id").asLong());
            }
            assertEquals(201, resp.code(), "Expected 201 Created on upload-and-create fallback, got: " + raw);
            assertTrue(data.path("videoUrl").asText().contains("/api/media/videos/"));
            assertTrue(data.path("durationSeconds").asInt() > 0);
        }
    }
}
