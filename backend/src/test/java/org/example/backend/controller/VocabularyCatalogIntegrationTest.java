package org.example.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.example.backend.entity.User;
import org.example.backend.entity.VocabularyTopic;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.VocabularyRepository;
import org.example.backend.repository.VocabularyTopicRepository;
import org.example.backend.security.CustomUserDetailsService;
import org.example.backend.security.JwtService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class VocabularyCatalogIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired private VocabularyTopicRepository vocabularyTopicRepository;
    @Autowired private VocabularyRepository vocabularyRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CustomUserDetailsService userDetailsService;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private final OkHttpClient http = new OkHttpClient();
    private Long createdUserId;
    private String userToken;

    @BeforeEach
    void setUp() {
        User u = new User();
        u.setEmail("vocab_test_" + UUID.randomUUID().toString().substring(0, 8) + "@toeic.local");
        u.setFullName("Vocab Test Learner");
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
    void seededCatalogContains600ToeicWordsAndThousandsOfCefrA1ToC1Words() throws Exception {
        List<VocabularyTopic> topics = vocabularyTopicRepository.findByActiveTrueOrderByIdAsc();
        long duplicateStarterCount = topics.stream()
                .filter(t -> "TOEIC Core Business & Office".equals(t.getName()))
                .count();
        assertTrue(duplicateStarterCount <= 1, "Starter topic must not be duplicated");

        Map<Long, Long> topicWordCounts = vocabularyRepository.countGroupedByTopicId().stream()
                .collect(Collectors.toMap(
                        r -> ((Number) r[0]).longValue(),
                        r -> ((Number) r[1]).longValue()
                ));

        List<VocabularyTopic> toeicTopics = topics.stream()
                .filter(t -> "TOEIC-600".equalsIgnoreCase(t.getLevel()))
                .toList();
        assertEquals(15, toeicTopics.size(), "Expected 15 TOEIC-600 topics");
        long toeicTotal = toeicTopics.stream()
                .mapToLong(t -> topicWordCounts.getOrDefault(t.getId(), 0L))
                .sum();
        assertEquals(600L, toeicTotal, "Expected exact 600 words in TOEIC-600 topics");

        for (String cefrLevel : List.of("A1", "A2", "B1", "B2", "C1")) {
            long count = topics.stream()
                    .filter(t -> cefrLevel.equalsIgnoreCase(t.getLevel()))
                    .mapToLong(t -> topicWordCounts.getOrDefault(t.getId(), 0L))
                    .sum();
            assertTrue(count >= 700, "Expected at least 700 clean words for CEFR " + cefrLevel + ", found " + count);
        }

        // Ensure no old alphabetical "CEFR ... • Bộ ..." units or tiny fragments remain
        assertTrue(topics.stream().noneMatch(t -> t.getName() != null && t.getName().contains("• Bộ ")),
                "CEFR topics should be grouped by theme instead of alphabetical chunks");
        for (VocabularyTopic t : topics) {
            if ("TOEIC Core Business & Office".equals(t.getName())) {
                continue;
            }
            long wc = topicWordCounts.getOrDefault(t.getId(), 0L);
            assertTrue(wc >= 18, "Expected clean unit size >= 18 for " + t.getName() + ", found " + wc);
        }

        // Verify /api/users/vocabularies/topics endpoint
        Request topicsReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/vocabularies/topics")
                .header("Authorization", "Bearer " + userToken)
                .get()
                .build();
        try (Response resp = http.newCall(topicsReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode data = objectMapper.readTree(resp.body().string()).path("data");
            assertTrue(data.size() >= 145, "Expected thematic topics >= 145, found " + data.size());
            JsonNode first = data.get(0);
            assertTrue(first.has("studiedCount"), "Topic summary should include studiedCount");
            assertTrue(first.has("masteredCount"), "Topic summary should include masteredCount");
        }

        // Verify level + keyword search endpoint
        Request searchReq = new Request.Builder()
                .url("http://localhost:" + port + "/api/users/vocabularies/all?level=B2&q=abolish&limit=20")
                .header("Authorization", "Bearer " + userToken)
                .get()
                .build();
        try (Response resp = http.newCall(searchReq).execute()) {
            assertEquals(200, resp.code());
            JsonNode data = objectMapper.readTree(resp.body().string()).path("data");
            assertTrue(data.size() >= 1);
            assertEquals("abolish", data.get(0).path("word").asText());
            assertEquals("B2", data.get(0).path("difficultyLevel").asText());
        }
    }
}
