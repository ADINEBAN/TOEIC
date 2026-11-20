package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.example.backend.dto.request.YoutubeSubtitleRequest;
import org.example.backend.dto.request.YoutubeWordLookupRequest;
import org.example.backend.dto.response.YoutubeExerciseItemResponse;
import org.example.backend.dto.response.YoutubeSubtitleLineResponse;
import org.example.backend.dto.response.YoutubeSubtitleResponse;
import org.example.backend.dto.response.YoutubeWordLookupResponse;
import org.example.backend.entity.Vocabulary;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.VocabularyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class YoutubeSubtitleService {

    private static final Logger logger = LoggerFactory.getLogger(YoutubeSubtitleService.class);
    private static final okhttp3.MediaType JSON_MEDIA_TYPE =
            okhttp3.MediaType.parse("application/json; charset=utf-8");

    private static final String FALLBACK_MP4_STREAM_URL =
            "https://res.cloudinary.com/dgbjuard1/video/upload/v1778387394/toeic-trainer/videos/lp1wfp6fhffnld1vcdsg.mp4";

    private static final Pattern YOUTUBE_ID_PATTERN = Pattern.compile(
            "(?:youtube\\.com/(?:watch\\?.*?v=|embed/|shorts/|live/)|youtu\\.be/)([A-Za-z0-9_-]{11})"
    );
    private static final Pattern RAW_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final Pattern CAPTION_TRACKS_PATTERN =
            Pattern.compile("\"captionTracks\"\\s*:\\s*(\\[.*?\\])");
    private static final Pattern XML_TEXT_PATTERN =
            Pattern.compile("<text[^>]*start=\"([0-9.]+)\"[^>]*>(.*?)</text>", Pattern.DOTALL);

    private static final Set<String> STOP_WORDS = Set.of(
            "the", "and", "for", "that", "this", "with", "from", "have", "has", "had",
            "will", "would", "could", "should", "are", "was", "were", "been", "being",
            "you", "your", "our", "their", "they", "them", "his", "her", "its", "not",
            "but", "what", "when", "where", "why", "how", "who", "all", "any", "can",
            "may", "into", "onto", "upon", "about", "after", "before", "more", "most",
            "some", "such", "than", "then", "too", "very", "just", "also", "only", "first",
            "let", "please", "thank", "welcome", "everyone", "today", "next", "last"
    );

    private final ObjectMapper objectMapper;
    private final VocabularyRepository vocabularyRepository;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build();

    @Value("${openai.api-key:}")
    private String openAiApiKey;

    @Value("${openai.model:gpt-4o-mini}")
    private String openAiModel;

    @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
    private String openAiBaseUrl;

    private final Map<String, YoutubeSubtitleResponse> subtitleCache = Collections.synchronizedMap(
            new LinkedHashMap<>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, YoutubeSubtitleResponse> eldest) {
                    return size() > 40;
                }
            }
    );

    private final Map<String, YoutubeWordLookupResponse> wordCache = Collections.synchronizedMap(
            new LinkedHashMap<>(128, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, YoutubeWordLookupResponse> eldest) {
                    return size() > 160;
                }
            }
    );

    private record VideoMeta(String title, String authorName) {}
    private record TimedTextLine(int startSeconds, String text) {}

    public YoutubeSubtitleResponse generateSubtitles(YoutubeSubtitleRequest request) {
        String rawUrl = request != null ? request.getYoutubeUrl() : null;
        String videoId = extractVideoId(rawUrl);
        if (isBlank(videoId)) {
            throw new AppException(ErrorCode.INVALID_YOUTUBE_URL);
        }

        String customTranscript = request != null && !isBlank(request.getCustomTranscript())
                ? request.getCustomTranscript().trim()
                : null;
        String preferredLevel = request != null && !isBlank(request.getPreferredLevel())
                ? request.getPreferredLevel().trim()
                : "B1";
        String preferredTopic = request != null && !isBlank(request.getTopicHint())
                ? request.getTopicHint().trim()
                : "Giao tiếp & TOEIC";
        String cacheKey = videoId + "|" + preferredLevel + "|" + (customTranscript != null ? customTranscript.hashCode() : "auto");

        YoutubeSubtitleResponse cached = subtitleCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        VideoMeta meta = fetchYoutubeOembedMeta(videoId);
        String canonicalUrl = "https://www.youtube.com/watch?v=" + videoId;
        String thumbnailUrl = "https://img.youtube.com/vi/" + videoId + "/hqdefault.jpg";
        String directStreamUrl = tryExtractDirectMp4Url(videoId);

        List<TimedTextLine> rawEnglishLines = customTranscript != null
                ? parseCustomTranscriptLines(customTranscript)
                : tryFetchYoutubeCaptions(videoId);

        String sourceMode;
        List<YoutubeSubtitleLineResponse> bilingualLines;

        if (!rawEnglishLines.isEmpty()) {
            List<YoutubeSubtitleLineResponse> aiTranslated = translateLinesWithOpenAi(rawEnglishLines, meta.title());
            if (!aiTranslated.isEmpty()) {
                bilingualLines = enrichLineRanges(aiTranslated);
                sourceMode = customTranscript != null ? "CUSTOM_OPENAI" : "YOUTUBE_CAPTION_OPENAI";
            } else {
                bilingualLines = enrichLineRanges(translateLinesWithFallback(rawEnglishLines));
                sourceMode = customTranscript != null ? "CUSTOM_SMART_TRANSLATE" : "YOUTUBE_CAPTION_SMART";
            }
        } else {
            List<YoutubeSubtitleLineResponse> aiGenerated = generateTopicSubtitlesWithOpenAi(meta.title(), meta.authorName());
            if (!aiGenerated.isEmpty()) {
                bilingualLines = enrichLineRanges(aiGenerated);
                sourceMode = "OPENAI_TOPIC_SUBTITLES";
            } else {
                bilingualLines = enrichLineRanges(buildCuratedToeicSubtitles(meta.title()));
                sourceMode = "TOEIC_SMART_SUBTITLES";
            }
        }

        int totalDuration = bilingualLines.isEmpty()
                ? 180
                : Math.max(60, bilingualLines.get(bilingualLines.size() - 1).getEndSeconds() + 4);

        List<YoutubeWordLookupResponse> extractedVocab = extractKeyVocabularyFromLines(bilingualLines);
        List<YoutubeExerciseItemResponse> exercises = buildExercisesFromLines(bilingualLines, extractedVocab, meta.title());

        YoutubeSubtitleResponse response = YoutubeSubtitleResponse.builder()
                .videoId(videoId)
                .youtubeUrl(canonicalUrl)
                .streamVideoUrl(!isBlank(directStreamUrl) ? directStreamUrl : FALLBACK_MP4_STREAM_URL)
                .title(meta.title())
                .authorName(meta.authorName())
                .thumbnailUrl(thumbnailUrl)
                .level(preferredLevel)
                .topic(preferredTopic)
                .durationSeconds(totalDuration)
                .durationLabel(formatTimestamp(totalDuration))
                .sourceMode(sourceMode)
                .lines(bilingualLines)
                .vocabulary(extractedVocab)
                .exercises(exercises)
                .build();

        subtitleCache.put(cacheKey, response);
        return response;
    }

    public YoutubeWordLookupResponse lookupWord(YoutubeWordLookupRequest request) {
        String rawWord = request != null ? request.getWord() : null;
        String cleanWord = sanitizeWordToken(rawWord);
        if (isBlank(cleanWord)) {
            throw new AppException(ErrorCode.INVALID_TTS_REQUEST);
        }

        String normalized = cleanWord.toLowerCase(Locale.ROOT);
        String context = request != null && !isBlank(request.getContextSentence())
                ? request.getContextSentence().trim()
                : "";
        String cacheKey = normalized + "|" + context.toLowerCase(Locale.ROOT);

        YoutubeWordLookupResponse cached = wordCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        YoutubeWordLookupResponse aiResult = lookupWordWithOpenAi(cleanWord, context);
        if (aiResult != null) {
            wordCache.put(cacheKey, aiResult);
            return aiResult;
        }

        YoutubeWordLookupResponse dbOrDictResult = lookupWordFromDatabaseAndDictionary(cleanWord, normalized, context);
        wordCache.put(cacheKey, dbOrDictResult);
        return dbOrDictResult;
    }

    public String extractVideoId(String input) {
        if (isBlank(input)) {
            return null;
        }
        String trimmed = input.trim();
        if (RAW_ID_PATTERN.matcher(trimmed).matches()) {
            return trimmed;
        }
        Matcher matcher = YOUTUBE_ID_PATTERN.matcher(trimmed);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String tryExtractDirectMp4Url(String videoId) {
        try {
            Map<String, Object> body = Map.of(
                    "videoId", videoId,
                    "context", Map.of(
                            "client", Map.of(
                                    "clientName", "ANDROID",
                                    "clientVersion", "19.09.37",
                                    "androidSdkVersion", 30,
                                    "hl", "en",
                                    "gl", "US"
                            )
                    )
            );
            String json = objectMapper.writeValueAsString(body);
            Request req = new Request.Builder()
                    .url("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
                    .header("User-Agent", "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip")
                    .header("Content-Type", "application/json")
                    .post(okhttp3.RequestBody.create(json, JSON_MEDIA_TYPE))
                    .build();

            try (Response res = httpClient.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) {
                    return null;
                }
                Map<String, Object> root = objectMapper.readValue(res.body().string(), new TypeReference<>() {});
                if (root.get("streamingData") instanceof Map<?, ?> streamingData &&
                        streamingData.get("formats") instanceof List<?> formats) {
                    for (Object fObj : formats) {
                        if (fObj instanceof Map<?, ?> fMap) {
                            String url = stringOrNull(fMap.get("url"));
                            String mime = stringOrNull(fMap.get("mimeType"));
                            if (!isBlank(url) && mime != null && mime.startsWith("video/mp4")) {
                                return url;
                            }
                        }
                    }
                }
            }
        } catch (Exception ex) {
            logger.debug("Direct MP4 extraction fallback for {}: {}", videoId, ex.getMessage());
        }
        return null;
    }

    private List<YoutubeSubtitleLineResponse> enrichLineRanges(List<YoutubeSubtitleLineResponse> raw) {
        List<YoutubeSubtitleLineResponse> enriched = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            YoutubeSubtitleLineResponse cur = raw.get(i);
            int start = Math.max(0, cur.getStartSeconds());
            int nextStart = (i + 1 < raw.size())
                    ? Math.max(start + 4, raw.get(i + 1).getStartSeconds())
                    : start + 7;
            String startLabel = formatTimestamp(start);
            String endLabel = formatTimestamp(nextStart);
            String note = !isBlank(cur.getEnglishNote())
                    ? cur.getEnglishNote()
                    : "TOEIC Focus: " + cur.getEnglishText();

            enriched.add(YoutubeSubtitleLineResponse.builder()
                    .index(i + 1)
                    .startSeconds(start)
                    .endSeconds(nextStart)
                    .timestampLabel(startLabel)
                    .rangeLabel(startLabel + " – " + endLabel)
                    .englishText(cur.getEnglishText())
                    .vietnameseText(cur.getVietnameseText())
                    .englishNote(note)
                    .build());
        }
        return enriched;
    }

    private List<YoutubeWordLookupResponse> extractKeyVocabularyFromLines(List<YoutubeSubtitleLineResponse> lines) {
        List<Vocabulary> dbVocab = vocabularyRepository.findAllByOrderByIdAsc();
        Map<String, Vocabulary> dbMap = new LinkedHashMap<>();
        for (Vocabulary v : dbVocab) {
            if (v.getWord() != null) {
                dbMap.put(v.getWord().trim().toLowerCase(Locale.ROOT), v);
            }
        }

        Set<String> seen = new LinkedHashSet<>();
        List<YoutubeWordLookupResponse> extracted = new ArrayList<>();

        for (YoutubeSubtitleLineResponse line : lines) {
            String[] tokens = line.getEnglishText().split("\\s+");
            for (String token : tokens) {
                String clean = sanitizeWordToken(token);
                String lower = clean.toLowerCase(Locale.ROOT);
                if (lower.length() < 5 || STOP_WORDS.contains(lower) || seen.contains(lower)) {
                    continue;
                }
                seen.add(lower);

                Vocabulary matchedDb = dbMap.get(lower);
                if (matchedDb != null) {
                    extracted.add(YoutubeWordLookupResponse.builder()
                            .word(matchedDb.getWord())
                            .normalizedWord(lower)
                            .pronunciation(firstNonBlank(matchedDb.getIpa(), "/" + lower + "/"))
                            .partOfSpeech(formatPosLabel(matchedDb.getPartOfSpeech(), lower))
                            .meaningVi(matchedDb.getMeaningVi())
                            .meaningEn(firstNonBlank(matchedDb.getMeaningEn(), "Key TOEIC term in this video."))
                            .exampleSentence(line.getEnglishText())
                            .exampleTranslation(line.getVietnameseText())
                            .grammarNote(buildMorphologyHint(lower))
                            .source("TOEIC_DB")
                            .build());
                } else {
                    Map<String, String[]> builtin = getBuiltinToeicGlossary();
                    String[] gloss = builtin.get(lower);
                    extracted.add(YoutubeWordLookupResponse.builder()
                            .word(clean)
                            .normalizedWord(lower)
                            .pronunciation(gloss != null ? gloss[0] : "/" + lower + "/")
                            .partOfSpeech(gloss != null ? gloss[1] : inferPartOfSpeech(lower))
                            .meaningVi(gloss != null ? gloss[2] : "Từ vựng trong câu: \"" + line.getVietnameseText() + "\"")
                            .meaningEn(gloss != null ? gloss[3] : "Key English word from the video transcript.")
                            .exampleSentence(line.getEnglishText())
                            .exampleTranslation(line.getVietnameseText())
                            .grammarNote(buildMorphologyHint(lower))
                            .source("VIDEO_GLOSSARY")
                            .build());
                }

                if (extracted.size() >= 14) {
                    return extracted;
                }
            }
        }
        return extracted;
    }

    private List<YoutubeExerciseItemResponse> buildExercisesFromLines(
            List<YoutubeSubtitleLineResponse> lines,
            List<YoutubeWordLookupResponse> vocab,
            String title
    ) {
        List<YoutubeExerciseItemResponse> list = new ArrayList<>();
        String[] labels = {"A", "B", "C", "D"};

        for (int i = 0; i < Math.min(5, lines.size()); i++) {
            YoutubeSubtitleLineResponse line = lines.get(i);
            String[] words = line.getEnglishText().split("\\s+");
            String targetWord = null;
            for (String w : words) {
                String clean = sanitizeWordToken(w);
                if (clean.length() >= 5 && !STOP_WORDS.contains(clean.toLowerCase(Locale.ROOT))) {
                    targetWord = clean;
                    break;
                }
            }
            if (targetWord == null && words.length > 0) {
                targetWord = sanitizeWordToken(words[words.length - 1]);
            }
            if (isBlank(targetWord)) {
                targetWord = "strategy";
            }

            String blanked = line.getEnglishText().replaceFirst(Pattern.quote(targetWord), "______");
            int correctIdx = i % 4;
            String[] pool = {"schedule", "proposal", "department", "feedback", "maintenance", "negotiate", "revenue", "campaign"};
            List<String> options = new ArrayList<>();
            int poolCursor = i;
            for (int optIdx = 0; optIdx < 4; optIdx++) {
                if (optIdx == correctIdx) {
                    options.add(labels[optIdx] + ". " + targetWord);
                } else {
                    String distractor = pool[poolCursor % pool.length];
                    if (distractor.equalsIgnoreCase(targetWord)) {
                        distractor = pool[(poolCursor + 1) % pool.length];
                    }
                    poolCursor++;
                    options.add(labels[optIdx] + ". " + distractor);
                }
            }

            list.add(YoutubeExerciseItemResponse.builder()
                    .index(i + 1)
                    .questionText("Điền từ đúng theo nội dung video [" + line.getTimestampLabel() + "]:\n\"" + blanked + "\"")
                    .options(options)
                    .correctLabel(labels[correctIdx])
                    .explanation("Câu gốc tại [" + line.getTimestampLabel() + "]: \"" + line.getEnglishText()
                            + "\" (" + line.getVietnameseText() + ").")
                    .build());
        }
        return list;
    }

    private Map<String, String[]> getBuiltinToeicGlossary() {
        Map<String, String[]> map = new LinkedHashMap<>();
        map.put("quarterly", new String[]{"/ˈkwɔː.təl.i/", "Tính từ / Trạng từ", "hàng quý (3 tháng 1 lần)", "occurring every three months"});
        map.put("strategy", new String[]{"/ˈstræt.ə.dʒi/", "Danh từ (Noun)", "chiến lược, kế hoạch", "a plan of action to achieve a long-term goal"});
        map.put("briefing", new String[]{"/ˈbriː.fɪŋ/", "Danh từ (Noun)", "buổi họp phổ biến thông tin ngắn", "a meeting for giving information or instructions"});
        map.put("revenue", new String[]{"/ˈrev.ən.juː/", "Danh từ (Noun)", "doanh thu, thu nhập", "income generated from normal business operations"});
        map.put("feedback", new String[]{"/ˈfiːd.bæk/", "Danh từ (Noun)", "ý kiến phản hồi", "information about reactions to a product or service"});
        map.put("campaign", new String[]{"/kæmˈpeɪn/", "Danh từ (Noun)", "chiến dịch (quảng cáo/tiếp thị)", "an organized course of action to promote a product"});
        map.put("schedule", new String[]{"/ˈʃed.juːl/", "Danh từ / Động từ", "lịch trình, tiến độ; lên lịch", "a plan for carrying out a process or procedure"});
        map.put("negotiate", new String[]{"/nɪˈɡəʊ.ʃi.eɪt/", "Động từ (Verb)", "đàm phán, thương lượng", "obtain or bring about by discussion"});
        map.put("suppliers", new String[]{"/səˈplaɪ.ərz/", "Danh từ (Noun)", "nhà cung cấp", "companies or people that provide goods or services"});
        map.put("agenda", new String[]{"/əˈdʒen.də/", "Danh từ (Noun)", "chương trình nghị sự / cuộc họp", "a list of items to be discussed at a formal meeting"});
        map.put("proposal", new String[]{"/prəˈpəʊ.zəl/", "Danh từ (Noun)", "bản đề xuất, kiến nghị", "a plan or suggestion put forward for consideration"});
        map.put("equipment", new String[]{"/ɪˈkwɪp.mənt/", "Danh từ không đếm được", "trang thiết bị, máy móc", "the necessary items for a particular purpose"});
        map.put("maintenance", new String[]{"/ˈmeɪn.tən.əns/", "Danh từ (Noun)", "sự bảo trì, bảo dưỡng", "the process of keeping equipment in good condition"});
        map.put("supervisor", new String[]{"/ˈsuː.pə.vaɪ.zər/", "Danh từ (Noun)", "người giám sát, quản lý", "a person who supervises a person or an activity"});
        map.put("participants", new String[]{"/pɑːˈtɪs.ɪ.pənts/", "Danh từ (Noun)", "người tham gia, học viên", "people who take part in an event or workshop"});
        map.put("workshop", new String[]{"/ˈwɜːk.ʃɒp/", "Danh từ (Noun)", "hội thảo chuyên đề / thực hành", "a meeting at which a group engages in intensive discussion"});
        return map;
    }

    private VideoMeta fetchYoutubeOembedMeta(String videoId) {
        String url = "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + videoId + "&format=json";
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "Mozilla/5.0")
                .get()
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (response.isSuccessful() && response.body() != null) {
                Map<String, Object> json = objectMapper.readValue(
                        response.body().string(),
                        new TypeReference<>() {}
                );
                String title = stringOrNull(json.get("title"));
                String author = stringOrNull(json.get("author_name"));
                if (!isBlank(title)) {
                    return new VideoMeta(title, !isBlank(author) ? author : "YouTube Channel");
                }
            }
        } catch (Exception ex) {
            logger.debug("oEmbed lookup fallback for videoId={}: {}", videoId, ex.getMessage());
        }
        return new VideoMeta("TOEIC English Video (" + videoId + ")", "YouTube English");
    }

    @SuppressWarnings("unchecked")
    private List<TimedTextLine> tryFetchYoutubeCaptions(String videoId) {
        List<TimedTextLine> viaPython = tryFetchCaptionsViaPythonBridge(videoId);
        if (!viaPython.isEmpty()) {
            return viaPython;
        }
        String watchUrl = "https://www.youtube.com/watch?v=" + videoId + "&hl=en";
        Request watchReq = new Request.Builder()
                .url(watchUrl)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .header("Accept-Language", "en-US,en;q=0.9")
                .get()
                .build();

        try (Response watchRes = httpClient.newCall(watchReq).execute()) {
            if (!watchRes.isSuccessful() || watchRes.body() == null) {
                return List.of();
            }
            String html = watchRes.body().string();
            Matcher matcher = CAPTION_TRACKS_PATTERN.matcher(html);
            if (!matcher.find()) {
                return List.of();
            }

            String tracksJson = matcher.group(1);
            List<Map<String, Object>> tracks = objectMapper.readValue(tracksJson, new TypeReference<>() {});
            if (tracks.isEmpty()) {
                return List.of();
            }

            String selectedBaseUrl = null;
            for (Map<String, Object> track : tracks) {
                String lang = stringOrNull(track.get("languageCode"));
                String baseUrl = stringOrNull(track.get("baseUrl"));
                if (!isBlank(baseUrl) && lang != null && lang.toLowerCase(Locale.ROOT).startsWith("en")) {
                    selectedBaseUrl = baseUrl;
                    break;
                }
            }
            if (isBlank(selectedBaseUrl)) {
                selectedBaseUrl = stringOrNull(tracks.get(0).get("baseUrl"));
            }
            if (isBlank(selectedBaseUrl)) {
                return List.of();
            }

            Request capReq = new Request.Builder()
                    .url(selectedBaseUrl)
                    .header("User-Agent", "Mozilla/5.0")
                    .get()
                    .build();

            try (Response capRes = httpClient.newCall(capReq).execute()) {
                if (!capRes.isSuccessful() || capRes.body() == null) {
                    return List.of();
                }
                return parseYoutubeTimedTextXml(capRes.body().string());
            }
        } catch (Exception ex) {
            logger.debug("Could not extract raw YouTube captions for {}: {}", videoId, ex.getMessage());
            return List.of();
        }
    }

    private List<TimedTextLine> tryFetchCaptionsViaPythonBridge(String videoId) {
        try {
            Path scriptPath = Paths.get("scripts", "video_processor.py").toAbsolutePath().normalize();
            if (!Files.exists(scriptPath)) {
                scriptPath = Paths.get("backend", "scripts", "video_processor.py").toAbsolutePath().normalize();
            }
            if (!Files.exists(scriptPath)) {
                return List.of();
            }
            ProcessBuilder pb = new ProcessBuilder(
                    "python",
                    scriptPath.toString(),
                    "fetch-captions",
                    "--url", "https://www.youtube.com/watch?v=" + videoId
            );
            Process proc = pb.start();
            boolean finished = proc.waitFor(35, TimeUnit.SECONDS);
            if (!finished) {
                proc.destroyForcibly();
                return List.of();
            }
            String stdout = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (proc.exitValue() != 0 || isBlank(stdout)) {
                return List.of();
            }
            Map<String, Object> parsed = objectMapper.readValue(stdout, new TypeReference<>() {});
            if (!(parsed.get("segments") instanceof List<?> rawList) || rawList.isEmpty()) {
                return List.of();
            }
            List<TimedTextLine> lines = new ArrayList<>();
            for (Object item : rawList) {
                if (item instanceof Map<?, ?> segMap) {
                    String text = firstNonBlank(
                            stringOrNull(segMap.get("english_text")),
                            stringOrNull(segMap.get("englishText"))
                    );
                    Object startObj = segMap.get("start_time") != null ? segMap.get("start_time") : segMap.get("startTime");
                    int startSec = startObj instanceof Number n ? (int) Math.round(n.doubleValue()) : 0;
                    if (!isBlank(text)) {
                        String cleaned = sanitizeCaptionText(text);
                        if (!isBlank(cleaned)) {
                            lines.add(new TimedTextLine(Math.max(0, startSec), cleaned));
                        }
                    }
                }
            }
            return lines;
        } catch (Exception ex) {
            logger.debug("Python caption bridge skipped for {}: {}", videoId, ex.getMessage());
            return List.of();
        }
    }

    private List<TimedTextLine> parseYoutubeTimedTextXml(String xml) {
        if (isBlank(xml)) {
            return List.of();
        }
        List<TimedTextLine> raw = new ArrayList<>();
        Matcher matcher = XML_TEXT_PATTERN.matcher(xml);
        // Full-length extraction: NEVER truncate after 20 lines (~1 minute)
        while (matcher.find()) {
            double startSec = 0;
            try {
                startSec = Double.parseDouble(matcher.group(1));
            } catch (NumberFormatException ignored) {}

            String text = sanitizeCaptionText(
                    decodeHtmlEntities(matcher.group(2)).replaceAll("<[^>]+>", " ")
            );
            if (text.length() >= 4) {
                raw.add(new TimedTextLine((int) Math.round(startSec), text));
            }
        }
        return raw;
    }

    private List<TimedTextLine> parseCustomTranscriptLines(String transcript) {
        String[] split = transcript.split("\\r?\\n|(?<=[.!?])\\s+");
        List<TimedTextLine> list = new ArrayList<>();
        int sec = 0;
        for (String line : split) {
            String cleaned = sanitizeCaptionText(line);
            if (cleaned.length() < 3) continue;
            list.add(new TimedTextLine(sec, cleaned));
            sec += 6;
        }
        return list;
    }

    private List<YoutubeSubtitleLineResponse> translateLinesWithOpenAi(List<TimedTextLine> lines, String videoTitle) {
        if (isBlank(openAiApiKey) || lines.isEmpty()) {
            return List.of();
        }
        try {
            List<YoutubeSubtitleLineResponse> allTranslated = new ArrayList<>();
            int batchSize = 25;
            String systemPrompt = """
                    Bạn là chuyên gia biên dịch phụ đề song ngữ Anh-Việt cho học viên TOEIC.
                    Nhiệm vụ: Nhận các dòng phụ đề dạng index|startSeconds|englishText và trả về DUY NHẤT một JSON array hợp lệ (không markdown) theo cấu trúc:
                    [{"startSeconds":0,"englishText":"...","vietnameseText":"..."}]
                    Dịch đầy đủ từng dòng theo đúng thứ tự, không cắt bớt, chuẩn ngữ cảnh thương mại/giao tiếp TOEIC.
                    """;

            for (int start = 0; start < lines.size(); start += batchSize) {
                int end = Math.min(lines.size(), start + batchSize);
                List<TimedTextLine> slice = lines.subList(start, end);
                StringBuilder inputBuilder = new StringBuilder();
                for (int i = 0; i < slice.size(); i++) {
                    TimedTextLine item = slice.get(i);
                    inputBuilder.append(i)
                            .append("|")
                            .append(item.startSeconds())
                            .append("|")
                            .append(item.text())
                            .append("\n");
                }
                String userPrompt = "Tiêu đề video: " + videoTitle + "\nDanh sách phụ đề:\n" + inputBuilder;
                String content = callOpenAiChat(systemPrompt, userPrompt);
                List<YoutubeSubtitleLineResponse> parsed = parseSubtitleLinesJson(content);
                if (parsed.size() != slice.size()) {
                    // Fallback gracefully on mismatch without silently truncating lines
                    for (TimedTextLine item : slice) {
                        allTranslated.add(YoutubeSubtitleLineResponse.builder()
                                .index(allTranslated.size() + 1)
                                .startSeconds(item.startSeconds())
                                .englishText(item.text())
                                .vietnameseText(translateSentenceViaPublicApi(item.text()))
                                .build());
                    }
                } else {
                    allTranslated.addAll(parsed);
                }
            }
            return allTranslated;
        } catch (Exception ex) {
            logger.warn("OpenAI subtitle translation fallback: {}", ex.getMessage());
            return List.of();
        }
    }

    private List<YoutubeSubtitleLineResponse> generateTopicSubtitlesWithOpenAi(String title, String author) {
        if (isBlank(openAiApiKey)) {
            return List.of();
        }
        try {
            String systemPrompt = """
                    Bạn là trợ lý tạo phụ đề song ngữ Anh-Việt luyện nghe TOEIC từ chủ đề video YouTube.
                    Hãy trả về DUY NHẤT một JSON array gồm 10 câu phụ đề theo trình tự thời gian (không bọc trong markdown), mỗi phần tử có dạng:
                    {"startSeconds":0,"englishText":"Câu tiếng Anh giàu từ vựng TOEIC...","vietnameseText":"Bản dịch tiếng Việt chuẩn xác..."}
                    """;
            String userPrompt = "Tạo phụ đề song ngữ Anh-Việt (10 câu, mỗi câu cách nhau 6-8 giây) bám sát nội dung video YouTube: \""
                    + title + "\" của kênh \"" + author + "\".";
            String content = callOpenAiChat(systemPrompt, userPrompt);
            return parseSubtitleLinesJson(content);
        } catch (Exception ex) {
            logger.warn("OpenAI topic subtitle generation fallback: {}", ex.getMessage());
            return List.of();
        }
    }

    private List<YoutubeSubtitleLineResponse> parseSubtitleLinesJson(String rawContent) {
        if (isBlank(rawContent)) {
            return List.of();
        }
        try {
            String cleaned = extractJsonBracketBlock(rawContent, '[', ']');
            List<Map<String, Object>> parsed = objectMapper.readValue(cleaned, new TypeReference<>() {});
            List<YoutubeSubtitleLineResponse> result = new ArrayList<>();
            int idx = 1;
            int fallbackSec = 0;
            for (Map<String, Object> item : parsed) {
                String en = stringOrNull(item.get("englishText"));
                String vi = stringOrNull(item.get("vietnameseText"));
                if (isBlank(en)) continue;
                int sec = item.get("startSeconds") instanceof Number n ? n.intValue() : fallbackSec;
                fallbackSec = sec + 6;
                result.add(YoutubeSubtitleLineResponse.builder()
                        .index(idx++)
                        .startSeconds(Math.max(0, sec))
                        .timestampLabel(formatTimestamp(Math.max(0, sec)))
                        .englishText(en.trim())
                        .vietnameseText(!isBlank(vi) ? vi.trim() : translateSentenceViaPublicApi(en))
                        .build());
            }
            return result;
        } catch (Exception ex) {
            logger.warn("Failed to parse OpenAI subtitle JSON: {}", ex.getMessage());
            return List.of();
        }
    }

    private List<YoutubeSubtitleLineResponse> translateLinesWithFallback(List<TimedTextLine> rawLines) {
        List<YoutubeSubtitleLineResponse> out = new ArrayList<>();
        int index = 1;
        for (TimedTextLine item : rawLines) {
            String vi = translateSentenceViaPublicApi(item.text());
            out.add(YoutubeSubtitleLineResponse.builder()
                    .index(index++)
                    .startSeconds(item.startSeconds())
                    .timestampLabel(formatTimestamp(item.startSeconds()))
                    .englishText(item.text())
                    .vietnameseText(vi)
                    .build());
        }
        return out;
    }

    private String translateSentenceViaPublicApi(String englishText) {
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
                                return sb.toString().trim();
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
        return "Bản dịch tiếng Việt: " + englishText;
    }

    private List<YoutubeSubtitleLineResponse> buildCuratedToeicSubtitles(String videoTitle) {
        String[][] segments = new String[][]{
                {"0", "Welcome everyone to today's quarterly business strategy briefing.", "Chào mừng mọi người đến với buổi họp chiến lược kinh doanh hàng quý hôm nay."},
                {"6", "First, let us review the revenue growth and customer feedback from last month.", "Trước tiên, chúng ta hãy xem xét mức tăng trưởng doanh thu và phản hồi khách hàng từ tháng trước."},
                {"13", "Our marketing department successfully launched the new digital campaign ahead of schedule.", "Phòng marketing của chúng ta đã triển khai thành công chiến dịch kỹ thuật số mới trước tiến độ."},
                {"20", "However, we still need to negotiate better shipping rates with our regional suppliers.", "Tuy nhiên, chúng ta vẫn cần đàm phán mức phí vận chuyển tốt hơn với các nhà cung cấp khu vực."},
                {"28", "Please review the attached agenda and submit your budget proposal by Friday afternoon.", "Vui lòng xem chương trình họp đính kèm và nộp đề xuất ngân sách của bạn trước chiều thứ Sáu."},
                {"36", "If any equipment requires maintenance, notify the facilities supervisor immediately.", "Nếu bất kỳ thiết bị nào cần bảo trì, hãy thông báo ngay cho giám sát cơ sở vật chất."},
                {"44", "All participants are encouraged to attend the upcoming training workshop next Tuesday.", "Tất cả thành viên được khuyến khích tham dự hội thảo đào tạo sắp tới vào thứ Ba tuần sau."},
                {"52", "Thank you for your dedication and outstanding contribution to this project.", "Cảm ơn sự tận tâm và đóng góp xuất sắc của các bạn cho dự án này."}
        };

        List<YoutubeSubtitleLineResponse> lines = new ArrayList<>();
        for (int i = 0; i < segments.length; i++) {
            int sec = Integer.parseInt(segments[i][0]);
            lines.add(YoutubeSubtitleLineResponse.builder()
                    .index(i + 1)
                    .startSeconds(sec)
                    .timestampLabel(formatTimestamp(sec))
                    .englishText(segments[i][1])
                    .vietnameseText(segments[i][2])
                    .build());
        }
        return lines;
    }

    private YoutubeWordLookupResponse lookupWordWithOpenAi(String word, String contextSentence) {
        if (isBlank(openAiApiKey)) {
            return null;
        }
        try {
            String systemPrompt = """
                    Bạn là từ điển AI chuyên sâu cho học viên luyện thi TOEIC.
                    Trả về DUY NHẤT một JSON object hợp lệ (không bọc trong ```json) với các trường:
                    {
                      "word": "từ gốc",
                      "normalizedWord": "dạng nguyên mẫu (lemma)",
                      "pronunciation": "/IPA/",
                      "partOfSpeech": "Danh từ (Noun) | Động từ (Verb) | Tính từ (Adjective) | Trạng từ (Adverb) | Giới từ (Preposition)",
                      "meaningVi": "Nghĩa tiếng Việt sát ngữ cảnh nhất",
                      "meaningEn": "Giải nghĩa tiếng Anh ngắn gọn",
                      "exampleSentence": "Câu ví dụ chuẩn TOEIC chứa từ này",
                      "exampleTranslation": "Dịch câu ví dụ sang tiếng Việt",
                      "grammarNote": "Cấu trúc / cụm từ (collocation) hoặc lưu ý từ loại trong đề TOEIC"
                    }
                    """;
            String userPrompt = "Từ cần tra: \"" + word + "\"\nCâu ngữ cảnh trong video: \"" + contextSentence + "\"";
            String raw = callOpenAiChat(systemPrompt, userPrompt);
            String json = extractJsonBracketBlock(raw, '{', '}');
            Map<String, Object> parsed = objectMapper.readValue(json, new TypeReference<>() {});

            String meaningVi = stringOrNull(parsed.get("meaningVi"));
            if (isBlank(meaningVi)) {
                return null;
            }
            return YoutubeWordLookupResponse.builder()
                    .word(firstNonBlank(stringOrNull(parsed.get("word")), word))
                    .normalizedWord(firstNonBlank(stringOrNull(parsed.get("normalizedWord")), word.toLowerCase(Locale.ROOT)))
                    .pronunciation(firstNonBlank(stringOrNull(parsed.get("pronunciation")), "/" + word.toLowerCase(Locale.ROOT) + "/"))
                    .partOfSpeech(firstNonBlank(stringOrNull(parsed.get("partOfSpeech")), inferPartOfSpeech(word)))
                    .meaningVi(meaningVi)
                    .meaningEn(firstNonBlank(stringOrNull(parsed.get("meaningEn")), "Common vocabulary in business and TOEIC communication."))
                    .exampleSentence(firstNonBlank(stringOrNull(parsed.get("exampleSentence")),
                            !isBlank(contextSentence) ? contextSentence : "We often use the word \"" + word + "\" in business meetings."))
                    .exampleTranslation(firstNonBlank(stringOrNull(parsed.get("exampleTranslation")),
                            translateSentenceViaPublicApi(!isBlank(contextSentence) ? contextSentence : word)))
                    .grammarNote(firstNonBlank(stringOrNull(parsed.get("grammarNote")), "Từ vựng trọng tâm thường xuất hiện trong TOEIC Part 5, 6, 7."))
                    .source("OPENAI")
                    .build();
        } catch (Exception ex) {
            logger.warn("OpenAI word lookup fallback for '{}': {}", word, ex.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private YoutubeWordLookupResponse lookupWordFromDatabaseAndDictionary(
            String cleanWord,
            String normalized,
            String contextSentence
    ) {
        List<Vocabulary> dbVocab = vocabularyRepository.findAllByOrderByIdAsc();
        for (Vocabulary v : dbVocab) {
            if (v.getWord() != null && v.getWord().trim().equalsIgnoreCase(normalized)) {
                return YoutubeWordLookupResponse.builder()
                        .word(v.getWord())
                        .normalizedWord(normalized)
                        .pronunciation(firstNonBlank(v.getIpa(), "/" + normalized + "/"))
                        .partOfSpeech(formatPosLabel(v.getPartOfSpeech(), normalized))
                        .meaningVi(v.getMeaningVi())
                        .meaningEn(firstNonBlank(v.getMeaningEn(), "Important TOEIC vocabulary term."))
                        .exampleSentence(firstNonBlank(v.getExampleSentence(), contextSentence))
                        .exampleTranslation(firstNonBlank(v.getExampleTranslation(),
                                !isBlank(contextSentence) ? translateSentenceViaPublicApi(contextSentence) : ""))
                        .grammarNote("Thuộc kho từ vựng TOEIC trọng tâm (SM-2). Chú ý vị trí từ loại trong câu.")
                        .source("TOEIC_DB")
                        .build();
            }
        }

        Map<String, String[]> builtin = getBuiltinToeicGlossary();
        if (builtin.containsKey(normalized)) {
            String[] g = builtin.get(normalized);
            String ex = !isBlank(contextSentence)
                    ? contextSentence
                    : "The team discussed the " + normalized + " during the morning session.";
            return YoutubeWordLookupResponse.builder()
                    .word(cleanWord)
                    .normalizedWord(normalized)
                    .pronunciation(g[0])
                    .partOfSpeech(g[1])
                    .meaningVi(g[2])
                    .meaningEn(g[3])
                    .exampleSentence(ex)
                    .exampleTranslation(translateSentenceViaPublicApi(ex))
                    .grammarNote(buildMorphologyHint(normalized))
                    .source("TOEIC_GLOSSARY")
                    .build();
        }

        String ipa = null;
        String pos = null;
        String defEn = null;
        String dictExample = null;

        try {
            Request req = new Request.Builder()
                    .url("https://api.dictionaryapi.dev/api/v2/entries/en/" + URLDecoder.decode(normalized, StandardCharsets.UTF_8))
                    .header("User-Agent", "Mozilla/5.0")
                    .get()
                    .build();
            try (Response res = httpClient.newCall(req).execute()) {
                if (res.isSuccessful() && res.body() != null) {
                    List<Map<String, Object>> entries = objectMapper.readValue(res.body().string(), new TypeReference<>() {});
                    if (!entries.isEmpty()) {
                        Map<String, Object> first = entries.get(0);
                        ipa = stringOrNull(first.get("phonetic"));
                        Object meaningsObj = first.get("meanings");
                        if (meaningsObj instanceof List<?> meanings && !meanings.isEmpty()) {
                            Map<String, Object> m0 = (Map<String, Object>) meanings.get(0);
                            pos = stringOrNull(m0.get("partOfSpeech"));
                            if (m0.get("definitions") instanceof List<?> defs && !defs.isEmpty()) {
                                Map<String, Object> d0 = (Map<String, Object>) defs.get(0);
                                defEn = stringOrNull(d0.get("definition"));
                                dictExample = stringOrNull(d0.get("example"));
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        String translatedWordVi = translateSentenceViaPublicApi(cleanWord);
        String finalExample = firstNonBlank(
                dictExample,
                !isBlank(contextSentence) ? contextSentence : "Please review the " + normalized + " before the meeting starts."
        );
        String finalExampleVi = translateSentenceViaPublicApi(finalExample);

        return YoutubeWordLookupResponse.builder()
                .word(cleanWord)
                .normalizedWord(normalized)
                .pronunciation(firstNonBlank(ipa, "/" + normalized + "/"))
                .partOfSpeech(formatPosLabel(pos, normalized))
                .meaningVi(translatedWordVi)
                .meaningEn(firstNonBlank(defEn, "Vocabulary used in business and daily communication."))
                .exampleSentence(finalExample)
                .exampleTranslation(finalExampleVi)
                .grammarNote(buildMorphologyHint(normalized))
                .source("SMART_DICTIONARY")
                .build();
    }

    @SuppressWarnings("unchecked")
    private String callOpenAiChat(String systemPrompt, String userPrompt) throws Exception {
        String endpoint = isBlank(openAiBaseUrl)
                ? "https://api.openai.com/v1/chat/completions"
                : openAiBaseUrl.trim();
        Map<String, Object> payload = Map.of(
                "model", isBlank(openAiModel) ? "gpt-4o-mini" : openAiModel.trim(),
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                )
        );
        String bodyJson = objectMapper.writeValueAsString(payload);
        Request request = new Request.Builder()
                .url(endpoint)
                .header("Authorization", "Bearer " + openAiApiKey.trim())
                .header("Content-Type", "application/json")
                .post(okhttp3.RequestBody.create(bodyJson, JSON_MEDIA_TYPE))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            String resBody = response.body() != null ? response.body().string() : "";
            if (!response.isSuccessful()) {
                throw new IllegalStateException("OpenAI HTTP " + response.code());
            }
            Map<String, Object> parsed = objectMapper.readValue(resBody, new TypeReference<>() {});
            if (parsed.get("choices") instanceof List<?> choices && !choices.isEmpty()) {
                Map<String, Object> first = (Map<String, Object>) choices.get(0);
                if (first.get("message") instanceof Map<?, ?> msg && msg.get("content") != null) {
                    return String.valueOf(msg.get("content")).trim();
                }
            }
            throw new IllegalStateException("Empty OpenAI choices");
        }
    }

    private String formatPosLabel(String rawPos, String word) {
        if (!isBlank(rawPos)) {
            String lower = rawPos.trim().toLowerCase(Locale.ROOT);
            if (lower.contains("noun") || lower.equals("n")) return "Danh từ (Noun)";
            if (lower.contains("verb") || lower.equals("v")) return "Động từ (Verb)";
            if (lower.contains("adj")) return "Tính từ (Adjective)";
            if (lower.contains("adv")) return "Trạng từ (Adverb)";
            if (lower.contains("prep")) return "Giới từ (Preposition)";
            if (lower.contains("conj")) return "Liên từ (Conjunction)";
            return rawPos;
        }
        return inferPartOfSpeech(word);
    }

    private String inferPartOfSpeech(String word) {
        String w = word.toLowerCase(Locale.ROOT);
        if (w.endsWith("ly")) return "Trạng từ (Adverb)";
        if (w.endsWith("tion") || w.endsWith("sion") || w.endsWith("ment") || w.endsWith("ness") || w.endsWith("ity")) {
            return "Danh từ (Noun)";
        }
        if (w.endsWith("ive") || w.endsWith("ous") || w.endsWith("able") || w.endsWith("ible") || w.endsWith("ful")) {
            return "Tính từ (Adjective)";
        }
        if (w.endsWith("ize") || w.endsWith("ate") || w.endsWith("ify") || w.endsWith("ed") || w.endsWith("ing")) {
            return "Động từ / Phân từ (Verb)";
        }
        return "Từ vựng TOEIC (Noun / Verb)";
    }

    private String buildMorphologyHint(String word) {
        if (word.endsWith("ly")) {
            return "Đuôi -ly thường là trạng từ (Adverb), đứng bổ nghĩa cho động từ thường hoặc tính từ trong TOEIC Part 5.";
        }
        if (word.endsWith("tion") || word.endsWith("ment") || word.endsWith("ness")) {
            return "Hậu tố danh từ (-tion/-ment/-ness), thường đứng sau mạo từ (a/an/the), tính từ hoặc tính từ sở hữu.";
        }
        if (word.endsWith("ive") || word.endsWith("able") || word.endsWith("ous")) {
            return "Hậu tố tính từ (-ive/-able/-ous), thường đứng trước danh từ hoặc sau động từ nối (be, become, remain).";
        }
        return "Ghi nhớ từ loại và cụm từ đi kèm (collocation) để chọn nhanh đáp án từ loại trong TOEIC Part 5 & Part 6.";
    }

    private String sanitizeWordToken(String raw) {
        if (raw == null) return "";
        return raw.trim().replaceAll("^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$", "");
    }

    private String extractJsonBracketBlock(String text, char open, char close) {
        if (isBlank(text)) return "";
        int start = text.indexOf(open);
        int end = text.lastIndexOf(close);
        if (start >= 0 && end > start) {
            return text.substring(start, end + 1);
        }
        return text.trim();
    }

    private String sanitizeCaptionText(String raw) {
        if (raw == null) return "";
        String cleaned = raw
                .replaceAll("(?iu)(?:&gt;&gt;|>>|[♪♫]|\\[(?:music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\\]|\\((?:music|âm nhạc)\\))", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return cleaned;
    }

    private String decodeHtmlEntities(String text) {
        if (text == null) return "";
        return text
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&apos;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">");
    }

    private String formatTimestamp(int totalSeconds) {
        int mins = totalSeconds / 60;
        int secs = totalSeconds % 60;
        return String.format(Locale.ROOT, "%02d:%02d", mins, secs);
    }

    private String stringOrNull(Object val) {
        if (val == null) return null;
        String str = String.valueOf(val).trim();
        return str.isEmpty() || "null".equalsIgnoreCase(str) ? null : str;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (!isBlank(v)) return v.trim();
        }
        return "";
    }

    private boolean isBlank(String val) {
        return val == null || val.trim().isEmpty();
    }
}
