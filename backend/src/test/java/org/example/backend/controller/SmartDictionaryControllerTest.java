package org.example.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.example.backend.dto.response.ImageObjectRecognitionResponse;
import org.example.backend.entity.User;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import org.example.backend.repository.UserRepository;
import org.example.backend.security.CustomUserDetailsService;
import org.example.backend.security.JwtService;
import org.example.backend.service.SmartDictionaryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SmartDictionaryControllerTest {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private CustomUserDetailsService userDetailsService;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SmartDictionaryService smartDictionaryService;

    private final OkHttpClient http = new OkHttpClient();
    private Long createdUserId;
    private String userToken;

    @BeforeEach
    void setUp() {
        User u = new User();
        u.setEmail("dict_test_" + UUID.randomUUID().toString().substring(0, 8) + "@toeic.local");
        u.setFullName("Dict Tester");
        u.setPasswordHash(passwordEncoder.encode("Test@12345"));
        u.setRole(UserRole.USER);
        u.setStatus(UserStatus.ACTIVE);
        u = userRepository.save(u);
        createdUserId = u.getId();
        userToken = jwtService.generateToken(userDetailsService.loadUserByUsername(u.getEmail()));
    }

    @AfterEach
    void tearDown() {
        if (createdUserId != null) {
            userRepository.deleteById(createdUserId);
        }
    }

    @Test
    void suggestAndSemanticLookupReturnRichNetworkFromCatalog() throws Exception {
        Request suggestReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/dictionary/suggest?q=negotiate&limit=8")
                .header("Authorization", "Bearer " + userToken)
                .get()
                .build();
        try (Response resp = http.newCall(suggestReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode data = objectMapper.readTree(resp.body().string()).path("data");
            assertTrue(data.size() >= 1);
            assertEquals("negotiate", data.get(0).path("word").asText().toLowerCase());
        }

        // Fast local-first lookup
        Request fastReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/dictionary/lookup?word=negotiate&fast=true")
                .header("Authorization", "Bearer " + userToken)
                .get()
                .build();
        try (Response resp = http.newCall(fastReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode data = objectMapper.readTree(resp.body().string()).path("data");
            assertEquals("negotiate", data.path("word").asText().toLowerCase());
            assertFalse(data.path("meaningVi").asText("").isBlank());
            assertFalse(data.path("semanticNetwork").path("relatedWords").isEmpty());
        }

        // Full semantic lookup (persists to DB cache + history)
        Request lookupReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/dictionary/lookup?word=negotiate")
                .header("Authorization", "Bearer " + userToken)
                .get()
                .build();
        try (Response resp = http.newCall(lookupReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode data = objectMapper.readTree(resp.body().string()).path("data");
            assertEquals("negotiate", data.path("word").asText().toLowerCase());
            assertFalse(data.path("meaningVi").asText("").isBlank());
            assertFalse(data.path("examples").isEmpty());
            JsonNode net = data.path("semanticNetwork");
            assertFalse(net.path("relatedWords").isEmpty(), "Expected semantic related words");
        }

        // Second lookup must return instantaneously from cache
        try (Response resp = http.newCall(lookupReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode data = objectMapper.readTree(resp.body().string()).path("data");
            assertTrue(data.path("cached").asBoolean(false), "Expected cached=true on repeat lookup");
        }

        // Lookup history must retain the looked-up word along with pre-hydrated entry
        Request historyReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/dictionary/history?limit=10")
                .header("Authorization", "Bearer " + userToken)
                .get()
                .build();
        try (Response resp = http.newCall(historyReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode hist = objectMapper.readTree(resp.body().string()).path("data");
            assertTrue(hist.isArray() && hist.size() >= 1);
            assertEquals("negotiate", hist.get(0).path("normalizedWord").asText());
            assertTrue(hist.get(0).path("lookupCount").asInt(0) >= 2);
            assertFalse(hist.get(0).path("entry").isMissingNode());
            assertEquals("negotiate", hist.get(0).path("entry").path("word").asText().toLowerCase());
        }

        // Deleting a word from personal history removes it cleanly
        Request delReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/dictionary/history/negotiate")
                .header("Authorization", "Bearer " + userToken)
                .delete()
                .build();
        try (Response resp = http.newCall(delReq).execute()) {
            assertEquals(200, resp.code());
        }
        try (Response resp = http.newCall(historyReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode hist = objectMapper.readTree(resp.body().string()).path("data");
            assertEquals(0, hist.size());
        }
    }

    @Test
    void recognizeImageRejectsNonImageAndParsesVisionJsonCleanly() throws Exception {
        MultipartBody invalidBody = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                        "file",
                        "notes.txt",
                        RequestBody.create("not an image".getBytes(StandardCharsets.UTF_8), MediaType.parse("text/plain"))
                )
                .build();
        Request badReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/dictionary/recognize-image")
                .header("Authorization", "Bearer " + userToken)
                .post(invalidBody)
                .build();
        try (Response resp = http.newCall(badReq).execute()) {
            assertEquals(400, resp.code());
        }

        String sampleVisionJson = """
                {
                  "primaryObject": {
                    "word": "laptop",
                    "ipa": "/ˈlæptɒp/",
                    "partOfSpeech": "noun",
                    "meaningVi": "máy tính xách tay",
                    "meaningEn": "a portable personal computer",
                    "exampleSentence": "She opened her laptop during the client briefing.",
                    "exampleTranslation": "Cô ấy mở máy tính xách tay trong buổi họp với khách hàng.",
                    "category": "Technology",
                    "confidence": 0.97
                  },
                  "detectedObjects": [
                    {"word": "keyboard", "ipa": "/ˈkiːbɔːd/", "partOfSpeech": "noun", "meaningVi": "bàn phím", "confidence": 0.91},
                    {"word": "desk", "ipa": "/desk/", "partOfSpeech": "noun", "meaningVi": "bàn làm việc", "confidence": 0.89}
                  ],
                  "sceneDescriptionEn": "A modern office desk with a laptop computer.",
                  "sceneDescriptionVi": "Một bàn làm việc hiện đại với chiếc máy tính xách tay.",
                  "relatedWords": [
                    {"word": "monitor", "meaningVi": "màn hình máy tính", "partOfSpeech": "noun"},
                    {"word": "software", "meaningVi": "phần mềm", "partOfSpeech": "noun"}
                  ]
                }
                """;
        var parserMethod = SmartDictionaryService.class.getDeclaredMethod("parseAndEnrichRecognitionJson", String.class);
        parserMethod.setAccessible(true);
        ImageObjectRecognitionResponse parsed = (ImageObjectRecognitionResponse) parserMethod.invoke(smartDictionaryService, sampleVisionJson);
        assertEquals("laptop", parsed.getPrimaryObject().getWord());
        assertNotNull(parsed.getPrimaryObject().getVocabularyId(), "Expected laptop enriched from seeded CEFR catalog");
        assertEquals(2, parsed.getDetectedObjects().size());
        assertEquals(2, parsed.getRelatedWords().size());
    }
}
