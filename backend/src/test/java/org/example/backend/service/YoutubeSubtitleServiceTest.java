package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.example.backend.dto.request.YoutubeSubtitleRequest;
import org.example.backend.dto.request.YoutubeWordLookupRequest;
import org.example.backend.dto.response.YoutubeSubtitleResponse;
import org.example.backend.dto.response.YoutubeWordLookupResponse;
import org.example.backend.entity.Vocabulary;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.VocabularyRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class YoutubeSubtitleServiceTest {

    @Mock
    private VocabularyRepository vocabularyRepository;

    private HttpServer mockOpenAiServer;

    @AfterEach
    void tearDown() {
        if (mockOpenAiServer != null) {
            mockOpenAiServer.stop(0);
            mockOpenAiServer = null;
        }
    }

    @Test
    void extractsVideoIdFromVariousYoutubeFormats() {
        YoutubeSubtitleService service = new YoutubeSubtitleService(new ObjectMapper(), vocabularyRepository);
        assertEquals("M7lc1UVf-VE", service.extractVideoId("https://www.youtube.com/watch?v=M7lc1UVf-VE&t=12s"));
        assertEquals("aqz-KE-bpKQ", service.extractVideoId("https://youtu.be/aqz-KE-bpKQ"));
        assertEquals("jNQXAC9IVRw", service.extractVideoId("https://www.youtube.com/shorts/jNQXAC9IVRw"));
        assertEquals("M7lc1UVf-VE", service.extractVideoId("M7lc1UVf-VE"));
    }

    @Test
    void throwsOnInvalidYoutubeUrl() {
        YoutubeSubtitleService service = new YoutubeSubtitleService(new ObjectMapper(), vocabularyRepository);
        YoutubeSubtitleRequest req = new YoutubeSubtitleRequest();
        req.setYoutubeUrl("https://example.com/not-youtube");

        AppException ex = assertThrows(AppException.class, () -> service.generateSubtitles(req));
        assertEquals(ErrorCode.INVALID_YOUTUBE_URL, ex.getErrorCode());
    }

    @Test
    void generatesBilingualSubtitlesAndLooksUpWordViaOpenAiAndDb() throws Exception {
        mockOpenAiServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        mockOpenAiServer.createContext("/v1/chat/completions", exchange -> {
            String reqBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String contentJson;
            if (reqBody.contains("negotiate")) {
                contentJson = """
                        {
                          "choices": [
                            {
                              "message": {
                                "content": "{\\"word\\":\\"negotiate\\",\\"normalizedWord\\":\\"negotiate\\",\\"pronunciation\\":\\"/nɪˈɡəʊ.ʃi.eɪt/\\",\\"partOfSpeech\\":\\"Động từ (Verb)\\",\\"meaningVi\\":\\"đàm phán, thương lượng\\",\\"meaningEn\\":\\"try to reach an agreement\\",\\"exampleSentence\\":\\"We need to negotiate better terms.\\",\\"exampleTranslation\\":\\"Chúng ta cần đàm phán các điều khoản tốt hơn.\\",\\"grammarNote\\":\\"negotiate with sb for/about sth\\"}"
                              }
                            }
                          ]
                        }
                        """;
            } else {
                contentJson = """
                        {
                          "choices": [
                            {
                              "message": {
                                "content": "[{\\"startSeconds\\":0,\\"englishText\\":\\"Welcome to the meeting.\\",\\"vietnameseText\\":\\"Chào mừng đến buổi họp.\\"}]"
                              }
                            }
                          ]
                        }
                        """;
            }
            byte[] out = contentJson.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        mockOpenAiServer.start();

        int port = mockOpenAiServer.getAddress().getPort();
        YoutubeSubtitleService service = new YoutubeSubtitleService(new ObjectMapper(), vocabularyRepository);
        ReflectionTestUtils.setField(service, "openAiApiKey", "sk-test-key");
        ReflectionTestUtils.setField(service, "openAiModel", "gpt-4o-mini");
        ReflectionTestUtils.setField(service, "openAiBaseUrl", "http://127.0.0.1:" + port + "/v1/chat/completions");

        YoutubeSubtitleRequest subReq = new YoutubeSubtitleRequest();
        subReq.setYoutubeUrl("https://youtu.be/M7lc1UVf-VE");
        subReq.setCustomTranscript("Welcome to the meeting.");

        YoutubeSubtitleResponse subRes = service.generateSubtitles(subReq);
        assertEquals("M7lc1UVf-VE", subRes.getVideoId());
        assertFalse(subRes.getLines().isEmpty());
        assertEquals("Welcome to the meeting.", subRes.getLines().get(0).getEnglishText());
        assertEquals("Chào mừng đến buổi họp.", subRes.getLines().get(0).getVietnameseText());

        YoutubeWordLookupRequest wordReq = new YoutubeWordLookupRequest();
        wordReq.setWord("negotiate,");
        wordReq.setContextSentence("We need to negotiate better shipping rates.");

        YoutubeWordLookupResponse wordRes = service.lookupWord(wordReq);
        assertEquals("negotiate", wordRes.getNormalizedWord());
        assertEquals("Động từ (Verb)", wordRes.getPartOfSpeech());
        assertEquals("đàm phán, thương lượng", wordRes.getMeaningVi());
        assertNotNull(wordRes.getExampleSentence());
        assertEquals("OPENAI", wordRes.getSource());

        // Also verify DB fallback when OpenAI key is blank
        ReflectionTestUtils.setField(service, "openAiApiKey", "");
        Vocabulary dbItem = new Vocabulary();
        dbItem.setWord("agenda");
        dbItem.setIpa("/əˈdʒen.də/");
        dbItem.setPartOfSpeech("noun");
        dbItem.setMeaningVi("chương trình cuộc họp");
        dbItem.setExampleSentence("Please check the agenda.");
        when(vocabularyRepository.findAllByOrderByIdAsc()).thenReturn(List.of(dbItem));

        YoutubeWordLookupRequest dbReq = new YoutubeWordLookupRequest();
        dbReq.setWord("agenda.");
        YoutubeWordLookupResponse dbRes = service.lookupWord(dbReq);
        assertEquals("agenda", dbRes.getNormalizedWord());
        assertTrue(dbRes.getPartOfSpeech().contains("Danh từ"));
        assertEquals("chương trình cuộc họp", dbRes.getMeaningVi());
        assertEquals("TOEIC_DB", dbRes.getSource());
    }
}
