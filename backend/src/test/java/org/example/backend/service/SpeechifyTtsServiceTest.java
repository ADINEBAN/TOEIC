package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.example.backend.controller.UserTtsController;
import org.example.backend.dto.request.SynthesizeSpeechRequest;
import org.example.backend.dto.response.TtsSynthesizeResponse;
import org.example.backend.dto.response.TtsVoicesResponse;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SpeechifyTtsServiceTest {

    private HttpServer mockServer;

    @AfterEach
    void tearDown() {
        if (mockServer != null) {
            mockServer.stop(0);
            mockServer = null;
        }
    }

    private SpeechifyTtsService createService(String apiKey, String baseUrl) {
        SpeechifyTtsService service = new SpeechifyTtsService(new ObjectMapper());
        ReflectionTestUtils.setField(service, "apiKey", apiKey);
        ReflectionTestUtils.setField(service, "baseUrl", baseUrl);
        ReflectionTestUtils.setField(service, "configuredModel", "");
        ReflectionTestUtils.setField(service, "configuredUsVoiceId", "");
        ReflectionTestUtils.setField(service, "configuredUkVoiceId", "");
        return service;
    }

    @Test
    void returnsFallbackStatusWhenApiKeyMissing() {
        SpeechifyTtsService service = createService("", "https://api.speechify.ai/v1");

        TtsVoicesResponse voices = service.getVoices();
        assertFalse(voices.isConfigured());
        assertEquals("FALLBACK", voices.getProvider());
        assertTrue(voices.getVoices().isEmpty());

        SynthesizeSpeechRequest req = new SynthesizeSpeechRequest();
        req.setText("negotiate");
        req.setRegion("US");

        TtsSynthesizeResponse synth = service.synthesize(req);
        assertFalse(synth.isAvailable());
        assertEquals("FALLBACK", synth.getProvider());
    }

    @Test
    void throwsOnBlankInput() {
        SpeechifyTtsService service = createService("sk_test_123", "https://api.speechify.ai/v1");
        SynthesizeSpeechRequest req = new SynthesizeSpeechRequest();
        req.setText("   ");

        AppException ex = assertThrows(AppException.class, () -> service.synthesize(req));
        assertEquals(ErrorCode.INVALID_TTS_REQUEST, ex.getErrorCode());
    }

    @Test
    void synthesizesVoicesAndCachesMp3AndStreamsViaController() throws Exception {
        byte[] sampleMp3 = new byte[]{0x49, 0x44, 0x33, 0x03, 0x00, 0x01, 0x02};
        String sampleB64 = Base64.getEncoder().encodeToString(sampleMp3);
        AtomicInteger speechCallCount = new AtomicInteger(0);
        AtomicReference<String> seenAuthHeader = new AtomicReference<>();

        mockServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        mockServer.createContext("/v1/voices", exchange -> {
            seenAuthHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            String json = """
                    {
                      "has_more": false,
                      "voices": [
                        {
                          "id": "harper_32",
                          "display_name": "Harper",
                          "locale": "en-US",
                          "gender": "female",
                          "models": [{"name": "simba-3.5"}]
                        },
                        {
                          "id": "beatrice_32",
                          "display_name": "Beatrice",
                          "locale": "en-GB",
                          "gender": "female",
                          "models": [{"name": "simba-3.2"}]
                        },
                        {
                          "id": "french_1",
                          "display_name": "Claire",
                          "locale": "fr-FR",
                          "gender": "female",
                          "models": [{"name": "simba-3.5"}]
                        }
                      ]
                    }
                    """;
            byte[] out = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });

        mockServer.createContext("/v1/audio/speech", exchange -> {
            speechCallCount.incrementAndGet();
            String json = """
                    {
                      "audio_data": "%s",
                      "audio_format": "mp3",
                      "billable_characters_count": 9
                    }
                    """.formatted(sampleB64);
            byte[] out = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        mockServer.start();

        int port = mockServer.getAddress().getPort();
        SpeechifyTtsService service = createService("sk_live_mock", "http://127.0.0.1:" + port + "/v1");

        TtsVoicesResponse voices = service.getVoices();
        assertTrue(voices.isConfigured());
        assertEquals("Bearer sk_live_mock", seenAuthHeader.get());
        assertEquals(2, voices.getVoices().size());
        assertEquals("harper_32", voices.getDefaultUsVoiceId());
        assertEquals("beatrice_32", voices.getDefaultUkVoiceId());

        SynthesizeSpeechRequest req = new SynthesizeSpeechRequest();
        req.setText("negotiate");
        req.setRegion("US");

        TtsSynthesizeResponse first = service.synthesize(req);
        assertTrue(first.isAvailable());
        assertEquals("SPEECHIFY", first.getProvider());
        assertEquals("harper_32", first.getVoiceId());
        assertEquals(sampleB64, first.getAudioBase64());
        assertEquals(9, first.getBillableCharacters());
        assertNotNull(first.getCacheId());
        assertEquals(1, speechCallCount.get());

        // Second call should hit server cache without calling Speechify again
        TtsSynthesizeResponse second = service.synthesize(req);
        assertTrue(second.isAvailable());
        assertEquals(0, second.getBillableCharacters());
        assertEquals(1, speechCallCount.get());
        assertArrayEquals(sampleMp3, service.getCachedAudio(first.getCacheId() + ".mp3"));

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new UserTtsController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        mockMvc.perform(get("/users/tts/audio/{cacheId}.mp3", first.getCacheId()))
                .andExpect(status().isOk())
                .andExpect(content().contentType("audio/mpeg"))
                .andExpect(content().bytes(sampleMp3));

        mockMvc.perform(get("/users/tts/audio/unknown-id.mp3"))
                .andExpect(status().isNotFound());
    }

    @Test
    void retriesWithoutModelWhenSpeechifyRejectsInitialModel() throws IOException {
        byte[] sampleMp3 = new byte[]{0x49, 0x44, 0x33, 0x05};
        String sampleB64 = Base64.getEncoder().encodeToString(sampleMp3);
        AtomicInteger attempt = new AtomicInteger(0);

        mockServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        mockServer.createContext("/v1/voices", exchange -> {
            byte[] out = "[]".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        mockServer.createContext("/v1/audio/speech", exchange -> {
            int count = attempt.incrementAndGet();
            if (count == 1) {
                byte[] err = "{\"error\":\"unsupported model\"}".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(400, err.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(err);
                }
                return;
            }
            byte[] ok = ("{\"audio_data\":\"" + sampleB64 + "\",\"audio_format\":\"mp3\"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, ok.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(ok);
            }
        });
        mockServer.start();

        int port = mockServer.getAddress().getPort();
        SpeechifyTtsService service = createService("sk_retry", "http://127.0.0.1:" + port + "/v1");
        ReflectionTestUtils.setField(service, "configuredModel", "invalid-model");

        SynthesizeSpeechRequest req = new SynthesizeSpeechRequest();
        req.setText("agenda");
        req.setRegion("UK");

        TtsSynthesizeResponse res = service.synthesize(req);
        assertTrue(res.isAvailable());
        assertEquals(2, attempt.get());
        assertEquals("oliver", res.getVoiceId());
    }
}
