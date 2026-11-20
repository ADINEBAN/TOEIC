package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.example.backend.dto.request.SynthesizeSpeechRequest;
import org.example.backend.dto.response.TtsSynthesizeResponse;
import org.example.backend.dto.response.TtsVoiceItemResponse;
import org.example.backend.dto.response.TtsVoicesResponse;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class SpeechifyTtsService {

    private static final Logger logger = LoggerFactory.getLogger(SpeechifyTtsService.class);
    private static final okhttp3.MediaType JSON_MEDIA_TYPE =
            okhttp3.MediaType.parse("application/json; charset=utf-8");
    private static final long VOICE_CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(15);
    private static final int MAX_CACHED_AUDIO_CLIPS = 100;
    private static final int MAX_SPEECH_CHARS = 1800;

    private static final List<String> PREFERRED_MODELS = List.of(
            "simba-3.5",
            "simba-3.2",
            "simba-3.0",
            "simba-english",
            "simba-multilingual"
    );

    private static final List<String> PREFERRED_US_VOICES = List.of(
            "geffen_32", "sabrina", "harper_32", "george", "henry", "kristy"
    );

    private static final List<String> PREFERRED_UK_VOICES = List.of(
            "beatrice_32", "oliver", "russell", "gwyneth", "emma"
    );

    private final ObjectMapper objectMapper;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build();

    @Value("${speechify.api-key:}")
    private String apiKey;

    @Value("${speechify.base-url:https://api.speechify.ai/v1}")
    private String baseUrl;

    @Value("${speechify.model:}")
    private String configuredModel;

    @Value("${speechify.default-voice-us:}")
    private String configuredUsVoiceId;

    @Value("${speechify.default-voice-uk:}")
    private String configuredUkVoiceId;

    private final Object voicesLock = new Object();
    private volatile List<TtsVoiceItemResponse> cachedVoices = List.of();
    private volatile long voicesFetchedAtMs = 0L;
    private volatile String lastVoiceLoadError = null;

    private final Map<String, CachedAudioClip> audioCache = Collections.synchronizedMap(
            new LinkedHashMap<>(128, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, CachedAudioClip> eldest) {
                    return size() > MAX_CACHED_AUDIO_CLIPS;
                }
            }
    );

    private record CachedAudioClip(
            byte[] bytes,
            String base64,
            String audioFormat,
            String mimeType,
            String voiceId,
            String voiceName,
            String locale
    ) {}

    private record SynthesisHttpOutcome(
            boolean success,
            int statusCode,
            byte[] bytes,
            String base64,
            String format,
            Integer billableChars,
            String errorMessage
    ) {}

    public TtsVoicesResponse getVoices() {
        if (isBlank(apiKey)) {
            return TtsVoicesResponse.builder()
                    .configured(false)
                    .provider("FALLBACK")
                    .defaultUsVoiceId(null)
                    .defaultUkVoiceId(null)
                    .statusMessage("Chưa cấu hình SPEECHIFY_API_KEY trên server.")
                    .voices(List.of())
                    .build();
        }

        List<TtsVoiceItemResponse> voices = ensureVoicesLoaded();
        String usDefault = pickDefaultVoiceId(voices, "US");
        String ukDefault = pickDefaultVoiceId(voices, "UK");

        String message;
        if (!voices.isEmpty()) {
            message = "Đã kết nối Speechify AI (" + voices.size() + " giọng tiếng Anh).";
        } else if (!isBlank(lastVoiceLoadError)) {
            message = lastVoiceLoadError;
        } else {
            message = "Đã cấu hình key Speechify, sẵn sàng tổng hợp giọng đọc.";
        }

        return TtsVoicesResponse.builder()
                .configured(true)
                .provider("SPEECHIFY")
                .defaultUsVoiceId(usDefault)
                .defaultUkVoiceId(ukDefault)
                .statusMessage(message)
                .voices(voices)
                .build();
    }

    public TtsSynthesizeResponse synthesize(SynthesizeSpeechRequest request) {
        String rawText = request != null ? request.getText() : null;
        if (isBlank(rawText)) {
            throw new AppException(ErrorCode.INVALID_TTS_REQUEST);
        }

        String text = normalizeSpeechText(rawText);
        String region = normalizeRegion(request != null ? request.getRegion() : null);

        if (isBlank(apiKey)) {
            return TtsSynthesizeResponse.builder()
                    .available(false)
                    .provider("FALLBACK")
                    .message("Chưa cấu hình SPEECHIFY_API_KEY trên server.")
                    .build();
        }

        List<TtsVoiceItemResponse> voices = ensureVoicesLoaded();
        TtsVoiceItemResponse resolvedVoice = resolveTargetVoice(
                voices,
                request != null ? request.getVoiceId() : null,
                region
        );

        String targetVoiceId = resolvedVoice != null && !isBlank(resolvedVoice.getId())
                ? resolvedVoice.getId()
                : (!isBlank(request != null ? request.getVoiceId() : null)
                        ? request.getVoiceId().trim()
                        : fallbackHardcodedVoiceId(region));

        String targetLocale = resolvedVoice != null && !isBlank(resolvedVoice.getLocale())
                ? resolvedVoice.getLocale()
                : ("UK".equals(region) ? "en-GB" : "en-US");

        String targetVoiceName = resolvedVoice != null && !isBlank(resolvedVoice.getDisplayName())
                ? resolvedVoice.getDisplayName()
                : targetVoiceId;

        String targetModel = !isBlank(configuredModel)
                ? configuredModel.trim()
                : (resolvedVoice != null ? resolvedVoice.getModel() : null);

        String requestedFormat = normalizeAudioFormat(request != null ? request.getAudioFormat() : null);
        String cacheKey = sha256Hex(targetVoiceId + "|" + targetLocale + "|" + requestedFormat + "|" + text);

        CachedAudioClip cached = audioCache.get(cacheKey);
        if (cached != null) {
            return TtsSynthesizeResponse.builder()
                    .available(true)
                    .provider("SPEECHIFY")
                    .cacheId(cacheKey)
                    .streamPath("/api/users/tts/audio/" + cacheKey + "." + cached.audioFormat())
                    .audioBase64(cached.base64())
                    .audioFormat(cached.audioFormat())
                    .mimeType(cached.mimeType())
                    .voiceId(cached.voiceId())
                    .voiceName(cached.voiceName())
                    .locale(cached.locale())
                    .billableCharacters(0)
                    .message("Đã phát từ bộ nhớ đệm Speechify.")
                    .build();
        }

        SynthesisHttpOutcome outcome = executeSpeechifySynthesis(text, targetVoiceId, targetLocale, targetModel, requestedFormat);
        if (!outcome.success() && (outcome.statusCode() == 400 || outcome.statusCode() == 422)) {
            logger.warn("Speechify rejected initial parameters (HTTP {}), retrying minimal payload for voiceId={}",
                    outcome.statusCode(), targetVoiceId);
            outcome = executeSpeechifySynthesis(text, targetVoiceId, null, null, requestedFormat);
        }

        if (!outcome.success() || outcome.bytes() == null || outcome.bytes().length == 0) {
            return TtsSynthesizeResponse.builder()
                    .available(false)
                    .provider("FALLBACK")
                    .voiceId(targetVoiceId)
                    .voiceName(targetVoiceName)
                    .locale(targetLocale)
                    .message(outcome.errorMessage() != null
                            ? outcome.errorMessage()
                            : "Không thể tổng hợp giọng đọc từ Speechify.")
                    .build();
        }

        String resolvedFormat = !isBlank(outcome.format()) ? outcome.format() : requestedFormat;
        String mimeType = "wav".equalsIgnoreCase(resolvedFormat) ? "audio/wav" : "audio/mpeg";
        CachedAudioClip clip = new CachedAudioClip(
                outcome.bytes(),
                outcome.base64(),
                resolvedFormat,
                mimeType,
                targetVoiceId,
                targetVoiceName,
                targetLocale
        );
        audioCache.put(cacheKey, clip);

        return TtsSynthesizeResponse.builder()
                .available(true)
                .provider("SPEECHIFY")
                .cacheId(cacheKey)
                .streamPath("/api/users/tts/audio/" + cacheKey + "." + resolvedFormat)
                .audioBase64(outcome.base64())
                .audioFormat(resolvedFormat)
                .mimeType(mimeType)
                .voiceId(targetVoiceId)
                .voiceName(targetVoiceName)
                .locale(targetLocale)
                .billableCharacters(outcome.billableChars())
                .message("Đã tổng hợp bằng Speechify AI.")
                .build();
    }

    public byte[] getCachedAudio(String rawCacheId) {
        if (isBlank(rawCacheId)) {
            return null;
        }
        String normalized = rawCacheId.trim();
        int dotIndex = normalized.indexOf('.');
        if (dotIndex > 0) {
            normalized = normalized.substring(0, dotIndex);
        }
        CachedAudioClip clip = audioCache.get(normalized);
        return clip != null ? clip.bytes() : null;
    }

    private List<TtsVoiceItemResponse> ensureVoicesLoaded() {
        long now = Instant.now().toEpochMilli();
        if (!cachedVoices.isEmpty() && (now - voicesFetchedAtMs) < VOICE_CACHE_TTL_MS) {
            return cachedVoices;
        }

        synchronized (voicesLock) {
            now = Instant.now().toEpochMilli();
            if (!cachedVoices.isEmpty() && (now - voicesFetchedAtMs) < VOICE_CACHE_TTL_MS) {
                return cachedVoices;
            }

            List<TtsVoiceItemResponse> fetched = fetchVoicesFromSpeechify();
            if (!fetched.isEmpty()) {
                cachedVoices = Collections.unmodifiableList(fetched);
                voicesFetchedAtMs = now;
                lastVoiceLoadError = null;
            }
            return cachedVoices;
        }
    }

    private List<TtsVoiceItemResponse> fetchVoicesFromSpeechify() {
        String cleanBase = normalizeBaseUrl(baseUrl);
        List<TtsVoiceItemResponse> collected = new ArrayList<>();
        String cursor = null;

        try {
            for (int page = 0; page < 2; page++) {
                HttpUrl parsedBase = HttpUrl.parse(cleanBase + "/voices");
                if (parsedBase == null) {
                    lastVoiceLoadError = "Speechify base-url không hợp lệ: " + cleanBase;
                    return List.of();
                }

                HttpUrl.Builder urlBuilder = parsedBase.newBuilder()
                        .addQueryParameter("limit", "100");
                if (!isBlank(cursor)) {
                    urlBuilder.addQueryParameter("cursor", cursor);
                }

                Request httpRequest = new Request.Builder()
                        .url(urlBuilder.build())
                        .header("Authorization", "Bearer " + apiKey.trim())
                        .header("Accept", "application/json")
                        .get()
                        .build();

                try (Response response = httpClient.newCall(httpRequest).execute()) {
                    String body = response.body() != null ? response.body().string() : "";
                    if (!response.isSuccessful()) {
                        lastVoiceLoadError = "Speechify /voices HTTP " + response.code() + summarizeApiError(body);
                        logger.warn("Speechify /voices failed: {}", lastVoiceLoadError);
                        return List.of();
                    }

                    ParsedVoicesPage parsedPage = parseVoicesJson(body);
                    collected.addAll(parsedPage.voices());
                    if (!parsedPage.hasMore() || isBlank(parsedPage.nextCursor())) {
                        break;
                    }
                    cursor = parsedPage.nextCursor();
                }
            }
        } catch (Exception ex) {
            lastVoiceLoadError = "Không thể kết nối Speechify /voices: " + ex.getMessage();
            logger.warn("Failed to fetch Speechify voices", ex);
            return List.of();
        }

        List<TtsVoiceItemResponse> englishVoices = collected.stream()
                .filter(v -> v.getLocale() != null && v.getLocale().toLowerCase(Locale.ROOT).startsWith("en"))
                .toList();

        List<TtsVoiceItemResponse> result = englishVoices.isEmpty() ? collected : englishVoices;
        return result.size() > 60 ? result.subList(0, 60) : result;
    }

    private record ParsedVoicesPage(
            List<TtsVoiceItemResponse> voices,
            boolean hasMore,
            String nextCursor
    ) {}

    @SuppressWarnings("unchecked")
    private ParsedVoicesPage parseVoicesJson(String body) {
        if (isBlank(body)) {
            return new ParsedVoicesPage(List.of(), false, null);
        }
        try {
            String trimmed = body.trim();
            List<Map<String, Object>> rawList;
            boolean hasMore = false;
            String nextCursor = null;

            if (trimmed.startsWith("[")) {
                rawList = objectMapper.readValue(trimmed, new TypeReference<>() {});
            } else {
                Map<String, Object> root = objectMapper.readValue(trimmed, new TypeReference<>() {});
                Object voicesObj = root.get("voices");
                rawList = voicesObj instanceof List<?> list
                        ? (List<Map<String, Object>>) list
                        : List.of();
                Object hasMoreObj = root.get("has_more");
                hasMore = hasMoreObj instanceof Boolean b && b;
                Object cursorObj = root.get("next_cursor");
                nextCursor = cursorObj != null ? String.valueOf(cursorObj) : null;
            }

            List<TtsVoiceItemResponse> items = new ArrayList<>();
            for (Map<String, Object> entry : rawList) {
                String id = stringOrNull(entry.get("id"));
                if (isBlank(id)) {
                    continue;
                }
                String displayName = firstNonBlank(
                        stringOrNull(entry.get("display_name")),
                        stringOrNull(entry.get("name")),
                        id
                );
                String locale = firstNonBlank(
                        stringOrNull(entry.get("locale")),
                        extractFirstModelLocale(entry.get("models")),
                        "en-US"
                );
                String gender = stringOrNull(entry.get("gender"));
                String model = extractPreferredModel(entry.get("models"));
                String previewAudio = firstNonBlank(
                        stringOrNull(entry.get("preview_audio")),
                        extractPreviewAudio(entry.get("models"))
                );

                items.add(TtsVoiceItemResponse.builder()
                        .id(id)
                        .displayName(displayName)
                        .locale(locale)
                        .gender(gender)
                        .model(model)
                        .previewAudio(previewAudio)
                        .build());
            }

            return new ParsedVoicesPage(items, hasMore, nextCursor);
        } catch (Exception ex) {
            logger.warn("Failed to parse Speechify voices JSON: {}", ex.getMessage());
            return new ParsedVoicesPage(List.of(), false, null);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractPreferredModel(Object modelsObj) {
        if (!(modelsObj instanceof List<?> modelsList) || modelsList.isEmpty()) {
            return null;
        }
        List<String> names = new ArrayList<>();
        for (Object item : modelsList) {
            if (item instanceof String s && !isBlank(s)) {
                names.add(s.trim());
            } else if (item instanceof Map<?, ?> map) {
                Object nameVal = map.get("name");
                if (nameVal != null && !isBlank(String.valueOf(nameVal))) {
                    names.add(String.valueOf(nameVal).trim());
                }
            }
        }
        for (String preferred : PREFERRED_MODELS) {
            for (String candidate : names) {
                if (preferred.equalsIgnoreCase(candidate)) {
                    return candidate;
                }
            }
        }
        return names.isEmpty() ? null : names.get(0);
    }

    @SuppressWarnings("unchecked")
    private String extractFirstModelLocale(Object modelsObj) {
        if (!(modelsObj instanceof List<?> modelsList)) {
            return null;
        }
        for (Object item : modelsList) {
            if (item instanceof Map<?, ?> map && map.get("languages") instanceof List<?> langs) {
                for (Object langObj : langs) {
                    if (langObj instanceof Map<?, ?> langMap && langMap.get("locale") != null) {
                        String loc = String.valueOf(langMap.get("locale"));
                        if (!isBlank(loc)) {
                            return loc;
                        }
                    }
                }
            }
        }
        return null;
    }

    private String extractPreviewAudio(Object modelsObj) {
        if (!(modelsObj instanceof List<?> modelsList)) {
            return null;
        }
        for (Object item : modelsList) {
            if (item instanceof Map<?, ?> map && map.get("languages") instanceof List<?> langs) {
                for (Object langObj : langs) {
                    if (langObj instanceof Map<?, ?> langMap && langMap.get("preview_audio") != null) {
                        String url = String.valueOf(langMap.get("preview_audio"));
                        if (!isBlank(url)) {
                            return url;
                        }
                    }
                }
            }
        }
        return null;
    }

    private SynthesisHttpOutcome executeSpeechifySynthesis(
            String text,
            String voiceId,
            String language,
            String model,
            String audioFormat
    ) {
        String endpoint = normalizeBaseUrl(baseUrl) + "/audio/speech";
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("input", text);
        payload.put("voice_id", voiceId);
        payload.put("audio_format", audioFormat);
        if (!isBlank(model)) {
            payload.put("model", model);
        }
        if (!isBlank(language)) {
            payload.put("language", language);
        }

        try {
            String jsonBody = objectMapper.writeValueAsString(payload);
            okhttp3.RequestBody requestBody = okhttp3.RequestBody.create(jsonBody, JSON_MEDIA_TYPE);
            Request httpRequest = new Request.Builder()
                    .url(endpoint)
                    .header("Authorization", "Bearer " + apiKey.trim())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json, audio/mpeg")
                    .post(requestBody)
                    .build();

            try (Response response = httpClient.newCall(httpRequest).execute()) {
                int status = response.code();
                String contentType = response.header("Content-Type", "");
                byte[] rawBody = response.body() != null ? response.body().bytes() : new byte[0];

                if (!response.isSuccessful()) {
                    String errText = new String(rawBody, StandardCharsets.UTF_8);
                    String summary = "Speechify HTTP " + status + summarizeApiError(errText);
                    logger.warn("Speechify synthesis failed for voiceId={}: {}", voiceId, summary);
                    return new SynthesisHttpOutcome(false, status, null, null, null, null, summary);
                }

                if (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("audio/")) {
                    String encoded = Base64.getEncoder().encodeToString(rawBody);
                    return new SynthesisHttpOutcome(true, status, rawBody, encoded, audioFormat, text.length(), null);
                }

                String responseJson = new String(rawBody, StandardCharsets.UTF_8);
                Map<String, Object> parsed = objectMapper.readValue(responseJson, new TypeReference<>() {});
                String audioBase64 = stringOrNull(parsed.get("audio_data"));
                if (isBlank(audioBase64)) {
                    return new SynthesisHttpOutcome(false, status, null, null, null, null,
                            "Speechify không trả về dữ liệu âm thanh (audio_data trống).");
                }
                byte[] decoded = Base64.getDecoder().decode(audioBase64);
                String format = firstNonBlank(stringOrNull(parsed.get("audio_format")), audioFormat);
                Integer billable = parsed.get("billable_characters_count") instanceof Number n
                        ? n.intValue()
                        : text.length();

                return new SynthesisHttpOutcome(true, status, decoded, audioBase64, format, billable, null);
            }
        } catch (Exception ex) {
            logger.error("Speechify API exception: {}", ex.getMessage(), ex);
            return new SynthesisHttpOutcome(false, 500, null, null, null, null,
                    "Lỗi gọi Speechify API: " + ex.getMessage());
        }
    }

    private TtsVoiceItemResponse resolveTargetVoice(
            List<TtsVoiceItemResponse> voices,
            String requestedVoiceId,
            String region
    ) {
        if (!isBlank(requestedVoiceId)) {
            String trimmed = requestedVoiceId.trim();
            for (TtsVoiceItemResponse voice : voices) {
                if (trimmed.equalsIgnoreCase(voice.getId())) {
                    return voice;
                }
            }
            return null;
        }

        String defaultId = pickDefaultVoiceId(voices, region);
        if (!isBlank(defaultId)) {
            for (TtsVoiceItemResponse voice : voices) {
                if (defaultId.equalsIgnoreCase(voice.getId())) {
                    return voice;
                }
            }
        }
        return voices.isEmpty() ? null : voices.get(0);
    }

    private String pickDefaultVoiceId(List<TtsVoiceItemResponse> voices, String region) {
        String configured = "UK".equals(region) ? configuredUkVoiceId : configuredUsVoiceId;
        if (!isBlank(configured)) {
            return configured.trim();
        }
        if (voices.isEmpty()) {
            return fallbackHardcodedVoiceId(region);
        }

        String targetLocalePrefix = "UK".equals(region) ? "en-gb" : "en-us";
        List<String> preferredIds = "UK".equals(region) ? PREFERRED_UK_VOICES : PREFERRED_US_VOICES;

        for (String prefId : preferredIds) {
            for (TtsVoiceItemResponse voice : voices) {
                if (prefId.equalsIgnoreCase(voice.getId())) {
                    return voice.getId();
                }
            }
        }
        for (TtsVoiceItemResponse voice : voices) {
            if (voice.getLocale() != null && voice.getLocale().toLowerCase(Locale.ROOT).startsWith(targetLocalePrefix)) {
                return voice.getId();
            }
        }
        return voices.get(0).getId();
    }

    private String fallbackHardcodedVoiceId(String region) {
        return "UK".equals(region) ? "oliver" : "george";
    }

    private String normalizeSpeechText(String rawText) {
        String collapsed = rawText.trim().replaceAll("\\s+", " ");
        if (collapsed.length() <= MAX_SPEECH_CHARS) {
            return collapsed;
        }
        int cutoff = collapsed.lastIndexOf(' ', MAX_SPEECH_CHARS);
        return cutoff > MAX_SPEECH_CHARS / 2 ? collapsed.substring(0, cutoff) : collapsed.substring(0, MAX_SPEECH_CHARS);
    }

    private String normalizeRegion(String region) {
        if (region != null && region.trim().equalsIgnoreCase("UK")) {
            return "UK";
        }
        return "US";
    }

    private String normalizeAudioFormat(String format) {
        if ("wav".equalsIgnoreCase(format)) {
            return "wav";
        }
        return "mp3";
    }

    private String normalizeBaseUrl(String raw) {
        String value = isBlank(raw) ? "https://api.speechify.ai/v1" : raw.trim();
        return value.replaceAll("/+$", "");
    }

    private String summarizeApiError(String rawBody) {
        if (isBlank(rawBody)) {
            return "";
        }
        String singleLine = rawBody.replaceAll("\\s+", " ").trim();
        if (singleLine.length() > 180) {
            singleLine = singleLine.substring(0, 180) + "...";
        }
        return " - " + singleLine;
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception ex) {
            return Integer.toHexString(Objects.hashCode(value));
        }
    }

    private String stringOrNull(Object val) {
        if (val == null) {
            return null;
        }
        String str = String.valueOf(val).trim();
        return str.isEmpty() || "null".equalsIgnoreCase(str) ? null : str;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) {
            if (!isBlank(v)) {
                return v.trim();
            }
        }
        return null;
    }

    private boolean isBlank(String val) {
        return val == null || val.trim().isEmpty();
    }
}
