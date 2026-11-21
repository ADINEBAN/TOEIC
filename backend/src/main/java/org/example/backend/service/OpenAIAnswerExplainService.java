package org.example.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateQuestionOptionRequest;
import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.dto.request.DraftQuestionExplainRequest;
import org.example.backend.dto.response.AIExplainResponse;
import org.example.backend.entity.AiQuestionExplanation;
import org.example.backend.entity.PracticeSetQuestion;
import org.example.backend.entity.Question;
import org.example.backend.entity.TestPartQuestion;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.AiQuestionExplanationRepository;
import org.example.backend.repository.PracticeSetQuestionRepository;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestPartQuestionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class OpenAIAnswerExplainService {

    private static final Logger logger = LoggerFactory.getLogger(OpenAIAnswerExplainService.class);
    private static final Pattern TIPS_HEADING_PATTERN =
            Pattern.compile("(?im)^\\s*(?:\\*\\*)?(?:mẹo(?:\\s+làm\\s+bài)?|tips?)(?:\\*\\*)?\\s*[:\\-]");

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final TestPartQuestionRepository testPartQuestionRepository;
    private final PracticeSetQuestionRepository practiceSetQuestionRepository;
    private final QuestionRepository questionRepository;
    private final AiQuestionExplanationRepository aiQuestionExplanationRepository;

    @Value("${openai.api-key:}")
    private String apiKey;

    @Value("${openai.model:gpt-4o-mini}")
    private String model;

    @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
    private String baseUrl;

    public AIExplainResponse explainQuestion(Long testPartQuestionId, String selectedAnswer, String type) {
        if (testPartQuestionId == null) {
            throw new AppException(ErrorCode.QUESTION_NOT_FOUND);
        }
        TestPartQuestion tpq = testPartQuestionRepository.findById(testPartQuestionId)
                .orElseThrow(() -> new AppException(ErrorCode.QUESTION_NOT_FOUND));
        return explainCore(tpq.getQuestion(), selectedAnswer, type);
    }

    public AIExplainResponse explainPracticeQuestion(Long practiceSetQuestionId, String selectedAnswer, String type) {
        if (practiceSetQuestionId == null) {
            throw new AppException(ErrorCode.QUESTION_NOT_FOUND);
        }
        PracticeSetQuestion psq = practiceSetQuestionRepository.findById(practiceSetQuestionId)
                .orElseThrow(() -> new AppException(ErrorCode.QUESTION_NOT_FOUND));
        return explainCore(psq.getQuestion(), selectedAnswer, type);
    }

    public AIExplainResponse explainRawQuestion(Long questionId, String selectedAnswer, String type) {
        if (questionId == null) {
            throw new AppException(ErrorCode.QUESTION_NOT_FOUND);
        }
        Question q = questionRepository.findById(questionId)
                .orElseThrow(() -> new AppException(ErrorCode.QUESTION_NOT_FOUND));
        return explainCore(q, selectedAnswer, type);
    }

    private AIExplainResponse explainCore(Question question, String selectedAnswer, String type) {
        String normalizedSelected = isBlank(selectedAnswer) ? "NONE" : selectedAnswer.trim().toUpperCase(Locale.ROOT);
        String normalizedType = isBlank(type) ? "BOTH" : type.trim().toUpperCase(Locale.ROOT);

        var cached = aiQuestionExplanationRepository
                .findFirstByQuestionIdAndSelectedLabelAndExplainType(question.getId(), normalizedSelected, normalizedType);
        if (cached.isPresent()) {
            AiQuestionExplanation hit = cached.get();
            AIExplainResponse res = new AIExplainResponse();
            res.setCorrectAnswer(hit.getCorrectAnswer());
            res.setUserAnswer("NONE".equals(normalizedSelected) ? "Not answered" : normalizedSelected);
            res.setExplanation(hit.getExplanation());
            res.setTips(hit.getTips());
            return res;
        }

        if (isBlank(apiKey)) {
            logger.warn("OpenAI API key is not configured (openai.api-key / OPENAI_API_KEY)");
            throw new AppException(ErrorCode.AI_API_ERROR);
        }

        String correctLabel = question.getOptions().stream()
                .filter(o -> Boolean.TRUE.equals(o.getCorrect()))
                .findFirst()
                .map(o -> o.getOptionLabel() + ": " + o.getOptionText())
                .orElse("N/A");

        List<String> allOptions = question.getOptions().stream()
                .map(o -> o.getOptionLabel() + ": " + o.getOptionText())
                .toList();

        String prompt = buildPrompt(
                question.getQuestionText(),
                question.getPassageText(),
                question.getTranscript(),
                allOptions,
                correctLabel,
                selectedAnswer,
                question.getExplanation(),
                normalizedType
        );

        try {
            String aiResponse = requestChatCompletion(
                    "Bạn là gia sư luyện thi TOEIC chuyên nghiệp. Giải thích chính xác, ngắn gọn bằng tiếng Việt.",
                    prompt
            );
            String extractedTips = extractTips(aiResponse);

            AiQuestionExplanation record = new AiQuestionExplanation();
            record.setQuestionId(question.getId());
            record.setSelectedLabel(normalizedSelected);
            record.setExplainType(normalizedType);
            record.setCorrectAnswer(correctLabel);
            record.setExplanation(aiResponse);
            record.setTips(extractedTips);
            aiQuestionExplanationRepository.save(record);

            AIExplainResponse result = new AIExplainResponse();
            result.setCorrectAnswer(correctLabel);
            result.setUserAnswer(!isBlank(selectedAnswer) ? selectedAnswer : "Not answered");
            result.setExplanation(aiResponse);
            result.setTips(extractedTips);
            return result;
        } catch (AppException e) {
            throw e;
        } catch (Exception e) {
            logger.error("OpenAI API error: {}", e.getMessage(), e);
            throw new AppException(ErrorCode.AI_API_ERROR);
        }
    }

    public AIExplainResponse generateDraftExplanation(DraftQuestionExplainRequest request) {
        if (request == null || isBlank(request.getQuestionText())) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        String correctLabel = isBlank(request.getCorrectLabel())
                ? "A"
                : request.getCorrectLabel().trim().toUpperCase(Locale.ROOT);
        List<String> allOptions = List.of(
                "A: " + safeOption(request.getOptionA()),
                "B: " + safeOption(request.getOptionB()),
                "C: " + safeOption(request.getOptionC()),
                "D: " + safeOption(request.getOptionD())
        );
        String correctOptionText = switch (correctLabel) {
            case "B" -> safeOption(request.getOptionB());
            case "C" -> safeOption(request.getOptionC());
            case "D" -> safeOption(request.getOptionD());
            default -> safeOption(request.getOptionA());
        };
        String correctAnswer = correctLabel + ": " + correctOptionText;

        if (isBlank(apiKey)) {
            String fallbackExplanation = String.format(
                    "Đáp án đúng là %s (%s). Hãy đối chiếu ngữ cảnh câu hỏi%s để loại trừ các phương án gây nhiễu.\nMẹo làm bài: Xác định từ loại/thì hoặc từ khóa chính xung quanh chỗ trống trước khi chọn đáp án.",
                    correctLabel,
                    correctOptionText,
                    request.getPartNo() != null ? " (Part " + request.getPartNo() + ")" : ""
            );
            AIExplainResponse fallback = new AIExplainResponse();
            fallback.setCorrectAnswer(correctAnswer);
            fallback.setUserAnswer(correctLabel);
            fallback.setExplanation(fallbackExplanation);
            fallback.setTips(extractTips(fallbackExplanation));
            return fallback;
        }

        String prompt = buildPrompt(
                request.getQuestionText().trim(),
                request.getPassageText(),
                request.getTranscript(),
                allOptions,
                correctAnswer,
                null,
                request.getExplanation(),
                "EXPLAIN"
        );
        String aiResponse = requestChatCompletion(
                "Bạn là gia sư luyện thi TOEIC chuyên nghiệp. Giải thích chính xác, ngắn gọn bằng tiếng Việt.",
                prompt
        );
        AIExplainResponse result = new AIExplainResponse();
        result.setCorrectAnswer(correctAnswer);
        result.setUserAnswer(correctLabel);
        result.setExplanation(aiResponse);
        result.setTips(extractTips(aiResponse));
        return result;
    }

    public int batchFillMissingExplanations(List<CreateQuestionRequest> requests) {
        if (requests == null || requests.isEmpty() || isBlank(apiKey)) {
            return 0;
        }
        List<Integer> missingIndices = new java.util.ArrayList<>();
        for (int i = 0; i < requests.size(); i++) {
            if (isBlank(requests.get(i).getExplanation())) {
                missingIndices.add(i);
            }
        }
        if (missingIndices.isEmpty()) {
            return 0;
        }

        int enriched = 0;
        int chunkSize = 10;
        for (int start = 0; start < missingIndices.size(); start += chunkSize) {
            List<Integer> chunk = missingIndices.subList(start, Math.min(start + chunkSize, missingIndices.size()));
            try {
                List<Map<String, Object>> payload = new java.util.ArrayList<>();
                for (int idx : chunk) {
                    CreateQuestionRequest q = requests.get(idx);
                    String correct = q.getOptions() == null ? "A" : q.getOptions().stream()
                            .filter(o -> Boolean.TRUE.equals(o.getCorrect()))
                            .map(CreateQuestionOptionRequest::getOptionLabel)
                            .findFirst()
                            .orElse("A");
                    List<String> opts = q.getOptions() == null ? List.of() : q.getOptions().stream()
                            .map(o -> o.getOptionLabel() + ": " + o.getOptionText())
                            .toList();
                    payload.add(Map.of(
                            "index", idx,
                            "partNo", q.getPartNo() != null ? q.getPartNo() : 5,
                            "questionText", q.getQuestionText(),
                            "options", opts,
                            "correctLabel", correct
                    ));
                }

                String aiRaw = requestChatCompletion(
                        "You are a TOEIC tutor. Return ONLY strict JSON: {\"items\":[{\"index\":0,\"explanation\":\"concise Vietnamese explanation + tip (2-4 lines)\"}]}",
                        "Generate concise Vietnamese explanations for these TOEIC questions: "
                                + objectMapper.writeValueAsString(payload)
                );
                String cleanedJson = aiRaw.replaceAll("(?s)^```json\\s*|\\s*```$", "").trim();
                JsonNode root = objectMapper.readTree(cleanedJson);
                JsonNode items = root.path("items");
                if (items.isArray()) {
                    for (JsonNode node : items) {
                        int idx = node.path("index").asInt(-1);
                        String exp = node.path("explanation").asText("").trim();
                        if (idx >= 0 && idx < requests.size() && !exp.isEmpty()) {
                            requests.get(idx).setExplanation(exp);
                            enriched++;
                        }
                    }
                }
            } catch (Exception ex) {
                logger.debug("Batch question explanation skipped chunk: {}", ex.getMessage());
            }
        }
        return enriched;
    }

    private String requestChatCompletion(String systemPrompt, String userPrompt) {
        try {
            Map<String, Object> requestBody = Map.of(
                    "model", isBlank(model) ? "gpt-4o-mini" : model.trim(),
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", userPrompt)
                    )
            );

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey.trim());

            String endpoint = isBlank(baseUrl) ? "https://api.openai.com/v1/chat/completions" : baseUrl.trim();
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);
            ResponseEntity<String> response = restTemplate.exchange(endpoint, HttpMethod.POST, request, String.class);

            String aiResponse = parseResponse(response.getBody());
            if (isBlank(aiResponse)) {
                throw new AppException(ErrorCode.AI_API_NO_RESPONSE);
            }
            return aiResponse;
        } catch (AppException e) {
            throw e;
        } catch (HttpStatusCodeException e) {
            logger.error("OpenAI API HTTP {}: {}", e.getStatusCode().value(), e.getResponseBodyAsString());
            throw new AppException(ErrorCode.AI_API_ERROR);
        } catch (Exception e) {
            logger.error("OpenAI API error: {}", e.getMessage(), e);
            throw new AppException(ErrorCode.AI_API_ERROR);
        }
    }

    private String safeOption(String raw) {
        return isBlank(raw) ? "-" : raw.trim();
    }

    @SuppressWarnings("unchecked")
    private String parseResponse(String body) {
        if (isBlank(body)) {
            return null;
        }
        try {
            Map<String, Object> json = objectMapper.readValue(body, Map.class);
            Object choicesObj = json.get("choices");
            if (choicesObj instanceof List<?> choices && !choices.isEmpty()) {
                Object firstChoice = choices.get(0);
                if (firstChoice instanceof Map<?, ?> choiceMap) {
                    Object messageObj = choiceMap.get("message");
                    if (messageObj instanceof Map<?, ?> messageMap && messageMap.get("content") != null) {
                        return String.valueOf(messageMap.get("content")).trim();
                    }
                }
            }
        } catch (Exception e) {
            logger.error("OpenAI response parse error: {}", e.getMessage());
        }
        return null;
    }

    private String buildPrompt(String question, String passageText, String transcript, List<String> options,
                               String correctAnswer, String userAnswer, String explanation, String type) {
        StringBuilder prompt = new StringBuilder();
        if (!isBlank(passageText)) {
            prompt.append("Đoạn văn / Ngữ cảnh:\n").append(passageText).append("\n\n");
        }
        if (!isBlank(transcript)) {
            prompt.append("Transcript audio:\n").append(transcript).append("\n\n");
        }
        prompt.append("Câu hỏi TOEIC:\n").append(question).append("\n\n");
        prompt.append("Các đáp án:\n");
        options.forEach(o -> prompt.append(o).append("\n"));
        prompt.append("\nĐáp án đúng: ").append(correctAnswer).append("\n");
        if (userAnswer != null && !userAnswer.isBlank()) {
            prompt.append("Câu trả lời của người dùng: ").append(userAnswer).append("\n");
        }
        if (!isBlank(explanation)) {
            prompt.append("Ghi chú ngữ pháp gốc: ").append(explanation).append("\n");
        }
        prompt.append("\nYêu cầu (chế độ ").append(type).append("):\n");
        prompt.append("- Giải thích vì sao đáp án đúng là đúng (ngắn gọn, dễ hiểu)\n");
        prompt.append("- Nếu người dùng chọn sai, giải thích vì sao đáp án đó chưa đúng\n");
        prompt.append("- Kết thúc bằng dòng bắt đầu với \"Mẹo làm bài:\" đưa ra 1-2 mẹo làm dạng câu này\n");
        prompt.append("\nQuy tắc:\n");
        prompt.append("- Trả lời bằng tiếng Việt\n");
        prompt.append("- Ngắn gọn, tối đa 6 dòng\n");
        return prompt.toString();
    }

    private String extractTips(String response) {
        Matcher matcher = TIPS_HEADING_PATTERN.matcher(response);
        if (matcher.find()) {
            return response.substring(matcher.start()).trim();
        }
        int inlineTip = response.toLowerCase(Locale.ROOT).indexOf("mẹo");
        if (inlineTip != -1) {
            return response.substring(inlineTip).trim();
        }
        int englishTip = response.toLowerCase(Locale.ROOT).indexOf("tip");
        if (englishTip != -1) {
            return response.substring(englishTip).trim();
        }
        return response;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
