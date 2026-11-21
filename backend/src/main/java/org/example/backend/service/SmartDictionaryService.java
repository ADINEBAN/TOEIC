package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import okhttp3.ConnectionPool;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.example.backend.dto.response.DictionaryHistoryItemResponse;
import org.example.backend.dto.response.FlashcardAiSuggestResponse;
import org.example.backend.dto.response.ImageObjectRecognitionResponse;
import org.example.backend.dto.response.SemanticDictionaryResponse;
import org.example.backend.dto.response.SemanticDictionaryResponse.CollocationEntry;
import org.example.backend.dto.response.SemanticDictionaryResponse.ExampleEntry;
import org.example.backend.dto.response.SemanticDictionaryResponse.SemanticNetwork;
import org.example.backend.dto.response.SemanticDictionaryResponse.SemanticNode;
import org.example.backend.entity.DictionaryCacheEntry;
import org.example.backend.entity.User;
import org.example.backend.entity.UserDictionaryHistory;
import org.example.backend.entity.Vocabulary;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.DictionaryCacheEntryRepository;
import org.example.backend.repository.UserDictionaryHistoryRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.VocabularyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class SmartDictionaryService {

    private static final Logger logger = LoggerFactory.getLogger(SmartDictionaryService.class);
    private static final okhttp3.MediaType JSON_MEDIA_TYPE =
            okhttp3.MediaType.parse("application/json; charset=utf-8");
    private static final long MAX_IMAGE_BYTES = 15L * 1024 * 1024;
    private static final int MAX_VISION_DIMENSION = 1024;
    private static final int L1_CACHE_MAX_SIZE = 500;
    private static final String SOURCE_LOCAL_INSTANT = "LOCAL_CATALOG_INSTANT";

    private final VocabularyRepository vocabularyRepository;
    private final DictionaryCacheEntryRepository dictionaryCacheEntryRepository;
    private final UserDictionaryHistoryRepository userDictionaryHistoryRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @Value("${openai.api-key:}")
    private String openAiApiKey;

    @Value("${openai.model:gpt-4o-mini}")
    private String openAiModel;

    @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
    private String openAiBaseUrl;

    private final ConnectionPool sharedConnectionPool = new ConnectionPool(16, 2, TimeUnit.MINUTES);

    private final OkHttpClient visionHttpClient = new OkHttpClient.Builder()
            .connectionPool(sharedConnectionPool)
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build();

    private final OkHttpClient openAiChatClient = visionHttpClient.newBuilder()
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .writeTimeout(8, TimeUnit.SECONDS)
            .build();

    private final OkHttpClient fastPublicHttpClient = visionHttpClient.newBuilder()
            .connectTimeout(2500, TimeUnit.MILLISECONDS)
            .readTimeout(3500, TimeUnit.MILLISECONDS)
            .build();

    private final ExecutorService lookupExecutor = Executors.newFixedThreadPool(8, runnable -> {
        Thread t = new Thread(runnable, "dict-lookup-worker");
        t.setDaemon(true);
        return t;
    });

    private final ConcurrentHashMap<String, CompletableFuture<SemanticDictionaryResponse>> inFlightLookups =
            new ConcurrentHashMap<>();

    private final Map<String, SemanticDictionaryResponse> lookupCache = Collections.synchronizedMap(
            new LinkedHashMap<>(256, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, SemanticDictionaryResponse> eldest) {
                    return size() > L1_CACHE_MAX_SIZE;
                }
            }
    );

    @PreDestroy
    public void shutdownExecutor() {
        lookupExecutor.shutdownNow();
    }

    public List<SemanticNode> suggestWords(String rawQuery, Integer limit) {
        String q = rawQuery == null ? "" : rawQuery.trim();
        if (q.length() < 2) {
            return List.of();
        }
        int resolvedLimit = limit != null && limit > 0 ? Math.min(limit, 25) : 12;
        String lowerQ = q.toLowerCase(Locale.ROOT);
        String capQ = Character.toUpperCase(lowerQ.charAt(0)) + lowerQ.substring(1);

        // Fast indexed prefix scan first (uses idx_vocabularies_word)
        List<Vocabulary> matches = new ArrayList<>(
                vocabularyRepository.searchPrefixActiveVocabularies(
                        lowerQ, capQ, PageRequest.of(0, resolvedLimit * 2)
                )
        );

        // Fallback to substring / Vietnamese meaning search only when prefix hits are insufficient
        if (matches.size() < resolvedLimit) {
            Set<Long> seenIds = new HashSet<>();
            matches.forEach(v -> seenIds.add(v.getId()));
            List<Vocabulary> broader = vocabularyRepository.searchActiveVocabularies(
                    null, null, q, PageRequest.of(0, resolvedLimit * 2)
            );
            for (Vocabulary v : broader) {
                if (seenIds.add(v.getId())) {
                    matches.add(v);
                }
            }
        }

        matches.sort(Comparator
                .comparing((Vocabulary v) -> !v.getWord().equalsIgnoreCase(lowerQ))
                .thenComparing(v -> !v.getWord().toLowerCase(Locale.ROOT).startsWith(lowerQ))
                .thenComparing(Vocabulary::getId));

        Map<String, SemanticNode> dedup = new LinkedHashMap<>();
        for (Vocabulary v : matches) {
            String key = v.getWord().trim().toLowerCase(Locale.ROOT);
            if (dedup.containsKey(key)) {
                continue;
            }
            dedup.put(key, SemanticNode.builder()
                    .vocabularyId(v.getId())
                    .word(v.getWord())
                    .ipa(v.getIpa())
                    .partOfSpeech(v.getPartOfSpeech())
                    .meaningVi(v.getMeaningVi())
                    .cefrLevel(v.getDifficultyLevel())
                    .relationType("SUGGESTION")
                    .relationLabel(v.getTopic() != null ? v.getTopic().getLevel() : v.getDifficultyLevel())
                    .build());
            if (dedup.size() >= resolvedLimit) {
                break;
            }
        }
        return new ArrayList<>(dedup.values());
    }

    public SemanticDictionaryResponse lookupSemanticDictionary(String rawQuery) {
        return lookupSemanticDictionary(rawQuery, null, false);
    }

    public SemanticDictionaryResponse lookupSemanticDictionary(String rawQuery, String userEmail, boolean fastOnly) {
        String cleanQuery = rawQuery == null ? "" : rawQuery.trim();
        if (cleanQuery.isEmpty() || cleanQuery.length() > 80) {
            throw new AppException(ErrorCode.INVALID_DICTIONARY_QUERY);
        }

        String rawKey = cleanQuery.toLowerCase(Locale.ROOT);
        SemanticDictionaryResponse cached = findCachedResponse(rawKey, !fastOnly);
        if (cached != null) {
            recordUserHistorySafely(userEmail, cached);
            return cached;
        }

        List<Vocabulary> dbMatches = vocabularyRepository.findByWordIgnoreCaseOrderByIdAsc(rawKey);
        Vocabulary primaryDb = dbMatches.isEmpty() ? null : dbMatches.get(0);
        String resolvedKey = rawKey;

        if (primaryDb == null && containsNonAsciiOrMultipleWords(cleanQuery)) {
            List<Vocabulary> viHits = vocabularyRepository.searchActiveVocabularies(
                    null, null, cleanQuery, PageRequest.of(0, 3)
            );
            if (!viHits.isEmpty()) {
                primaryDb = viHits.get(0);
                cleanQuery = primaryDb.getWord();
                resolvedKey = cleanQuery.trim().toLowerCase(Locale.ROOT);
                SemanticDictionaryResponse aliasCached = findCachedResponse(resolvedKey, !fastOnly);
                if (aliasCached != null) {
                    recordUserHistorySafely(userEmail, aliasCached);
                    return aliasCached;
                }
            }
        }

        if (fastOnly && primaryDb != null) {
            SemanticDictionaryResponse instant = buildLocalCatalogResponse(cleanQuery, primaryDb, true);
            mergeLocalSemanticNeighbors(instant, primaryDb);
            enrichNetworkNodesFromCatalog(instant);
            lookupCache.putIfAbsent(resolvedKey, instant);
            persistCacheEntrySafely(resolvedKey, instant, false);
            recordUserHistorySafely(userEmail, instant);
            return instant;
        }

        final String finalQuery = cleanQuery;
        final String finalResolvedKey = resolvedKey;
        final Vocabulary finalPrimaryDb = primaryDb;

        CompletableFuture<SemanticDictionaryResponse> existingFlight = inFlightLookups.get(finalResolvedKey);
        SemanticDictionaryResponse response;
        if (existingFlight != null) {
            response = existingFlight.join();
        } else {
            CompletableFuture<SemanticDictionaryResponse> newFlight = new CompletableFuture<>();
            CompletableFuture<SemanticDictionaryResponse> raced = inFlightLookups.putIfAbsent(finalResolvedKey, newFlight);
            if (raced != null) {
                response = raced.join();
            } else {
                try {
                    response = computeAndPersistFullLookup(rawKey, finalQuery, finalResolvedKey, finalPrimaryDb);
                    newFlight.complete(response);
                } catch (Throwable err) {
                    newFlight.completeExceptionally(err);
                    if (err instanceof RuntimeException re) throw re;
                    throw new RuntimeException(err);
                } finally {
                    inFlightLookups.remove(finalResolvedKey, newFlight);
                }
            }
        }

        recordUserHistorySafely(userEmail, response);
        return response;
    }

    public List<DictionaryHistoryItemResponse> getUserHistory(String userEmail, Integer limit) {
        if (isBlank(userEmail)) {
            return List.of();
        }
        Optional<User> userOpt = userRepository.findByEmail(userEmail.trim());
        if (userOpt.isEmpty()) {
            return List.of();
        }
        int resolvedLimit = limit != null && limit > 0 ? Math.min(limit, 60) : 30;
        List<UserDictionaryHistory> rows = userDictionaryHistoryRepository.findByUserIdOrderByLastLookedUpAtDesc(
                userOpt.get().getId(), PageRequest.of(0, resolvedLimit)
        );
        if (rows.isEmpty()) {
            return List.of();
        }

        Set<String> normalizedWords = new LinkedHashSet<>();
        for (UserDictionaryHistory row : rows) {
            if (!isBlank(row.getNormalizedWord())) {
                normalizedWords.add(row.getNormalizedWord());
            }
        }

        Map<String, SemanticDictionaryResponse> cachedByWord = new HashMap<>();
        for (DictionaryCacheEntry cacheRow : dictionaryCacheEntryRepository.findByNormalizedWordIn(normalizedWords)) {
            SemanticDictionaryResponse parsed = deserializePayload(cacheRow.getPayloadJson(), cacheRow.getEnriched());
            if (parsed != null) {
                parsed.setCached(true);
                cachedByWord.put(cacheRow.getNormalizedWord(), parsed);
            }
        }

        List<DictionaryHistoryItemResponse> result = new ArrayList<>(rows.size());
        for (UserDictionaryHistory row : rows) {
            SemanticDictionaryResponse cachedEntry = cachedByWord.get(row.getNormalizedWord());
            if (cachedEntry == null) {
                cachedEntry = lookupCache.get(row.getNormalizedWord());
            }
            result.add(DictionaryHistoryItemResponse.builder()
                    .id(row.getId())
                    .word(row.getWord())
                    .normalizedWord(row.getNormalizedWord())
                    .ipa(row.getIpa())
                    .partOfSpeech(row.getPartOfSpeech())
                    .cefrLevel(row.getCefrLevel())
                    .meaningVi(row.getMeaningVi())
                    .source(row.getSource())
                    .lookupCount(row.getLookupCount())
                    .lastLookedUpAt(row.getLastLookedUpAt())
                    .entry(cachedEntry)
                    .build());
        }
        return result;
    }

    @Transactional
    public void deleteUserHistoryWord(String userEmail, String word) {
        if (isBlank(userEmail) || isBlank(word)) {
            return;
        }
        userRepository.findByEmail(userEmail.trim()).ifPresent(user ->
                userDictionaryHistoryRepository.deleteByUserIdAndNormalizedWord(
                        user.getId(), word.trim().toLowerCase(Locale.ROOT)
                )
        );
    }

    @Transactional
    public void clearUserHistory(String userEmail) {
        if (isBlank(userEmail)) {
            return;
        }
        userRepository.findByEmail(userEmail.trim()).ifPresent(user ->
                userDictionaryHistoryRepository.deleteByUserId(user.getId())
        );
    }

    public ImageObjectRecognitionResponse recognizeObjectsFromImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_FILE);
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new AppException(ErrorCode.FILE_SIZE_EXCEEDED);
        }
        String contentType = file.getContentType() == null ? "image/jpeg" : file.getContentType().toLowerCase(Locale.ROOT);
        String filename = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        boolean looksLikeImage = contentType.startsWith("image/")
                || filename.endsWith(".jpg") || filename.endsWith(".jpeg")
                || filename.endsWith(".png") || filename.endsWith(".webp") || filename.endsWith(".gif");
        if (!looksLikeImage) {
            throw new AppException(ErrorCode.INVALID_FILE_TYPE);
        }
        if (isBlank(openAiApiKey)) {
            throw new AppException(ErrorCode.IMAGE_RECOGNITION_CONFIG_MISSING);
        }

        try {
            byte[] rawBytes = file.getBytes();
            String dataUri = prepareVisionDataUri(rawBytes, contentType);
            String rawJson = callOpenAiVision(dataUri);
            return parseAndEnrichRecognitionJson(rawJson);
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            logger.warn("Image object recognition failed: {}", ex.getMessage());
            throw new AppException(ErrorCode.IMAGE_RECOGNITION_FAILED);
        }
    }

    private SemanticDictionaryResponse computeAndPersistFullLookup(
            String rawKey,
            String cleanQuery,
            String resolvedKey,
            Vocabulary primaryDb
    ) {
        SemanticDictionaryResponse response = null;
        boolean enrichedByOpenAi = false;
        if (!isBlank(openAiApiKey)) {
            response = tryEnrichViaOpenAi(cleanQuery, primaryDb);
            enrichedByOpenAi = response != null;
        }

        boolean enrichedByExternal = enrichedByOpenAi;
        if (response == null) {
            response = buildFallbackSemanticResponse(cleanQuery, primaryDb);
            SemanticNetwork net = response.getSemanticNetwork();
            enrichedByExternal = net != null && (!net.getSynonyms().isEmpty()
                    || !net.getAntonyms().isEmpty()
                    || !net.getRelatedWords().isEmpty());
        }

        mergeLocalSemanticNeighbors(response, primaryDb);
        enrichNetworkNodesFromCatalog(response);
        response.setPartial(false);
        response.setCached(false);

        boolean shouldMarkEnriched = enrichedByOpenAi || enrichedByExternal || isBlank(openAiApiKey);
        lookupCache.put(rawKey, response);
        lookupCache.put(resolvedKey, response);
        if (!isBlank(response.getNormalizedWord())) {
            lookupCache.put(response.getNormalizedWord(), response);
            persistCacheEntrySafely(response.getNormalizedWord(), response, shouldMarkEnriched);
        }
        if (!resolvedKey.equals(response.getNormalizedWord())) {
            persistCacheEntrySafely(resolvedKey, response, shouldMarkEnriched);
        }
        if (!rawKey.equals(resolvedKey) && !rawKey.equals(response.getNormalizedWord())) {
            persistCacheEntrySafely(rawKey, response, shouldMarkEnriched);
        }
        return response;
    }

    private SemanticDictionaryResponse findCachedResponse(String key, boolean requireEnriched) {
        SemanticDictionaryResponse l1 = lookupCache.get(key);
        if (l1 != null && (!requireEnriched || !l1.isPartial())) {
            return copyWithCacheFlag(l1);
        }
        try {
            Optional<DictionaryCacheEntry> l2Opt = dictionaryCacheEntryRepository.findByNormalizedWord(key);
            if (l2Opt.isPresent()) {
                DictionaryCacheEntry entry = l2Opt.get();
                if (requireEnriched && !Boolean.TRUE.equals(entry.getEnriched())) {
                    return null;
                }
                SemanticDictionaryResponse parsed = deserializePayload(entry.getPayloadJson(), entry.getEnriched());
                if (parsed != null) {
                    parsed.setCached(true);
                    parsed.setPartial(!Boolean.TRUE.equals(entry.getEnriched()));
                    lookupCache.put(key, parsed);
                    return copyWithCacheFlag(parsed);
                }
            }
        } catch (Exception ex) {
            logger.debug("L2 dictionary cache read skipped for '{}': {}", key, ex.getMessage());
        }
        return null;
    }

    private SemanticDictionaryResponse copyWithCacheFlag(SemanticDictionaryResponse src) {
        return SemanticDictionaryResponse.builder()
                .vocabularyId(src.getVocabularyId())
                .word(src.getWord())
                .normalizedWord(src.getNormalizedWord())
                .ipa(src.getIpa())
                .partOfSpeech(src.getPartOfSpeech())
                .cefrLevel(src.getCefrLevel())
                .topicName(src.getTopicName())
                .meaningVi(src.getMeaningVi())
                .meaningEn(src.getMeaningEn())
                .usageNote(src.getUsageNote())
                .source(src.getSource())
                .cached(true)
                .partial(src.isPartial())
                .examples(src.getExamples() != null ? src.getExamples() : List.of())
                .semanticNetwork(src.getSemanticNetwork() != null ? src.getSemanticNetwork() : new SemanticNetwork())
                .build();
    }

    private SemanticDictionaryResponse deserializePayload(String json, Boolean enriched) {
        if (isBlank(json)) return null;
        try {
            SemanticDictionaryResponse parsed = objectMapper.readValue(json, SemanticDictionaryResponse.class);
            parsed.setPartial(!Boolean.TRUE.equals(enriched));
            return parsed;
        } catch (Exception ex) {
            return null;
        }
    }

    private void persistCacheEntrySafely(String normalizedKey, SemanticDictionaryResponse response, boolean enriched) {
        if (isBlank(normalizedKey) || response == null) return;
        String cleanKey = normalizedKey.trim().toLowerCase(Locale.ROOT);
        if (cleanKey.length() > 120) {
            cleanKey = cleanKey.substring(0, 120);
        }
        try {
            String json = objectMapper.writeValueAsString(response);
            Optional<DictionaryCacheEntry> existingOpt = dictionaryCacheEntryRepository.findByNormalizedWord(cleanKey);
            if (existingOpt.isPresent()) {
                DictionaryCacheEntry row = existingOpt.get();
                // Do not downgrade an already-enriched DB entry with a partial local preview
                if (!enriched && Boolean.TRUE.equals(row.getEnriched())) {
                    return;
                }
                updateCacheEntityFromResponse(row, response, json, enriched);
                dictionaryCacheEntryRepository.save(row);
            } else {
                DictionaryCacheEntry row = new DictionaryCacheEntry();
                row.setNormalizedWord(cleanKey);
                row.setHitCount(1);
                updateCacheEntityFromResponse(row, response, json, enriched);
                try {
                    dictionaryCacheEntryRepository.save(row);
                } catch (DataIntegrityViolationException race) {
                    dictionaryCacheEntryRepository.findByNormalizedWord(cleanKey).ifPresent(existing -> {
                        if (enriched || !Boolean.TRUE.equals(existing.getEnriched())) {
                            updateCacheEntityFromResponse(existing, response, json, enriched);
                            dictionaryCacheEntryRepository.save(existing);
                        }
                    });
                }
            }
        } catch (Exception ex) {
            logger.debug("Skipping persistent cache write for '{}': {}", cleanKey, ex.getMessage());
        }
    }

    private void updateCacheEntityFromResponse(
            DictionaryCacheEntry row,
            SemanticDictionaryResponse response,
            String json,
            boolean enriched
    ) {
        row.setWord(truncate(firstNonBlank(response.getWord(), row.getNormalizedWord()), 120));
        row.setIpa(truncate(response.getIpa(), 120));
        row.setPartOfSpeech(truncate(response.getPartOfSpeech(), 50));
        row.setCefrLevel(truncate(response.getCefrLevel(), 20));
        row.setMeaningVi(truncate(response.getMeaningVi(), 500));
        row.setSource(truncate(response.getSource(), 50));
        row.setEnriched(enriched);
        row.setPayloadJson(json);
        row.setLastAccessedAt(LocalDateTime.now());
    }

    private void recordUserHistorySafely(String userEmail, SemanticDictionaryResponse response) {
        if (isBlank(userEmail) || response == null || isBlank(response.getWord())) {
            return;
        }
        try {
            Optional<User> userOpt = userRepository.findByEmail(userEmail.trim());
            if (userOpt.isEmpty()) {
                return;
            }
            User user = userOpt.get();
            String norm = truncate(
                    firstNonBlank(response.getNormalizedWord(), response.getWord().toLowerCase(Locale.ROOT)),
                    120
            );
            LocalDateTime now = LocalDateTime.now();
            Optional<UserDictionaryHistory> existingOpt =
                    userDictionaryHistoryRepository.findByUserIdAndNormalizedWord(user.getId(), norm);

            if (existingOpt.isPresent()) {
                UserDictionaryHistory hist = existingOpt.get();
                hist.setWord(truncate(response.getWord(), 120));
                hist.setIpa(truncate(response.getIpa(), 120));
                hist.setPartOfSpeech(truncate(response.getPartOfSpeech(), 50));
                hist.setCefrLevel(truncate(response.getCefrLevel(), 20));
                hist.setMeaningVi(truncate(response.getMeaningVi(), 500));
                hist.setSource(truncate(response.getSource(), 50));
                hist.setLookupCount((hist.getLookupCount() == null ? 0 : hist.getLookupCount()) + 1);
                hist.setLastLookedUpAt(now);
                userDictionaryHistoryRepository.save(hist);
            } else {
                UserDictionaryHistory hist = new UserDictionaryHistory();
                hist.setUser(user);
                hist.setNormalizedWord(norm);
                hist.setWord(truncate(response.getWord(), 120));
                hist.setIpa(truncate(response.getIpa(), 120));
                hist.setPartOfSpeech(truncate(response.getPartOfSpeech(), 50));
                hist.setCefrLevel(truncate(response.getCefrLevel(), 20));
                hist.setMeaningVi(truncate(response.getMeaningVi(), 500));
                hist.setSource(truncate(response.getSource(), 50));
                hist.setLookupCount(1);
                hist.setLastLookedUpAt(now);
                try {
                    userDictionaryHistoryRepository.save(hist);
                } catch (DataIntegrityViolationException ignoredRace) {
                    // Safe ignore on concurrent double tap for same word
                }
            }
        } catch (Exception ex) {
            logger.debug("Skipping dictionary history update: {}", ex.getMessage());
        }
    }

    private SemanticDictionaryResponse buildLocalCatalogResponse(String query, Vocabulary primaryDb, boolean partial) {
        String headword = primaryDb != null ? primaryDb.getWord() : query;
        String lower = headword.toLowerCase(Locale.ROOT);
        List<ExampleEntry> examples = new ArrayList<>();
        if (primaryDb != null && !isBlank(primaryDb.getExampleSentence())) {
            examples.add(ExampleEntry.builder()
                    .english(primaryDb.getExampleSentence())
                    .vietnamese(primaryDb.getExampleTranslation())
                    .build());
        }
        return SemanticDictionaryResponse.builder()
                .vocabularyId(primaryDb != null ? primaryDb.getId() : null)
                .word(headword)
                .normalizedWord(lower)
                .ipa(firstNonBlank(primaryDb != null ? primaryDb.getIpa() : null, "/" + lower + "/"))
                .partOfSpeech(firstNonBlank(primaryDb != null ? primaryDb.getPartOfSpeech() : null, "noun"))
                .cefrLevel(primaryDb != null ? primaryDb.getDifficultyLevel() : null)
                .topicName(primaryDb != null && primaryDb.getTopic() != null ? primaryDb.getTopic().getName() : null)
                .meaningVi(firstNonBlank(primaryDb != null ? primaryDb.getMeaningVi() : null, headword))
                .meaningEn(primaryDb != null ? primaryDb.getMeaningEn() : null)
                .examples(examples)
                .semanticNetwork(new SemanticNetwork())
                .source(partial ? SOURCE_LOCAL_INSTANT : "LOCAL_CATALOG_SEMANTIC")
                .partial(partial)
                .cached(false)
                .build();
    }

    protected String callOpenAiChat(String systemPrompt, String userPrompt) throws Exception {
        return callOpenAiChat(systemPrompt, userPrompt, 480);
    }

    protected String callOpenAiChat(String systemPrompt, String userPrompt, int maxTokens) throws Exception {
        String endpoint = isBlank(openAiBaseUrl)
                ? "https://api.openai.com/v1/chat/completions"
                : openAiBaseUrl.trim();
        Map<String, Object> payload = Map.of(
                "model", isBlank(openAiModel) ? "gpt-4o-mini" : openAiModel.trim(),
                "temperature", 0.2,
                "max_tokens", maxTokens,
                "response_format", Map.of("type", "json_object"),
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                )
        );
        return executeOpenAiRequest(openAiChatClient, endpoint, payload);
    }

    protected String callOpenAiVision(String imageDataUri) throws Exception {
        String endpoint = isBlank(openAiBaseUrl)
                ? "https://api.openai.com/v1/chat/completions"
                : openAiBaseUrl.trim();

        String instruction = """
                Identify the main physical object(s) in this image for a Vietnamese English/TOEIC learner.
                Return ONLY strict JSON matching:
                {
                  "primaryObject": {
                    "word": "concise English noun in singular form",
                    "ipa": "/IPA/",
                    "partOfSpeech": "noun",
                    "meaningVi": "natural Vietnamese meaning",
                    "meaningEn": "short English definition",
                    "exampleSentence": "practical natural sentence using the word",
                    "exampleTranslation": "Vietnamese translation of the example",
                    "category": "e.g. Office / Technology / Kitchen / Everyday",
                    "confidence": 0.95
                  },
                  "detectedObjects": [
                    {
                      "word": "other visible object (up to 5 items)",
                      "ipa": "/IPA/",
                      "partOfSpeech": "noun",
                      "meaningVi": "Vietnamese meaning",
                      "confidence": 0.88
                    }
                  ],
                  "sceneDescriptionEn": "one short English sentence describing the scene",
                  "sceneDescriptionVi": "one natural Vietnamese sentence describing the scene",
                  "relatedWords": [
                    {"word": "related word", "meaningVi": "Vietnamese meaning", "partOfSpeech": "noun/verb/adj"}
                  ]
                }
                """;

        Map<String, Object> payload = Map.of(
                "model", isBlank(openAiModel) ? "gpt-4o-mini" : openAiModel.trim(),
                "temperature", 0.15,
                "max_tokens", 700,
                "response_format", Map.of("type", "json_object"),
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", List.of(
                                Map.of("type", "text", "text", instruction),
                                Map.of("type", "image_url", "image_url", Map.of("url", imageDataUri))
                        )
                ))
        );
        return executeOpenAiRequest(visionHttpClient, endpoint, payload);
    }

    @SuppressWarnings("unchecked")
    private String executeOpenAiRequest(OkHttpClient client, String endpoint, Map<String, Object> payload) throws Exception {
        String bodyJson = objectMapper.writeValueAsString(payload);
        Request request = new Request.Builder()
                .url(endpoint)
                .header("Authorization", "Bearer " + openAiApiKey.trim())
                .header("Content-Type", "application/json")
                .post(RequestBody.create(bodyJson, JSON_MEDIA_TYPE))
                .build();

        try (Response response = client.newCall(request).execute()) {
            String resBody = response.body() != null ? response.body().string() : "";
            if (!response.isSuccessful()) {
                throw new IllegalStateException("OpenAI HTTP " + response.code() + ": " + resBody);
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

    protected ImageObjectRecognitionResponse parseAndEnrichRecognitionJson(String rawJson) throws Exception {
        JsonNode root = objectMapper.readTree(rawJson);
        JsonNode pNode = root.path("primaryObject");
        String primaryWord = textOrNull(pNode, "word");
        if (isBlank(primaryWord)) {
            throw new AppException(ErrorCode.IMAGE_RECOGNITION_FAILED);
        }

        ImageObjectRecognitionResponse.DetectedObjectItem primary = ImageObjectRecognitionResponse.DetectedObjectItem.builder()
                .word(primaryWord)
                .ipa(textOrNull(pNode, "ipa"))
                .partOfSpeech(firstNonBlank(textOrNull(pNode, "partOfSpeech"), "noun"))
                .meaningVi(firstNonBlank(textOrNull(pNode, "meaningVi"), primaryWord))
                .meaningEn(textOrNull(pNode, "meaningEn"))
                .exampleSentence(textOrNull(pNode, "exampleSentence"))
                .exampleTranslation(textOrNull(pNode, "exampleTranslation"))
                .category(textOrNull(pNode, "category"))
                .confidence(pNode.path("confidence").isNumber() ? pNode.path("confidence").asDouble() : 0.9)
                .build();

        List<ImageObjectRecognitionResponse.DetectedObjectItem> detected = new ArrayList<>();
        if (root.path("detectedObjects").isArray()) {
            for (JsonNode obj : root.path("detectedObjects")) {
                String w = textOrNull(obj, "word");
                if (isBlank(w) || w.equalsIgnoreCase(primaryWord)) continue;
                detected.add(ImageObjectRecognitionResponse.DetectedObjectItem.builder()
                        .word(w)
                        .ipa(textOrNull(obj, "ipa"))
                        .partOfSpeech(firstNonBlank(textOrNull(obj, "partOfSpeech"), "noun"))
                        .meaningVi(firstNonBlank(textOrNull(obj, "meaningVi"), w))
                        .confidence(obj.path("confidence").isNumber() ? obj.path("confidence").asDouble() : 0.82)
                        .build());
            }
        }

        List<SemanticNode> related = new ArrayList<>();
        if (root.path("relatedWords").isArray()) {
            for (JsonNode rel : root.path("relatedWords")) {
                String w = textOrNull(rel, "word");
                if (isBlank(w)) continue;
                related.add(SemanticNode.builder()
                        .word(w)
                        .meaningVi(textOrNull(rel, "meaningVi"))
                        .partOfSpeech(textOrNull(rel, "partOfSpeech"))
                        .relationType("RELATED")
                        .relationLabel("Liên quan")
                        .build());
            }
        }

        Set<String> batchWords = new LinkedHashSet<>();
        batchWords.add(primary.getWord().toLowerCase(Locale.ROOT));
        detected.forEach(d -> batchWords.add(d.getWord().toLowerCase(Locale.ROOT)));
        related.forEach(r -> batchWords.add(r.getWord().toLowerCase(Locale.ROOT)));

        Map<String, Vocabulary> catalogMap = loadCatalogMap(batchWords);
        applyCatalogInfo(primary, catalogMap);
        detected.forEach(d -> applyCatalogInfo(d, catalogMap));
        related.forEach(r -> applyCatalogInfo(r, catalogMap));

        return ImageObjectRecognitionResponse.builder()
                .primaryObject(primary)
                .detectedObjects(detected)
                .sceneDescriptionEn(textOrNull(root, "sceneDescriptionEn"))
                .sceneDescriptionVi(textOrNull(root, "sceneDescriptionVi"))
                .relatedWords(related)
                .source("OPENAI_VISION")
                .build();
    }

    private SemanticDictionaryResponse tryEnrichViaOpenAi(String query, Vocabulary primaryDb) {
        try {
            String systemPrompt = """
                    English-Vietnamese TOEIC/CEFR dictionary engine. Resolve Vietnamese queries to English headwords.
                    Return strict JSON:
                    {"word":"","ipa":"","partOfSpeech":"","cefrLevel":"","meaningVi":"","meaningEn":"","usageNote":"short Vietnamese TOEIC tip",
                    "examples":[{"english":"","vietnamese":""}],
                    "synonyms":[{"word":"","meaningVi":"","partOfSpeech":""}],
                    "antonyms":[{"word":"","meaningVi":"","partOfSpeech":""}],
                    "wordFamily":[{"word":"","meaningVi":"","partOfSpeech":""}],
                    "relatedWords":[{"word":"","meaningVi":"","partOfSpeech":""}],
                    "collocations":[{"phrase":"","meaningVi":""}]}
                    Max: 2 examples, 4 synonyms, 3 antonyms, 4 wordFamily, 4 relatedWords, 3 collocations. Keep concise.
                    """;
            String userPrompt = primaryDb != null
                    ? String.format("Word: \"%s\" (pos=%s, cefr=%s, meaningVi=%s)",
                    query, primaryDb.getPartOfSpeech(), primaryDb.getDifficultyLevel(), primaryDb.getMeaningVi())
                    : String.format("Query: \"%s\"", query);

            String rawJson = callOpenAiChat(systemPrompt, userPrompt);
            JsonNode root = objectMapper.readTree(rawJson);

            String headword = firstNonBlank(textOrNull(root, "word"), primaryDb != null ? primaryDb.getWord() : query);
            List<ExampleEntry> examples = new ArrayList<>();
            if (root.path("examples").isArray()) {
                for (JsonNode ex : root.path("examples")) {
                    String en = textOrNull(ex, "english");
                    String vi = textOrNull(ex, "vietnamese");
                    if (!isBlank(en)) {
                        examples.add(ExampleEntry.builder().english(en).vietnamese(vi).build());
                    }
                }
            }
            if (examples.isEmpty() && primaryDb != null && !isBlank(primaryDb.getExampleSentence())) {
                examples.add(ExampleEntry.builder()
                        .english(primaryDb.getExampleSentence())
                        .vietnamese(primaryDb.getExampleTranslation())
                        .build());
            }

            List<CollocationEntry> collocations = new ArrayList<>();
            if (root.path("collocations").isArray()) {
                for (JsonNode col : root.path("collocations")) {
                    String phrase = textOrNull(col, "phrase");
                    if (!isBlank(phrase)) {
                        collocations.add(CollocationEntry.builder()
                                .phrase(phrase)
                                .meaningVi(textOrNull(col, "meaningVi"))
                                .build());
                    }
                }
            }

            SemanticNetwork network = SemanticNetwork.builder()
                    .synonyms(parseNodeList(root.path("synonyms"), "SYNONYM", "Đồng nghĩa", headword))
                    .antonyms(parseNodeList(root.path("antonyms"), "ANTONYM", "Trái nghĩa", headword))
                    .wordFamily(parseNodeList(root.path("wordFamily"), "WORD_FAMILY", "Họ từ", headword))
                    .relatedWords(parseNodeList(root.path("relatedWords"), "RELATED", "Trường nghĩa", headword))
                    .collocations(collocations)
                    .build();

            return SemanticDictionaryResponse.builder()
                    .vocabularyId(primaryDb != null ? primaryDb.getId() : null)
                    .word(headword)
                    .normalizedWord(headword.toLowerCase(Locale.ROOT))
                    .ipa(firstNonBlank(primaryDb != null ? primaryDb.getIpa() : null, textOrNull(root, "ipa")))
                    .partOfSpeech(firstNonBlank(textOrNull(root, "partOfSpeech"), primaryDb != null ? primaryDb.getPartOfSpeech() : null))
                    .cefrLevel(firstNonBlank(primaryDb != null ? primaryDb.getDifficultyLevel() : null, textOrNull(root, "cefrLevel")))
                    .topicName(primaryDb != null && primaryDb.getTopic() != null ? primaryDb.getTopic().getName() : null)
                    .meaningVi(firstNonBlank(textOrNull(root, "meaningVi"), primaryDb != null ? primaryDb.getMeaningVi() : headword))
                    .meaningEn(firstNonBlank(primaryDb != null ? primaryDb.getMeaningEn() : null, textOrNull(root, "meaningEn")))
                    .usageNote(textOrNull(root, "usageNote"))
                    .examples(examples)
                    .semanticNetwork(network)
                    .source(primaryDb != null ? "CATALOG_OPENAI_SEMANTIC" : "OPENAI_SEMANTIC")
                    .partial(false)
                    .cached(false)
                    .build();
        } catch (Exception ex) {
            logger.debug("OpenAI semantic lookup fallback for '{}': {}", query, ex.getMessage());
            return null;
        }
    }

    private SemanticDictionaryResponse buildFallbackSemanticResponse(String query, Vocabulary primaryDb) {
        String headword = primaryDb != null ? primaryDb.getWord() : query;
        String lower = headword.toLowerCase(Locale.ROOT);
        String initialIpa = primaryDb != null ? primaryDb.getIpa() : null;
        String initialPos = primaryDb != null ? primaryDb.getPartOfSpeech() : null;
        String initialMeaningEn = primaryDb != null ? primaryDb.getMeaningEn() : null;
        String meaningVi = primaryDb != null ? primaryDb.getMeaningVi() : null;
        boolean needExample = primaryDb == null || isBlank(primaryDb.getExampleSentence());

        // Fetch public dictionary + Datamuse semantic relations in parallel with tight timeout
        CompletableFuture<DictApiPatch> dictFuture = CompletableFuture.supplyAsync(
                () -> fetchDictionaryApiEntry(lower, needExample), lookupExecutor
        ).exceptionally(ex -> DictApiPatch.EMPTY);
        CompletableFuture<List<String>> synFuture = CompletableFuture.supplyAsync(
                () -> fetchDatamuseWords("rel_syn", lower, 6), lookupExecutor
        ).exceptionally(ex -> List.of());
        CompletableFuture<List<String>> antFuture = CompletableFuture.supplyAsync(
                () -> fetchDatamuseWords("rel_ant", lower, 5), lookupExecutor
        ).exceptionally(ex -> List.of());
        CompletableFuture<List<String>> trgFuture = CompletableFuture.supplyAsync(
                () -> fetchDatamuseWords("rel_trg", lower, 6), lookupExecutor
        ).exceptionally(ex -> List.of());

        try {
            CompletableFuture.allOf(dictFuture, synFuture, antFuture, trgFuture)
                    .orTimeout(3800, TimeUnit.MILLISECONDS)
                    .join();
        } catch (Exception ignored) {
            // Partial results gathered below via getNow
        }

        DictApiPatch patch = dictFuture.getNow(DictApiPatch.EMPTY);
        List<String> dictSyns = new ArrayList<>(patch.synonyms());
        List<String> dictAnts = new ArrayList<>(patch.antonyms());
        dictSyns.addAll(synFuture.getNow(List.of()));
        dictAnts.addAll(antFuture.getNow(List.of()));
        List<String> dmRel = trgFuture.getNow(List.of());

        List<ExampleEntry> examples = new ArrayList<>();
        if (primaryDb != null && !isBlank(primaryDb.getExampleSentence())) {
            examples.add(ExampleEntry.builder()
                    .english(primaryDb.getExampleSentence())
                    .vietnamese(primaryDb.getExampleTranslation())
                    .build());
        }
        for (String extraEx : patch.examples()) {
            if (examples.size() >= 2) break;
            examples.add(ExampleEntry.builder().english(extraEx).build());
        }

        SemanticNetwork network = SemanticNetwork.builder()
                .synonyms(toSemanticNodes(dictSyns, "SYNONYM", "Đồng nghĩa", lower, 6))
                .antonyms(toSemanticNodes(dictAnts, "ANTONYM", "Trái nghĩa", lower, 5))
                .relatedWords(toSemanticNodes(dmRel, "RELATED", "Trường nghĩa", lower, 6))
                .build();

        return SemanticDictionaryResponse.builder()
                .vocabularyId(primaryDb != null ? primaryDb.getId() : null)
                .word(headword)
                .normalizedWord(lower)
                .ipa(firstNonBlank(firstNonBlank(initialIpa, patch.ipa()), "/" + lower + "/"))
                .partOfSpeech(firstNonBlank(firstNonBlank(initialPos, patch.pos()), "noun"))
                .cefrLevel(primaryDb != null ? primaryDb.getDifficultyLevel() : null)
                .topicName(primaryDb != null && primaryDb.getTopic() != null ? primaryDb.getTopic().getName() : null)
                .meaningVi(firstNonBlank(meaningVi, headword))
                .meaningEn(firstNonBlank(initialMeaningEn, patch.meaningEn()))
                .examples(examples)
                .semanticNetwork(network)
                .source(primaryDb != null ? "LOCAL_CATALOG_SEMANTIC" : "DATAMUSE_DICTIONARY")
                .partial(false)
                .cached(false)
                .build();
    }

    private record DictApiPatch(
            String ipa,
            String pos,
            String meaningEn,
            List<String> examples,
            List<String> synonyms,
            List<String> antonyms
    ) {
        static final DictApiPatch EMPTY = new DictApiPatch(null, null, null, List.of(), List.of(), List.of());
    }

    private DictApiPatch fetchDictionaryApiEntry(String lower, boolean collectExamples) {
        String ipa = null;
        String pos = null;
        String meaningEn = null;
        List<String> examples = new ArrayList<>();
        List<String> syns = new ArrayList<>();
        List<String> ants = new ArrayList<>();

        try {
            String encoded = URLEncoder.encode(lower, StandardCharsets.UTF_8);
            Request req = new Request.Builder()
                    .url("https://api.dictionaryapi.dev/api/v2/entries/en/" + encoded)
                    .header("User-Agent", "Mozilla/5.0")
                    .get()
                    .build();
            try (Response res = fastPublicHttpClient.newCall(req).execute()) {
                if (res.isSuccessful() && res.body() != null) {
                    JsonNode arr = objectMapper.readTree(res.body().string());
                    if (arr.isArray() && !arr.isEmpty()) {
                        JsonNode entry = arr.get(0);
                        ipa = textOrNull(entry, "phonetic");
                        for (JsonNode m : entry.path("meanings")) {
                            if (isBlank(pos)) pos = textOrNull(m, "partOfSpeech");
                            addStringArray(m.path("synonyms"), syns, 6);
                            addStringArray(m.path("antonyms"), ants, 5);
                            for (JsonNode d : m.path("definitions")) {
                                if (isBlank(meaningEn)) meaningEn = textOrNull(d, "definition");
                                if (collectExamples && examples.size() < 2) {
                                    String ex = textOrNull(d, "example");
                                    if (!isBlank(ex)) {
                                        examples.add(ex);
                                    }
                                }
                                addStringArray(d.path("synonyms"), syns, 6);
                                addStringArray(d.path("antonyms"), ants, 5);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            return DictApiPatch.EMPTY;
        }
        return new DictApiPatch(ipa, pos, meaningEn, examples, syns, ants);
    }

    private void mergeLocalSemanticNeighbors(SemanticDictionaryResponse response, Vocabulary primaryDb) {
        if (response == null || isBlank(response.getNormalizedWord())) return;
        String exact = response.getNormalizedWord();
        SemanticNetwork net = response.getSemanticNetwork();
        if (net == null) {
            net = new SemanticNetwork();
            response.setSemanticNetwork(net);
        }

        String stem = deriveStem(exact);
        if (stem.length() >= 4) {
            List<Vocabulary> familyHits = vocabularyRepository.findWordFamilyCandidates(
                    stem, exact, PageRequest.of(0, 8)
            );
            Set<String> seen = collectWords(net.getWordFamily());
            for (Vocabulary v : familyHits) {
                String w = v.getWord().trim().toLowerCase(Locale.ROOT);
                if (seen.contains(w) || w.equals(exact)) continue;
                seen.add(w);
                net.getWordFamily().add(SemanticNode.builder()
                        .vocabularyId(v.getId())
                        .word(v.getWord())
                        .ipa(v.getIpa())
                        .partOfSpeech(v.getPartOfSpeech())
                        .meaningVi(v.getMeaningVi())
                        .cefrLevel(v.getDifficultyLevel())
                        .relationType("WORD_FAMILY")
                        .relationLabel("Họ từ")
                        .build());
                if (net.getWordFamily().size() >= 6) break;
            }
        }

        if (primaryDb != null && primaryDb.getTopic() != null && primaryDb.getTopic().getId() != null) {
            List<Vocabulary> neighbors = vocabularyRepository.findSameTopicNeighbors(
                    primaryDb.getTopic().getId(), primaryDb.getId(), PageRequest.of(0, 6)
            );
            Set<String> seenRel = collectWords(net.getRelatedWords());
            for (Vocabulary v : neighbors) {
                String w = v.getWord().trim().toLowerCase(Locale.ROOT);
                if (seenRel.contains(w) || w.equals(exact)) continue;
                seenRel.add(w);
                net.getRelatedWords().add(SemanticNode.builder()
                        .vocabularyId(v.getId())
                        .word(v.getWord())
                        .ipa(v.getIpa())
                        .partOfSpeech(v.getPartOfSpeech())
                        .meaningVi(v.getMeaningVi())
                        .cefrLevel(v.getDifficultyLevel())
                        .relationType("TOPIC_NEIGHBOR")
                        .relationLabel("Cùng chủ đề")
                        .build());
                if (net.getRelatedWords().size() >= 8) break;
            }
        }
    }

    private void enrichNetworkNodesFromCatalog(SemanticDictionaryResponse response) {
        SemanticNetwork net = response.getSemanticNetwork();
        if (net == null) return;
        Set<String> words = new LinkedHashSet<>();
        addNodeWords(net.getSynonyms(), words);
        addNodeWords(net.getAntonyms(), words);
        addNodeWords(net.getWordFamily(), words);
        addNodeWords(net.getRelatedWords(), words);
        if (words.isEmpty()) return;

        Map<String, Vocabulary> catalogMap = loadCatalogMap(words);
        net.getSynonyms().forEach(n -> applyCatalogInfo(n, catalogMap));
        net.getAntonyms().forEach(n -> applyCatalogInfo(n, catalogMap));
        net.getWordFamily().forEach(n -> applyCatalogInfo(n, catalogMap));
        net.getRelatedWords().forEach(n -> applyCatalogInfo(n, catalogMap));
    }

    private Map<String, Vocabulary> loadCatalogMap(Set<String> lowerWords) {
        if (lowerWords.isEmpty()) return Map.of();
        Map<String, Vocabulary> map = new HashMap<>();
        for (Vocabulary v : vocabularyRepository.findByWordInIgnoreCase(lowerWords)) {
            if (v.getWord() != null) {
                map.putIfAbsent(v.getWord().trim().toLowerCase(Locale.ROOT), v);
            }
        }
        return map;
    }

    private void applyCatalogInfo(SemanticNode node, Map<String, Vocabulary> catalogMap) {
        if (node == null || isBlank(node.getWord())) return;
        Vocabulary v = catalogMap.get(node.getWord().trim().toLowerCase(Locale.ROOT));
        if (v == null) return;
        node.setVocabularyId(v.getId());
        if (isBlank(node.getIpa())) node.setIpa(v.getIpa());
        if (isBlank(node.getPartOfSpeech())) node.setPartOfSpeech(v.getPartOfSpeech());
        if (isBlank(node.getMeaningVi())) node.setMeaningVi(v.getMeaningVi());
        if (isBlank(node.getCefrLevel())) node.setCefrLevel(v.getDifficultyLevel());
    }

    private void applyCatalogInfo(ImageObjectRecognitionResponse.DetectedObjectItem item, Map<String, Vocabulary> catalogMap) {
        if (item == null || isBlank(item.getWord())) return;
        Vocabulary v = catalogMap.get(item.getWord().trim().toLowerCase(Locale.ROOT));
        if (v == null) return;
        item.setVocabularyId(v.getId());
        if (isBlank(item.getIpa())) item.setIpa(v.getIpa());
        if (isBlank(item.getCefrLevel())) item.setCefrLevel(v.getDifficultyLevel());
        if (isBlank(item.getMeaningVi())) item.setMeaningVi(v.getMeaningVi());
    }

    private String prepareVisionDataUri(byte[] rawBytes, String contentType) {
        try {
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(rawBytes));
            if (img != null) {
                int w = img.getWidth();
                int h = img.getHeight();
                double scale = Math.min(1.0, (double) MAX_VISION_DIMENSION / Math.max(w, h));
                int targetW = Math.max(1, (int) Math.round(w * scale));
                int targetH = Math.max(1, (int) Math.round(h * scale));

                BufferedImage rgbImg = new BufferedImage(targetW, targetH, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = rgbImg.createGraphics();
                g.setColor(Color.WHITE);
                g.fillRect(0, 0, targetW, targetH);
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.drawImage(img, 0, 0, targetW, targetH, null);
                g.dispose();

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                ImageIO.write(rgbImg, "jpg", baos);
                String b64 = Base64.getEncoder().encodeToString(baos.toByteArray());
                return "data:image/jpeg;base64," + b64;
            }
        } catch (Exception ignored) {}

        String safeMime = contentType.startsWith("image/") ? contentType : "image/jpeg";
        return "data:" + safeMime + ";base64," + Base64.getEncoder().encodeToString(rawBytes);
    }

    private List<String> fetchDatamuseWords(String relParam, String word, int max) {
        List<String> out = new ArrayList<>();
        try {
            String url = "https://api.datamuse.com/words?" + relParam + "="
                    + URLEncoder.encode(word, StandardCharsets.UTF_8) + "&max=" + max;
            Request req = new Request.Builder().url(url).get().build();
            try (Response res = fastPublicHttpClient.newCall(req).execute()) {
                if (res.isSuccessful() && res.body() != null) {
                    JsonNode arr = objectMapper.readTree(res.body().string());
                    if (arr.isArray()) {
                        for (JsonNode n : arr) {
                            String w = textOrNull(n, "word");
                            if (!isBlank(w) && !w.equalsIgnoreCase(word)) {
                                out.add(w);
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
        return out;
    }

    private List<SemanticNode> parseNodeList(JsonNode arrayNode, String relationType, String relationLabel, String headword) {
        List<SemanticNode> list = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (!arrayNode.isArray()) return list;
        for (JsonNode item : arrayNode) {
            String w = textOrNull(item, "word");
            if (isBlank(w)) continue;
            String low = w.toLowerCase(Locale.ROOT);
            if (low.equalsIgnoreCase(headword) || seen.contains(low)) continue;
            seen.add(low);
            list.add(SemanticNode.builder()
                    .word(w)
                    .partOfSpeech(textOrNull(item, "partOfSpeech"))
                    .meaningVi(textOrNull(item, "meaningVi"))
                    .relationType(relationType)
                    .relationLabel(relationLabel)
                    .build());
        }
        return list;
    }

    private List<SemanticNode> toSemanticNodes(List<String> words, String relType, String relLabel, String headword, int max) {
        List<SemanticNode> list = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String w : words) {
            if (isBlank(w)) continue;
            String low = w.trim().toLowerCase(Locale.ROOT);
            if (low.equals(headword) || seen.contains(low)) continue;
            seen.add(low);
            list.add(SemanticNode.builder()
                    .word(w.trim())
                    .relationType(relType)
                    .relationLabel(relLabel)
                    .build());
            if (list.size() >= max) break;
        }
        return list;
    }

    private void addStringArray(JsonNode arr, List<String> dest, int limit) {
        if (!arr.isArray()) return;
        for (JsonNode n : arr) {
            if (dest.size() >= limit) break;
            if (n.isTextual() && !n.asText().isBlank()) {
                dest.add(n.asText().trim());
            }
        }
    }

    private Set<String> collectWords(List<SemanticNode> nodes) {
        Set<String> set = new HashSet<>();
        if (nodes == null) return set;
        for (SemanticNode n : nodes) {
            if (!isBlank(n.getWord())) set.add(n.getWord().trim().toLowerCase(Locale.ROOT));
        }
        return set;
    }

    private void addNodeWords(List<SemanticNode> nodes, Set<String> out) {
        if (nodes == null) return;
        for (SemanticNode n : nodes) {
            if (!isBlank(n.getWord())) out.add(n.getWord().trim().toLowerCase(Locale.ROOT));
        }
    }

    private String deriveStem(String lower) {
        if (lower.length() <= 4) return lower;
        for (String suffix : List.of("ations", "ation", "ments", "ment", "ness", "able", "ible", "ings", "ing", "ized", "ize", "ise", "ers", "er", "ies", "ed", "ly", "es", "s")) {
            if (lower.endsWith(suffix) && lower.length() - suffix.length() >= 4) {
                return lower.substring(0, lower.length() - suffix.length());
            }
        }
        return lower.length() >= 6 ? lower.substring(0, lower.length() - 1) : lower;
    }

    private boolean containsNonAsciiOrMultipleWords(String s) {
        if (s.contains(" ")) return true;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) > 127) return true;
        }
        return false;
    }

    private String textOrNull(JsonNode node, String field) {
        JsonNode val = node.path(field);
        if (val.isMissingNode() || val.isNull()) return null;
        String s = val.asText().trim();
        return s.isEmpty() ? null : s;
    }

    private String firstNonBlank(String a, String b) {
        if (!isBlank(a)) return a.trim();
        if (!isBlank(b)) return b.trim();
        return null;
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() <= maxLen ? s : s.substring(0, maxLen);
    }

    private boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    /**
     * Generates Vietnamese meaning, IPA pronunciation, and a TOEIC-ready example sentence
     * for a single English word or short phrase using local catalog, cache, OpenAI, or dictionary fallback.
     */
    public FlashcardAiSuggestResponse suggestFlashcard(String rawWord) {
        String cleanWord = rawWord == null ? "" : rawWord.trim();
        if (cleanWord.isEmpty() || cleanWord.length() > 120) {
            throw new AppException(ErrorCode.INVALID_DICTIONARY_QUERY);
        }

        String lower = cleanWord.toLowerCase(Locale.ROOT);
        List<Vocabulary> dbMatches = vocabularyRepository.findByWordIgnoreCaseOrderByIdAsc(lower);
        Vocabulary primaryDb = dbMatches.isEmpty() ? null : dbMatches.get(0);
        if (primaryDb != null
                && !isBlank(primaryDb.getMeaningVi())
                && !isBlank(primaryDb.getIpa())
                && !isBlank(primaryDb.getExampleSentence())) {
            return FlashcardAiSuggestResponse.builder()
                    .englishWord(primaryDb.getWord())
                    .meaningVi(primaryDb.getMeaningVi().trim())
                    .pronunciation(primaryDb.getIpa().trim())
                    .exampleSentence(primaryDb.getExampleSentence().trim())
                    .source("LOCAL_CATALOG")
                    .build();
        }

        String meaningVi = primaryDb != null ? trimOrNull(primaryDb.getMeaningVi()) : null;
        String pronunciation = primaryDb != null ? trimOrNull(primaryDb.getIpa()) : null;
        String exampleSentence = primaryDb != null ? trimOrNull(primaryDb.getExampleSentence()) : null;
        String source = "LOCAL_FALLBACK";

        if (cleanWord.length() <= 80) {
            try {
                SemanticDictionaryResponse semantic = lookupSemanticDictionary(cleanWord, null, false);
                if (semantic != null) {
                    if (!isBlank(semantic.getMeaningVi()) && !semantic.getMeaningVi().trim().equalsIgnoreCase(cleanWord)) {
                        meaningVi = firstNonBlank(meaningVi, semantic.getMeaningVi());
                    }
                    pronunciation = firstNonBlank(pronunciation, semantic.getIpa());
                    if (isBlank(exampleSentence) && semantic.getExamples() != null && !semantic.getExamples().isEmpty()) {
                        exampleSentence = trimOrNull(semantic.getExamples().get(0).getEnglish());
                    }
                    source = firstNonBlank(semantic.getSource(), source);
                }
            } catch (Exception ex) {
                logger.debug("Semantic lookup fallback for flashcard '{}': {}", cleanWord, ex.getMessage());
            }
        }

        if (!isBlank(openAiApiKey) && (isBlank(meaningVi) || isBlank(pronunciation) || isBlank(exampleSentence))) {
            try {
                String systemPrompt = """
                        TOEIC English-Vietnamese flashcard assistant.
                        Return ONLY strict JSON:
                        {"meaningVi":"natural concise Vietnamese meaning","pronunciation":"/IPA/","exampleSentence":"one practical TOEIC-style English sentence using the word"}
                        """;
                String userPrompt = "English word or phrase: \"" + cleanWord + "\"";
                JsonNode root = objectMapper.readTree(callOpenAiChat(systemPrompt, userPrompt, 260));
                meaningVi = firstNonBlank(meaningVi, textOrNull(root, "meaningVi"));
                pronunciation = firstNonBlank(pronunciation, textOrNull(root, "pronunciation"));
                exampleSentence = firstNonBlank(exampleSentence, textOrNull(root, "exampleSentence"));
                source = "OPENAI_FLASHCARD";
            } catch (Exception ex) {
                logger.debug("Targeted OpenAI flashcard suggest failed for '{}': {}", cleanWord, ex.getMessage());
            }
        }

        return FlashcardAiSuggestResponse.builder()
                .englishWord(cleanWord)
                .meaningVi(firstNonBlank(meaningVi, cleanWord))
                .pronunciation(firstNonBlank(pronunciation, "/" + lower + "/"))
                .exampleSentence(exampleSentence)
                .source(source)
                .build();
    }

    /**
     * Batch-enriches missing meaningVi, pronunciation, and exampleSentence for imported flashcards.
     */
    public Map<String, FlashcardAiSuggestResponse> batchSuggestFlashcards(List<String> englishWords) {
        if (englishWords == null || englishWords.isEmpty()) {
            return Map.of();
        }

        Map<String, String> canonicalByLower = new LinkedHashMap<>();
        for (String w : englishWords) {
            if (!isBlank(w)) {
                String trimmed = w.trim();
                canonicalByLower.putIfAbsent(trimmed.toLowerCase(Locale.ROOT), trimmed);
            }
        }
        if (canonicalByLower.isEmpty()) {
            return Map.of();
        }

        Map<String, FlashcardAiSuggestResponse> resolved = new LinkedHashMap<>();
        Map<String, Vocabulary> catalogMap = loadCatalogMap(canonicalByLower.keySet());

        List<String> missingForAi = new ArrayList<>();
        for (Map.Entry<String, String> entry : canonicalByLower.entrySet()) {
            String lower = entry.getKey();
            String word = entry.getValue();
            Vocabulary v = catalogMap.get(lower);

            String meaning = v != null ? trimOrNull(v.getMeaningVi()) : null;
            String ipa = v != null ? trimOrNull(v.getIpa()) : null;
            String example = v != null ? trimOrNull(v.getExampleSentence()) : null;
            String source = v != null ? "LOCAL_CATALOG" : null;

            SemanticDictionaryResponse cached = findCachedResponse(lower, true);
            if (cached != null) {
                if (!isBlank(cached.getMeaningVi()) && !cached.getMeaningVi().trim().equalsIgnoreCase(word)) {
                    meaning = firstNonBlank(meaning, cached.getMeaningVi());
                }
                ipa = firstNonBlank(ipa, cached.getIpa());
                if (isBlank(example) && cached.getExamples() != null && !cached.getExamples().isEmpty()) {
                    example = trimOrNull(cached.getExamples().get(0).getEnglish());
                }
                source = firstNonBlank(source, cached.getSource());
            }

            if (!isBlank(meaning) && !isBlank(ipa) && !isBlank(example)) {
                resolved.put(lower, FlashcardAiSuggestResponse.builder()
                        .englishWord(word)
                        .meaningVi(meaning)
                        .pronunciation(ipa)
                        .exampleSentence(example)
                        .source(source)
                        .build());
            } else {
                if (v != null || cached != null) {
                    resolved.put(lower, FlashcardAiSuggestResponse.builder()
                            .englishWord(word)
                            .meaningVi(meaning)
                            .pronunciation(ipa)
                            .exampleSentence(example)
                            .source(firstNonBlank(source, "PARTIAL"))
                            .build());
                }
                missingForAi.add(word);
            }
        }

        if (!missingForAi.isEmpty() && !isBlank(openAiApiKey)) {
            int chunkSize = 20;
            for (int i = 0; i < missingForAi.size(); i += chunkSize) {
                List<String> chunk = missingForAi.subList(i, Math.min(i + chunkSize, missingForAi.size()));
                enrichChunkViaOpenAi(chunk, resolved);
            }
        }

        for (Map.Entry<String, String> entry : canonicalByLower.entrySet()) {
            FlashcardAiSuggestResponse item = resolved.get(entry.getKey());
            if (item == null || isBlank(item.getMeaningVi()) || isBlank(item.getExampleSentence())) {
                try {
                    FlashcardAiSuggestResponse fallback = suggestFlashcard(entry.getValue());
                    if (item == null) {
                        resolved.put(entry.getKey(), fallback);
                    } else {
                        item.setMeaningVi(firstNonBlank(item.getMeaningVi(), fallback.getMeaningVi()));
                        item.setPronunciation(firstNonBlank(item.getPronunciation(), fallback.getPronunciation()));
                        item.setExampleSentence(firstNonBlank(item.getExampleSentence(), fallback.getExampleSentence()));
                    }
                } catch (Exception ex) {
                    logger.debug("Fallback batch suggest skipped for '{}': {}", entry.getValue(), ex.getMessage());
                }
            }
        }

        return resolved;
    }

    private void enrichChunkViaOpenAi(List<String> words, Map<String, FlashcardAiSuggestResponse> resolved) {
        try {
            String systemPrompt = """
                    TOEIC English-Vietnamese vocabulary flashcard generator.
                    For every word/phrase given, return ONLY strict JSON:
                    {"items":[{"englishWord":"exact input word","meaningVi":"concise Vietnamese meaning","pronunciation":"/IPA/","exampleSentence":"short natural TOEIC example sentence"}]}
                    """;
            String userPrompt = "Generate flashcard fields for these English entries JSON array: "
                    + objectMapper.writeValueAsString(words);
            JsonNode root = objectMapper.readTree(callOpenAiChat(systemPrompt, userPrompt, 1800));
            JsonNode items = root.path("items");
            if (!items.isArray()) {
                return;
            }
            for (JsonNode node : items) {
                String rawWord = textOrNull(node, "englishWord");
                if (isBlank(rawWord)) continue;
                String lower = rawWord.toLowerCase(Locale.ROOT);
                FlashcardAiSuggestResponse existing = resolved.get(lower);
                String meaning = firstNonBlank(existing != null ? existing.getMeaningVi() : null, textOrNull(node, "meaningVi"));
                String ipa = firstNonBlank(existing != null ? existing.getPronunciation() : null, textOrNull(node, "pronunciation"));
                String example = firstNonBlank(existing != null ? existing.getExampleSentence() : null, textOrNull(node, "exampleSentence"));
                resolved.put(lower, FlashcardAiSuggestResponse.builder()
                        .englishWord(existing != null ? existing.getEnglishWord() : rawWord)
                        .meaningVi(meaning)
                        .pronunciation(ipa)
                        .exampleSentence(example)
                        .source("OPENAI_BATCH")
                        .build());
            }
        } catch (Exception ex) {
            logger.debug("Batch OpenAI flashcard enrichment failed: {}", ex.getMessage());
        }
    }

    private String trimOrNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
