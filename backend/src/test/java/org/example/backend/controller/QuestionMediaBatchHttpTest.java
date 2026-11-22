package org.example.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.example.backend.entity.User;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.UserRepository;
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

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "SPRING_DATASOURCE_PASSWORD", matches = ".+")
class QuestionMediaBatchHttpTest {

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
    @Autowired private QuestionRepository questionRepository;
    @Autowired private CustomUserDetailsService userDetailsService;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private final OkHttpClient http = new OkHttpClient();
    private final List<Long> createdQuestionIds = new ArrayList<>();
    private final List<Long> createdUserIds = new ArrayList<>();

    private String adminToken;

    @BeforeEach
    void setUp() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        User admin = new User();
        admin.setEmail("test_qmedia_admin_" + tag + "@toeic.local");
        admin.setFullName("Question Media Admin");
        admin.setPasswordHash(passwordEncoder.encode("Test@12345"));
        admin.setRole(UserRole.ADMIN);
        admin.setStatus(UserStatus.ACTIVE);
        admin = userRepository.save(admin);
        createdUserIds.add(admin.getId());

        adminToken = jwtService.generateToken(userDetailsService.loadUserByUsername(admin.getEmail()));
    }

    @AfterEach
    void tearDown() {
        for (Long id : createdQuestionIds) {
            questionRepository.deleteById(id);
        }
        for (Long id : createdUserIds) {
            userRepository.deleteById(id);
        }
    }

    @Test
    void batchUploadZipMatchesExistingQuestionsAndServesPlayableAudioAndImage() throws Exception {
        String uniq = UUID.randomUUID().toString().substring(0, 6);
        byte[] xlsxBytes = buildSampleTestXlsx(uniq, false);
        importQuestionsFile("sample_" + uniq + ".xlsx", xlsxBytes);

        byte[] mp3P1 = "ID3-part1-q01-audio-bytes-payload".getBytes(StandardCharsets.UTF_8);
        byte[] mp3P3 = "ID3-part3-shared-group-audio-payload".getBytes(StandardCharsets.UTF_8);
        byte[] jpgP1 = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x11, 0x22};

        byte[] zipBytes;
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream(); ZipOutputStream zos = new ZipOutputStream(baos)) {
            writeZipEntry(zos, "Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part1_Q01.mp3", mp3P1);
            writeZipEntry(zos, "Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part3_Q32-34.mp3", mp3P3);
            writeZipEntry(zos, "Images/part1_q1.jpg", jpgP1);
            writeZipEntry(zos, "Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Unused_Extra.mp3", new byte[]{1, 2, 3});
            zipBytes = baos.toByteArray();
        }

        MultipartBody batchBody = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                        "files",
                        "test_media_" + uniq + ".zip",
                        RequestBody.create(zipBytes, MediaType.parse("application/zip"))
                )
                .addFormDataPart("groupPrefix", "T1_" + uniq)
                .addFormDataPart("overwriteExisting", "false")
                .build();

        Request batchReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/admin/questions/upload-media-batch")
                .header("Authorization", "Bearer " + adminToken)
                .post(batchBody)
                .build();

        String p1AudioUrl;
        String p1ImageUrl;
        String p3AudioUrlA;
        String p3AudioUrlB;

        try (Response resp = http.newCall(batchReq).execute()) {
            String raw = resp.body() == null ? "" : resp.body().string();
            assertEquals(200, resp.code(), "Expected 200 on upload-media-batch, got: " + raw);
            JsonNode data = objectMapper.readTree(raw).path("data");
            assertEquals(4, data.path("uploadedFileCount").asInt());
            assertEquals(3, data.path("storedAssetCount").asInt());
            assertEquals(3, data.path("matchedQuestionCount").asInt());
            assertEquals(0, data.path("skippedAlreadyLinkedCount").asInt());
            assertEquals(1, data.path("unmatchedFiles").size());
            assertTrue(data.path("unmatchedFiles").get(0).asText().endsWith("Unused_Extra.mp3"));

            JsonNode items = data.path("items");
            assertEquals(3, items.size());
            JsonNode p1Item = findByPart(items, 1);
            assertNotNull(p1Item);
            p1AudioUrl = p1Item.path("audioUrl").asText();
            p1ImageUrl = p1Item.path("imageUrl").asText();

            List<String> p3Urls = new ArrayList<>();
            for (JsonNode item : items) {
                if (item.path("partNo").asInt() == 3) {
                    p3Urls.add(item.path("audioUrl").asText());
                }
            }
            assertEquals(2, p3Urls.size());
            p3AudioUrlA = p3Urls.get(0);
            p3AudioUrlB = p3Urls.get(1);
            assertEquals(p3AudioUrlA, p3AudioUrlB, "Shared Part 3 audio must map both questions to the exact same URL");
        }

        assertTrue(p1AudioUrl.startsWith("http://localhost:" + port + "/api/media/question-media/audio/"));
        assertTrue(p1ImageUrl.startsWith("http://localhost:" + port + "/api/media/question-media/images/"));

        // Public HEAD + byte-range GET on audio + GET on image
        try (Response headResp = http.newCall(new Request.Builder().url(p1AudioUrl).head().build()).execute()) {
            assertEquals(200, headResp.code());
        }
        try (Response rangeResp = http.newCall(new Request.Builder().url(p1AudioUrl).header("Range", "bytes=0-2").get().build()).execute()) {
            assertEquals(206, rangeResp.code());
            assertArrayEquals("ID3".getBytes(StandardCharsets.UTF_8), rangeResp.body().bytes());
        }
        try (Response imgResp = http.newCall(new Request.Builder().url(p1ImageUrl).get().build()).execute()) {
            assertEquals(200, imgResp.code());
            assertArrayEquals(jpgP1, imgResp.body().bytes());
        }

        // Uploading again with overwriteExisting=false preserves existing HTTP link
        MultipartBody secondBody = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                        "files",
                        "Part1_Q01.mp3",
                        RequestBody.create("ID3-new-replacement".getBytes(StandardCharsets.UTF_8), MediaType.parse("audio/mpeg"))
                )
                .addFormDataPart("groupPrefix", "T1_" + uniq)
                .addFormDataPart("overwriteExisting", "false")
                .build();

        try (Response resp = http.newCall(new Request.Builder()
                .url("http://localhost:" + port + "/api/admin/questions/upload-media-batch")
                .header("Authorization", "Bearer " + adminToken)
                .post(secondBody)
                .build()).execute()) {
            JsonNode data = objectMapper.readTree(resp.body().string()).path("data");
            assertEquals(0, data.path("matchedQuestionCount").asInt());
            assertEquals(1, data.path("skippedAlreadyLinkedCount").asInt());
        }
    }

    @Test
    void importBundleZipAttachesAudioAndImageInSingleRequestAndSingleUploadValidatesTypes() throws Exception {
        String uniq = UUID.randomUUID().toString().substring(0, 6);
        byte[] xlsxBytes = buildSampleTestXlsx(uniq, true);
        byte[] mp3Bytes = "ID3-bundle-audio".getBytes(StandardCharsets.UTF_8);

        byte[] bundleZip;
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream(); ZipOutputStream zos = new ZipOutputStream(baos)) {
            writeZipEntry(zos, "De_Admin_Import.xlsx", xlsxBytes);
            writeZipEntry(zos, "Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part1_Q01.mp3", mp3Bytes);
            bundleZip = baos.toByteArray();
        }

        JsonNode importData = importQuestionsFile("bundle_" + uniq + ".zip", bundleZip);
        assertEquals(1, importData.path("importedCount").asInt());
        String audioUrl = importData.path("items").get(0).path("audioUrl").asText();
        assertTrue(audioUrl.startsWith("http://localhost:" + port + "/api/media/question-media/audio/"));

        try (Response getResp = http.newCall(new Request.Builder().url(audioUrl).get().build()).execute()) {
            assertEquals(200, getResp.code());
            assertArrayEquals(mp3Bytes, getResp.body().bytes());
        }

        // Reject unsupported file extension on /upload-media
        MultipartBody badMedia = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                        "file",
                        "malware.exe",
                        RequestBody.create(new byte[]{1, 2, 3}, MediaType.parse("application/octet-stream"))
                )
                .build();
        try (Response resp = http.newCall(new Request.Builder()
                .url("http://localhost:" + port + "/api/admin/questions/upload-media")
                .header("Authorization", "Bearer " + adminToken)
                .post(badMedia)
                .build()).execute()) {
            assertEquals(400, resp.code());
        }
    }

    private JsonNode importQuestionsFile(String filename, byte[] bytes) throws Exception {
        MultipartBody body = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("defaultPartNo", "1")
                .addFormDataPart("autoExplainAi", "false")
                .addFormDataPart("file", filename, RequestBody.create(bytes, MediaType.parse("application/octet-stream")))
                .build();

        Request req = new Request.Builder()
                .url("http://localhost:" + port + "/api/admin/questions/import-file")
                .header("Authorization", "Bearer " + adminToken)
                .post(body)
                .build();

        try (Response resp = http.newCall(req).execute()) {
            String raw = resp.body() == null ? "" : resp.body().string();
            assertEquals(201, resp.code(), "Expected 201 Created on import-file, got: " + raw);
            JsonNode data = objectMapper.readTree(raw).path("data");
            for (JsonNode item : data.path("items")) {
                if (item.path("id").canConvertToLong()) {
                    createdQuestionIds.add(item.path("id").asLong());
                }
            }
            return data;
        }
    }

    private byte[] buildSampleTestXlsx(String uniq, boolean singleRowOnly) throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Questions");
            Row header = sheet.createRow(0);
            String[] cols = {"part", "question", "optionA", "optionB", "optionC", "optionD", "correct", "explanation", "audio", "image", "group"};
            for (int i = 0; i < cols.length; i++) {
                header.createCell(i).setCellValue(cols[i]);
            }

            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue(1);
            r1.createCell(1).setCellValue("[Test " + uniq + " - Q1] Typing at laptop.");
            r1.createCell(2).setCellValue("Option A");
            r1.createCell(3).setCellValue("Option B");
            r1.createCell(4).setCellValue("Option C");
            r1.createCell(5).setCellValue("Option D");
            r1.createCell(6).setCellValue("B");
            r1.createCell(7).setCellValue("Sample explanation");
            r1.createCell(8).setCellValue("Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part1_Q01.mp3");
            r1.createCell(9).setCellValue("Images/part1_q1.jpg");
            r1.createCell(10).setCellValue("T1_" + uniq + "_P01_Q01");

            if (!singleRowOnly) {
                Row r2 = sheet.createRow(2);
                r2.createCell(0).setCellValue(3);
                r2.createCell(1).setCellValue("Where does the dialogue " + uniq + " take place?");
                r2.createCell(2).setCellValue("Lobby");
                r2.createCell(3).setCellValue("Factory");
                r2.createCell(4).setCellValue("Station");
                r2.createCell(5).setCellValue("Bank");
                r2.createCell(6).setCellValue("A");
                r2.createCell(7).setCellValue("Dialogue clue");
                r2.createCell(8).setCellValue("Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part3_Q32-34.mp3");
                r2.createCell(10).setCellValue("T1_" + uniq + "_P03_32_34");

                Row r3 = sheet.createRow(3);
                r3.createCell(0).setCellValue(3);
                r3.createCell(1).setCellValue("What does the man ask for " + uniq + "?");
                r3.createCell(2).setCellValue("Keycard");
                r3.createCell(3).setCellValue("Receipt");
                r3.createCell(4).setCellValue("Invoice");
                r3.createCell(5).setCellValue("Badge");
                r3.createCell(6).setCellValue("C");
                r3.createCell(7).setCellValue("Dialogue clue 2");
                r3.createCell(8).setCellValue("Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part3_Q32-34.mp3");
                r3.createCell(10).setCellValue("T1_" + uniq + "_P03_32_34");
            }

            wb.write(out);
            return out.toByteArray();
        }
    }

    private static void writeZipEntry(ZipOutputStream zos, String name, byte[] data) throws Exception {
        ZipEntry entry = new ZipEntry(name);
        zos.putNextEntry(entry);
        zos.write(data);
        zos.closeEntry();
    }

    private static JsonNode findByPart(JsonNode items, int partNo) {
        for (JsonNode node : items) {
            if (node.path("partNo").asInt() == partNo) {
                return node;
            }
        }
        return null;
    }
}
