package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.example.backend.dto.response.YoutubeExerciseItemResponse;
import org.example.backend.dto.response.YoutubeWordLookupResponse;
import org.example.backend.entity.VideoSubtitleSegment;
import org.example.backend.entity.Vocabulary;
import org.example.backend.repository.VocabularyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class VideoTranslationAndSubtitleService {

    private static final Logger logger = LoggerFactory.getLogger(VideoTranslationAndSubtitleService.class);
    private static final MediaType JSON_MEDIA_TYPE = MediaType.parse("application/json; charset=utf-8");
    private static final Pattern SUBTITLE_STAGE_TAG_RE = Pattern.compile(
            "(?i)[\\[(]\\s*(?:music|applause|laughter|laughing|cheering|sound|noise|inaudible|singing|audio|âm nhạc|nhạc|vỗ tay|cười|tiếng động)[^\\])]*[\\])]");
    private static final Pattern SUBTITLE_NOISE_MARKERS_RE = Pattern.compile(
            "(?:>>+|<<+|&gt;&gt;|&lt;&lt;|[♪♫]+)");

    private static final Set<String> STOP_WORDS = Set.of(
            "the", "and", "for", "that", "this", "with", "from", "have", "has", "had",
            "will", "would", "could", "should", "are", "was", "were", "been", "being",
            "you", "your", "our", "their", "they", "them", "his", "her", "its", "not",
            "but", "what", "when", "where", "why", "how", "who", "all", "any", "can",
            "may", "into", "onto", "upon", "about", "after", "before", "more", "most",
            "some", "such", "than", "then", "too", "very", "just", "also", "only", "first",
            "there", "here", "these", "those", "which", "while", "because", "through");

    private final ObjectMapper objectMapper;
    private final VocabularyRepository vocabularyRepository;

    @Value("${openai.api-key:}")
    private String openAiApiKey;

    @Value("${openai.model:gpt-4o-mini}")
    private String openAiModel;

    @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
    private String openAiBaseUrl;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build();

    private final ExecutorService fallbackTranslatorPool = Executors.newFixedThreadPool(6);

    @PreDestroy
    public void shutdownPool() {
        fallbackTranslatorPool.shutdownNow();
    }

    public record RawSegmentInput(
            double startTime,
            double endTime,
            String englishText,
            double confidence,
            boolean uncertain,
            int chunkIndex) {
    }

    public record VideoMetadataSummary(
            String title,
            String topic,
            String descriptionVi,
            String level) {
    }

    public String sanitizeSubtitleText(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String text = raw.replace("&gt;&gt;", " ").replace("&lt;&lt;", " ");
        text = SUBTITLE_STAGE_TAG_RE.matcher(text).replaceAll(" ");
        text = SUBTITLE_NOISE_MARKERS_RE.matcher(text).replaceAll(" ");
        text = text.replaceAll("^\\s*[-–—•]+\\s*", "");
        return text.replaceAll("\\s+", " ").trim();
    }

    private List<String> splitSegmentForReadableSubtitles(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        String normalized = raw.replace("&gt;&gt;", ">>").replace('\n', ' ');
        String[] speakerTurns = normalized.split(">>+");
        List<String> out = new ArrayList<>();
        for (String turn : speakerTurns) {
            String cleaned = sanitizeSubtitleText(turn);
            if (cleaned.isEmpty()) {
                continue;
            }
            String[] sentences = cleaned.split("(?<=[.!?])\\s+");
            for (String sent : sentences) {
                String trimmed = sent.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                String[] words = trimmed.split("\\s+");
                if (words.length <= 10) {
                    out.add(trimmed);
                } else {
                    int chunkSize = words.length >= 16 ? 8 : (words.length + 1) / 2;
                    for (int i = 0; i < words.length; i += chunkSize) {
                        int end = Math.min(words.length, i + chunkSize);
                        String part = String.join(" ", Arrays.copyOfRange(words, i, end)).trim();
                        if (!part.isEmpty()) {
                            out.add(part);
                        }
                    }
                }
            }
        }
        return out;
    }

    /**
     * Normalizes segments across chunks: guarantees >= 0 timestamps,
     * non-overlapping monotonic timeline, removes noise tags ([Music], >>),
     * preserves original punctuation & sentence boundaries, and avoids losing or
     * duplicating words.
     */
    public List<RawSegmentInput> mergeAndNormalizeSegments(List<RawSegmentInput> input) {
        if (input == null || input.isEmpty()) {
            return List.of();
        }
        List<RawSegmentInput> sorted = new ArrayList<>(input);
        sorted.sort(
                Comparator.comparingDouble(RawSegmentInput::startTime).thenComparingDouble(RawSegmentInput::endTime));

        List<RawSegmentInput> expanded = new ArrayList<>();
        for (RawSegmentInput seg : sorted) {
            List<String> pieces = splitSegmentForReadableSubtitles(seg.englishText());
            if (pieces.isEmpty()) {
                continue;
            }
            if (pieces.size() == 1) {
                expanded.add(new RawSegmentInput(seg.startTime(), seg.endTime(), pieces.get(0),
                        seg.confidence(), seg.uncertain(), seg.chunkIndex()));
                continue;
            }
            double baseStart = Math.max(0.0, seg.startTime());
            double baseEnd = Math.max(baseStart + pieces.size() * 0.65, seg.endTime());
            double totalDur = baseEnd - baseStart;
            int totalChars = Math.max(1, pieces.stream().mapToInt(String::length).sum());
            double cursor = baseStart;
            for (int i = 0; i < pieces.size(); i++) {
                String piece = pieces.get(i);
                double dur = (i == pieces.size() - 1)
                        ? Math.max(0.65, baseEnd - cursor)
                        : Math.max(0.65, totalDur * (piece.length() / (double) totalChars));
                expanded.add(new RawSegmentInput(round2(cursor), round2(cursor + dur), piece,
                        seg.confidence(), seg.uncertain(), seg.chunkIndex()));
                cursor += dur;
            }
        }

        List<RawSegmentInput> cleaned = new ArrayList<>();
        for (RawSegmentInput seg : expanded) {
            String text = sanitizeSubtitleText(seg.englishText());
            if (text.isEmpty()) {
                continue;
            }
            double start = Math.max(0.0, seg.startTime());
            double end = Math.max(start + 0.5, seg.endTime());

            if (!cleaned.isEmpty()) {
                RawSegmentInput prev = cleaned.get(cleaned.size() - 1);
                if (Math.abs(prev.startTime() - start) < 1.5
                        && prev.englishText().equalsIgnoreCase(text)) {
                    continue;
                }
                if (start < prev.endTime()) {
                    start = prev.endTime();
                    if (end <= start) {
                        end = start + 1.0;
                    }
                }
            }

            cleaned.add(new RawSegmentInput(
                    round2(start),
                    round2(end),
                    text,
                    Math.max(0.0, Math.min(1.0, seg.confidence())),
                    seg.uncertain(),
                    seg.chunkIndex()));
        }
        return cleaned;
    }

    /**
     * Uses AI (with fast deterministic offline fallback) to summarize concise
     * title, topic,
     * Vietnamese description, and CEFR level when Admin leaves those fields blank.
     */
    @SuppressWarnings("unchecked")
    public VideoMetadataSummary summarizeVideoMetadataWithAi(
            String fullEnglishText,
            String rawSourceTitle,
            String authorName,
            String sampleVietnameseText) {
        String excerpt = buildRepresentativeExcerpt(fullEnglishText, 2400);
        if (openAiApiKey != null && !openAiApiKey.isBlank() && !excerpt.isBlank()) {
            try {
                String systemPrompt = """
                        You are a TOEIC & English learning content curator.
                        Given an English video transcript excerpt and optional source title/channel, produce concise, accurate metadata.
                        Return ONLY a valid JSON object with exact keys:
                        {
                          "title": "Concise, clear lesson title (45-85 chars, remove hashtag/emoji clickbait)",
                          "topic": "Short 2-4 word topic category (e.g. Daily Communication, Workplace Etiquette, Business Strategy, Travel English, Mindset & Habits)",
                          "descriptionVi": "Tóm tắt 2-3 câu ngắn gọn bằng tiếng Việt (UTF-8 chuẩn dấu) về nội dung chính của video và từ vựng/kỹ năng nghe học được.",
                          "level": "A2 or B1 or B2 or C1"
                        }
                        """;
                String userPrompt = "Source Title: " + (rawSourceTitle == null ? "" : rawSourceTitle)
                        + "\nChannel/Author: " + (authorName == null ? "" : authorName)
                        + "\nTranscript Excerpt:\n" + excerpt;

                Map<String, Object> payload = Map.of(
                        "model", (openAiModel == null || openAiModel.isBlank()) ? "gpt-4o-mini" : openAiModel,
                        "messages", List.of(
                                Map.of("role", "system", "content", systemPrompt),
                                Map.of("role", "user", "content", userPrompt)));
                String endpoint = (openAiBaseUrl == null || openAiBaseUrl.isBlank())
                        ? "https://api.openai.com/v1/chat/completions"
                        : openAiBaseUrl;
                Request req = new Request.Builder()
                        .url(endpoint)
                        .header("Authorization", "Bearer " + openAiApiKey.trim())
                        .header("Content-Type", "application/json")
                        .post(okhttp3.RequestBody.create(objectMapper.writeValueAsString(payload), JSON_MEDIA_TYPE))
                        .build();

                try (Response res = httpClient.newCall(req).execute()) {
                    if (res.isSuccessful() && res.body() != null) {
                        Map<String, Object> root = objectMapper.readValue(res.body().string(), new TypeReference<>() {
                        });
                        if (root.get("choices") instanceof List<?> choices && !choices.isEmpty()) {
                            Map<String, Object> first = (Map<String, Object>) choices.get(0);
                            if (first.get("message") instanceof Map<?, ?> msg && msg.get("content") != null) {
                                String raw = String.valueOf(msg.get("content"));
                                int s = raw.indexOf('{');
                                int e = raw.lastIndexOf('}');
                                if (s >= 0 && e > s) {
                                    Map<String, Object> parsed = objectMapper.readValue(
                                            raw.substring(s, e + 1), new TypeReference<>() {
                                            });
                                    String aiTitle = cleanField(parsed.get("title"), 120);
                                    String aiTopic = cleanField(parsed.get("topic"), 80);
                                    String aiDesc = cleanField(parsed.get("descriptionVi"), 600);
                                    String aiLevel = normalizeLevel(cleanField(parsed.get("level"), 10));
                                    if (!aiTitle.isEmpty() && !aiTopic.isEmpty()) {
                                        return new VideoMetadataSummary(
                                                aiTitle,
                                                aiTopic,
                                                !aiDesc.isEmpty() ? aiDesc
                                                        : buildFallbackDescriptionVi(rawSourceTitle,
                                                                sampleVietnameseText),
                                                aiLevel);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (Exception ex) {
                logger.debug("OpenAI metadata summary fallback triggered: {}", ex.getMessage());
            }
        }

        return summarizeVideoMetadataOffline(excerpt, rawSourceTitle, sampleVietnameseText);
    }

    private VideoMetadataSummary summarizeVideoMetadataOffline(
            String englishText,
            String rawSourceTitle,
            String sampleVietnameseText) {
        String cleanTitle = cleanSourceTitle(rawSourceTitle, englishText);
        String combinedLower = ((rawSourceTitle == null ? "" : rawSourceTitle) + " "
                + (englishText == null ? "" : englishText))
                .toLowerCase(Locale.ROOT);

        String topic = "Daily Communication";
        if (containsAny(combinedLower, "business", "company", "meeting", "client", "sales", "marketing", "finance",
                "invoice", "negotiate", "project", "budget")) {
            topic = "Business & Workplace";
        } else if (containsAny(combinedLower, "respect", "relationship", "friendship", "habit", "confidence", "mindset",
                "psychology", "life", "attitude")) {
            topic = "Communication & Mindset";
        } else if (containsAny(combinedLower, "interview", "career", "resume", "job", "salary", "manager")) {
            topic = "Career & Interviews";
        } else if (containsAny(combinedLower, "travel", "hotel", "airport", "flight", "restaurant", "trip",
                "booking")) {
            topic = "Travel & Hospitality";
        } else if (containsAny(combinedLower, "software", "technology", "ai", "computer", "digital", "data")) {
            topic = "Technology & Innovation";
        } else if (containsAny(combinedLower, "toeic", "grammar", "vocabulary", "listening", "pronunciation",
                "podcast")) {
            topic = "TOEIC & Listening Skills";
        }

        String level = estimateLevelFromTranscript(englishText);
        String descVi = buildFallbackDescriptionVi(cleanTitle, sampleVietnameseText);
        return new VideoMetadataSummary(cleanTitle, topic, descVi, level);
    }

    private String cleanSourceTitle(String rawTitle, String fallbackText) {
        String base = rawTitle == null ? "" : rawTitle.replaceAll("\\s+", " ").trim();
        if (!base.isEmpty() && !base.startsWith("Đang tải thông tin video")) {
            String[] segments = base.split("\\|");
            if (segments.length >= 2) {
                String primary = segments[0].trim();
                String secondary = segments[1].trim();
                base = (secondary.length() >= 8 && primary.length() + secondary.length() <= 95)
                        ? primary + " — " + secondary
                        : (primary.length() >= 12 ? primary : base);
            }
            return base.length() > 110 ? base.substring(0, 107).trim() + "..." : base;
        }
        String snippet = fallbackText == null ? "" : fallbackText.replaceAll("\\s+", " ").trim();
        if (snippet.isEmpty()) {
            return "Bài giảng tiếng Anh Song ngữ";
        }
        int dot = snippet.indexOf('.');
        String firstSentence = dot > 12 && dot < 100 ? snippet.substring(0, dot) : snippet;
        return firstSentence.length() > 95 ? firstSentence.substring(0, 92).trim() + "..." : firstSentence;
    }

    private String buildFallbackDescriptionVi(String cleanTitle, String sampleVi) {
        String vi = sanitizeSubtitleText(sampleVi);
        if (vi.length() > 260) {
            vi = vi.substring(0, 257).trim() + "...";
        }
        if (!vi.isEmpty()) {
            return "Bài học \"" + cleanTitle
                    + "\" giúp luyện nghe tiếng Anh thực tế kèm phụ đề song ngữ Anh–Việt. Nội dung nổi bật: " + vi;
        }
        return "Bài học video \"" + cleanTitle + "\" kèm phụ đề song ngữ Anh–Việt đồng bộ và từ vựng TOEIC trọng tâm.";
    }

    private String estimateLevelFromTranscript(String text) {
        if (text == null || text.isBlank())
            return "B1";
        String[] words = text.split("\\s+");
        if (words.length == 0)
            return "B1";
        double totalLen = 0;
        for (String w : words) {
            totalLen += w.replaceAll("[^a-zA-Z]", "").length();
        }
        double avg = totalLen / words.length;
        if (avg < 4.1)
            return "A2";
        if (avg < 4.75)
            return "B1";
        if (avg < 5.3)
            return "B2";
        return "C1";
    }

    private boolean containsAny(String haystack, String... needles) {
        for (String n : needles) {
            if (haystack.contains(n))
                return true;
        }
        return false;
    }

    private String cleanField(Object raw, int maxLen) {
        if (raw == null)
            return "";
        String s = String.valueOf(raw).replaceAll("\\s+", " ").trim();
        return s.length() > maxLen ? s.substring(0, maxLen).trim() : s;
    }

    private String normalizeLevel(String raw) {
        if (raw == null)
            return "B1";
        String u = raw.trim().toUpperCase(Locale.ROOT);
        if (Set.of("A1", "A2", "B1", "B2", "C1", "C2").contains(u))
            return u;
        return "B1";
    }

    private String buildRepresentativeExcerpt(String text, int maxChars) {
        if (text == null)
            return "";
        String clean = text.replaceAll("\\s+", " ").trim();
        if (clean.length() <= maxChars)
            return clean;
        int third = maxChars / 3;
        int mid = clean.length() / 2;
        return clean.substring(0, third)
                + " ... "
                + clean.substring(Math.max(0, mid - third / 2), Math.min(clean.length(), mid + third / 2))
                + " ... "
                + clean.substring(Math.max(0, clean.length() - third));
    }

    /**
     * Translates a batch of subtitle lines 1-to-1 into natural, accurate Vietnamese
     * without merging or dropping sentences.
     */
    public List<String> translateBatchToVietnamese(List<String> englishLines, String videoTitle) {
        if (englishLines == null || englishLines.isEmpty()) {
            return List.of();
        }
        if (openAiApiKey != null && !openAiApiKey.isBlank()) {
            List<String> aiOut = translateBatchWithOpenAi(englishLines, videoTitle);
            if (aiOut.size() == englishLines.size()) {
                return aiOut;
            }
        }
        return translateBatchWithFallback(englishLines);
    }

    @SuppressWarnings("unchecked")
    private List<String> translateBatchWithOpenAi(List<String> englishLines, String videoTitle) {
        try {
            StringBuilder inputBuilder = new StringBuilder();
            for (int i = 0; i < englishLines.size(); i++) {
                inputBuilder.append(i).append("|").append(englishLines.get(i)).append("\n");
            }

            String systemPrompt = """
                    You are a professional English-to-Vietnamese educational translator for language learners.
                    Translate each numbered line index|englishText into accurate, natural Vietnamese preserving full context and terminology.
                    CRITICAL RULES:
                    1. Return ONLY a JSON array of exact length matching the input count: [{"i":0,"vi":"..."}]
                    2. Never merge two lines or omit any line.
                    3. Preserve Vietnamese diacritics in proper UTF-8.
                    """;
            String userPrompt = "Video context title: " + (videoTitle == null ? "English Lesson" : videoTitle)
                    + "\nLines (" + englishLines.size() + "):\n" + inputBuilder;

            Map<String, Object> payload = Map.of(
                    "model", (openAiModel == null || openAiModel.isBlank()) ? "gpt-4o-mini" : openAiModel,
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", userPrompt)));
            String endpoint = (openAiBaseUrl == null || openAiBaseUrl.isBlank())
                    ? "https://api.openai.com/v1/chat/completions"
                    : openAiBaseUrl;
            Request req = new Request.Builder()
                    .url(endpoint)
                    .header("Authorization", "Bearer " + openAiApiKey.trim())
                    .header("Content-Type", "application/json")
                    .post(okhttp3.RequestBody.create(objectMapper.writeValueAsString(payload), JSON_MEDIA_TYPE))
                    .build();

            try (Response res = httpClient.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) {
                    return List.of();
                }
                Map<String, Object> root = objectMapper.readValue(res.body().string(), new TypeReference<>() {
                });
                if (root.get("choices") instanceof List<?> choices && !choices.isEmpty()) {
                    Map<String, Object> first = (Map<String, Object>) choices.get(0);
                    if (first.get("message") instanceof Map<?, ?> msg && msg.get("content") != null) {
                        String raw = String.valueOf(msg.get("content"));
                        int s = raw.indexOf('[');
                        int e = raw.lastIndexOf(']');
                        if (s >= 0 && e > s) {
                            List<Map<String, Object>> parsed = objectMapper.readValue(
                                    raw.substring(s, e + 1), new TypeReference<>() {
                                    });
                            Map<Integer, String> byIdx = new HashMap<>();
                            for (int k = 0; k < parsed.size(); k++) {
                                Map<String, Object> item = parsed.get(k);
                                int iVal = item.get("i") instanceof Number n ? n.intValue() : k;
                                String vi = item.get("vi") != null
                                        ? sanitizeSubtitleText(String.valueOf(item.get("vi")))
                                        : "";
                                if (!vi.isEmpty()) {
                                    byIdx.put(iVal, vi);
                                }
                            }
                            if (byIdx.size() == englishLines.size()) {
                                List<String> result = new ArrayList<>(englishLines.size());
                                for (int i = 0; i < englishLines.size(); i++) {
                                    result.add(byIdx.get(i));
                                }
                                return result;
                            }
                        }
                    }
                }
            }
        } catch (Exception ex) {
            logger.debug("OpenAI batch translation fallback triggered: {}", ex.getMessage());
        }
        return List.of();
    }

    private List<String> translateBatchWithFallback(List<String> englishLines) {
        // Fast parallel execution via bounded pool (~6x faster than sequential per-line
        // calls)
        List<CompletableFuture<String>> futures = englishLines.stream()
                .map(line -> CompletableFuture.supplyAsync(() -> translateSingleViaGoogle(line),
                        fallbackTranslatorPool))
                .toList();
        return futures.stream().map(CompletableFuture::join).toList();
    }

    public String translateSingleViaGoogle(String englishText) {
        if (englishText == null || englishText.isBlank()) {
            return "";
        }
        try {
            HttpUrl base = HttpUrl.parse("https://translate.googleapis.com/translate_a/single");
            if (base != null) {
                HttpUrl url = base.newBuilder()
                        .addQueryParameter("client", "gtx")
                        .addQueryParameter("sl", "en")
                        .addQueryParameter("tl", "vi")
                        .addQueryParameter("dt", "t")
                        .addQueryParameter("q", englishText)
                        .build();
                Request req = new Request.Builder()
                        .url(url)
                        .header("User-Agent", "Mozilla/5.0")
                        .get()
                        .build();
                try (Response res = httpClient.newCall(req).execute()) {
                    if (res.isSuccessful() && res.body() != null) {
                        List<?> outer = objectMapper.readValue(res.body().string(), List.class);
                        if (!outer.isEmpty() && outer.get(0) instanceof List<?> sentences) {
                            StringBuilder sb = new StringBuilder();
                            for (Object seg : sentences) {
                                if (seg instanceof List<?> pair && !pair.isEmpty() && pair.get(0) != null) {
                                    sb.append(pair.get(0));
                                }
                            }
                            if (!sb.isEmpty()) {
                                String cleanedVi = sanitizeSubtitleText(sb.toString());
                                return cleanedVi.isEmpty() ? sb.toString().trim() : cleanedVi;
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "[Cần dịch lại] " + englishText;
    }

    public List<YoutubeWordLookupResponse> extractKeyVocabulary(List<VideoSubtitleSegment> segments) {
        List<Vocabulary> dbVocab = vocabularyRepository.findAllByOrderByIdAsc();
        Map<String, Vocabulary> dbMap = new LinkedHashMap<>();
        for (Vocabulary v : dbVocab) {
            if (v.getWord() != null) {
                dbMap.put(v.getWord().trim().toLowerCase(Locale.ROOT), v);
            }
        }

        Set<String> seen = new LinkedHashSet<>();
        List<YoutubeWordLookupResponse> items = new ArrayList<>();
        List<Integer> missingMeaningIndices = new ArrayList<>();
        List<String> wordsToTranslate = new ArrayList<>();

        for (VideoSubtitleSegment seg : segments) {
            if (seg.getEnglishText() == null)
                continue;
            String[] tokens = seg.getEnglishText().split("\\s+");
            for (String token : tokens) {
                String clean = token.replaceAll("^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$", "");
                String lower = clean.toLowerCase(Locale.ROOT);
                if (lower.length() < 5 || STOP_WORDS.contains(lower) || seen.contains(lower)) {
                    continue;
                }
                seen.add(lower);
                Vocabulary dbHit = dbMap.get(lower);
                if (dbHit != null) {
                    items.add(YoutubeWordLookupResponse.builder()
                            .word(dbHit.getWord())
                            .normalizedWord(lower)
                            .pronunciation(dbHit.getIpa() != null ? dbHit.getIpa() : "/" + lower + "/")
                            .partOfSpeech(dbHit.getPartOfSpeech() != null ? dbHit.getPartOfSpeech() : "Vocabulary")
                            .meaningVi(dbHit.getMeaningVi())
                            .meaningEn(dbHit.getMeaningEn() != null ? dbHit.getMeaningEn() : "")
                            .exampleSentence(seg.getEnglishText())
                            .exampleTranslation(seg.getVietnameseText())
                            .grammarNote("Từ vựng TOEIC trọng tâm xuất hiện trong bài học video.")
                            .source("TOEIC_DB")
                            .build());
                } else if (items.size() < 24) {
                    missingMeaningIndices.add(items.size());
                    wordsToTranslate.add(clean);
                    items.add(YoutubeWordLookupResponse.builder()
                            .word(clean)
                            .normalizedWord(lower)
                            .pronunciation("/" + lower + "/")
                            .partOfSpeech(inferPos(lower))
                            .meaningVi("")
                            .meaningEn("Vocabulary in video transcript.")
                            .exampleSentence(seg.getEnglishText())
                            .exampleTranslation(seg.getVietnameseText())
                            .grammarNote("Nhấn Lưu để thêm vào bộ Flashcard ôn tập.")
                            .source("TRANSCRIPT_VOCAB")
                            .build());
                }
                if (items.size() >= 28) {
                    break;
                }
            }
            if (items.size() >= 28) {
                break;
            }
        }

        // Batch translate all non-DB words at once (< 1s total instead of 24 sequential
        // HTTP requests)
        if (!wordsToTranslate.isEmpty()) {
            List<String> translatedWords = translateBatchToVietnamese(wordsToTranslate, "Vocabulary Glossary");
            for (int k = 0; k < missingMeaningIndices.size(); k++) {
                int idx = missingMeaningIndices.get(k);
                String vi = k < translatedWords.size() && translatedWords.get(k) != null
                        && !translatedWords.get(k).isBlank()
                                ? translatedWords.get(k)
                                : wordsToTranslate.get(k);
                items.get(idx).setMeaningVi(vi);
            }
        }

        return items;
    }

    public List<YoutubeExerciseItemResponse> buildExercisesFromSegments(List<VideoSubtitleSegment> segments) {
        if (segments == null || segments.isEmpty()) {
            return List.of();
        }
        List<YoutubeExerciseItemResponse> exercises = new ArrayList<>();
        String[] labels = { "A", "B", "C", "D" };
        String[] pool = { "strategy", "schedule", "consistent", "priority", "management", "negotiate", "feedback",
                "proposal" };
        int step = Math.max(1, segments.size() / 5);

        for (int i = 0; i < segments.size() && exercises.size() < 5; i += step) {
            VideoSubtitleSegment seg = segments.get(i);
            if (seg.getEnglishText() == null)
                continue;
            String[] words = seg.getEnglishText().split("\\s+");
            String target = null;
            for (String w : words) {
                String clean = w.replaceAll("[^a-zA-Z]", "");
                if (clean.length() >= 5 && !STOP_WORDS.contains(clean.toLowerCase(Locale.ROOT))) {
                    target = clean;
                    break;
                }
            }
            if (target == null) {
                continue;
            }
            String blanked = seg.getEnglishText().replaceFirst(Pattern.quote(target), "______");
            int correctIdx = exercises.size() % 4;
            List<String> opts = new ArrayList<>();
            int cursor = exercises.size();
            for (int k = 0; k < 4; k++) {
                if (k == correctIdx) {
                    opts.add(labels[k] + ". " + target);
                } else {
                    String d = pool[cursor++ % pool.length];
                    if (d.equalsIgnoreCase(target)) {
                        d = pool[cursor++ % pool.length];
                    }
                    opts.add(labels[k] + ". " + d);
                }
            }
            String promptText = "Điền từ đúng tại [" + formatClock((int) Math.floor(seg.getStartTime())) + "]:\n\""
                    + blanked + "\"";
            String explainText = "Câu gốc: \"" + seg.getEnglishText() + "\" (" + seg.getVietnameseText() + ")";
            exercises.add(YoutubeExerciseItemResponse.builder()
                    .index(exercises.size() + 1)
                    .questionText(promptText)
                    .question(promptText)
                    .options(opts)
                    .correctLabel(labels[correctIdx])
                    .correctIndex(correctIdx)
                    .explanation(explainText)
                    .explanationVi(explainText)
                    .build());
        }
        return exercises;
    }

    public String exportSubtitles(List<VideoSubtitleSegment> segments, String format, String title) {
        String fmt = format == null ? "srt_bilingual" : format.trim().toLowerCase(Locale.ROOT);
        return switch (fmt) {
            case "srt_en", "en" -> exportSrt(segments, true, false);
            case "srt_vi", "vi" -> exportSrt(segments, false, true);
            case "vtt", "webvtt" -> exportWebVtt(segments, true, true);
            case "json" -> exportJson(segments, title);
            default -> exportSrt(segments, true, true);
        };
    }

    private String exportSrt(List<VideoSubtitleSegment> segments, boolean includeEn, boolean includeVi) {
        StringBuilder sb = new StringBuilder();
        for (VideoSubtitleSegment seg : segments) {
            sb.append(seg.getSequenceNumber()).append("\n")
                    .append(formatSrtTime(seg.getStartTime())).append(" --> ")
                    .append(formatSrtTime(seg.getEndTime())).append("\n");
            if (includeEn) {
                sb.append(seg.getEnglishText()).append("\n");
            }
            if (includeVi) {
                sb.append(seg.getVietnameseText()).append("\n");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private String exportWebVtt(List<VideoSubtitleSegment> segments, boolean includeEn, boolean includeVi) {
        StringBuilder sb = new StringBuilder("WEBVTT\n\n");
        for (VideoSubtitleSegment seg : segments) {
            sb.append(seg.getSequenceNumber()).append("\n")
                    .append(formatVttTime(seg.getStartTime())).append(" --> ")
                    .append(formatVttTime(seg.getEndTime())).append("\n");
            if (includeEn) {
                sb.append(seg.getEnglishText()).append("\n");
            }
            if (includeVi) {
                sb.append(seg.getVietnameseText()).append("\n");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private String exportJson(List<VideoSubtitleSegment> segments, String title) {
        try {
            List<Map<String, Object>> cues = segments.stream().map(s -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("sequence_number", s.getSequenceNumber());
                m.put("start_time", s.getStartTime());
                m.put("end_time", s.getEndTime());
                m.put("english_text", s.getEnglishText());
                m.put("vietnamese_text", s.getVietnameseText());
                m.put("confidence", s.getConfidence());
                m.put("uncertain", s.getUncertain());
                return m;
            }).toList();
            Map<String, Object> root = new LinkedHashMap<>();
            root.put("title", title);
            root.put("segmentCount", cues.size());
            root.put("subtitles", cues);
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root);
        } catch (Exception ex) {
            return "{\"subtitles\":[]}";
        }
    }

    private String formatSrtTime(double sec) {
        long msTotal = Math.max(0L, Math.round(sec * 1000.0));
        long hrs = msTotal / 3_600_000;
        long mins = (msTotal % 3_600_000) / 60_000;
        long secs = (msTotal % 60_000) / 1000;
        long ms = msTotal % 1000;
        return String.format(Locale.ROOT, "%02d:%02d:%02d,%03d", hrs, mins, secs, ms);
    }

    private String formatVttTime(double sec) {
        return formatSrtTime(sec).replace(',', '.');
    }

    private String formatClock(int sec) {
        int hrs = sec / 3600;
        int mins = (sec % 3600) / 60;
        int rem = sec % 60;
        return hrs > 0
                ? String.format(Locale.ROOT, "%02d:%02d:%02d", hrs, mins, rem)
                : String.format(Locale.ROOT, "%02d:%02d", mins, rem);
    }

    private String inferPos(String w) {
        if (w.endsWith("ly"))
            return "Trạng từ (Adverb)";
        if (w.endsWith("tion") || w.endsWith("ment") || w.endsWith("ness"))
            return "Danh từ (Noun)";
        if (w.endsWith("ive") || w.endsWith("able") || w.endsWith("ous"))
            return "Tính từ (Adjective)";
        return "Từ vựng tiếng Anh";
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
