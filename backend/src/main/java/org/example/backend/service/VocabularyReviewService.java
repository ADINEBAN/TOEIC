package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.VocabularyStudyItemResponse;
import org.example.backend.dto.response.VocabularyTopicSummaryResponse;
import org.example.backend.entity.User;
import org.example.backend.entity.UserVocabularyProgress;
import org.example.backend.entity.Vocabulary;
import org.example.backend.entity.VocabularyTopic;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.VocabularyStatus;
import org.example.backend.exception.AppException;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserVocabularyProgressRepository;
import org.example.backend.repository.VocabularyRepository;
import org.example.backend.repository.VocabularyTopicRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class VocabularyReviewService {

    private static final int DEFAULT_UNFILTERED_LIMIT = 200;
    private static final int MAX_QUERY_LIMIT = 500;

    private final VocabularyTopicRepository vocabularyTopicRepository;
    private final VocabularyRepository vocabularyRepository;
    private final UserVocabularyProgressRepository userVocabularyProgressRepository;
    private final UserRepository userRepository;

    @Autowired(required = false)
    private DiamondRewardService diamondRewardService;

    @Transactional
    public List<VocabularyTopicSummaryResponse> getActiveTopics() {
        return getActiveTopics(null);
    }

    @Transactional
    public List<VocabularyTopicSummaryResponse> getActiveTopics(String email) {
        ensureStarterVocabularySeeded();
        Map<Long, Long> countsByTopic = new HashMap<>();
        for (Object[] row : vocabularyRepository.countGroupedByTopicId()) {
            if (row != null && row.length >= 2 && row[0] instanceof Long id && row[1] instanceof Number count) {
                countsByTopic.put(id, count.longValue());
            }
        }
        Map<Long, Long> studiedByTopic = new HashMap<>();
        Map<Long, Long> masteredByTopic = new HashMap<>();
        if (email != null && !email.isBlank()) {
            for (Object[] row : userVocabularyProgressRepository.summarizeTopicProgressByUserEmail(
                    email.trim(), VocabularyStatus.MASTERED)) {
                if (row != null && row.length >= 3 && row[0] instanceof Long topicId) {
                    studiedByTopic.put(topicId, row[1] instanceof Number s ? s.longValue() : 0L);
                    masteredByTopic.put(topicId, row[2] instanceof Number m ? m.longValue() : 0L);
                }
            }
        }
        return vocabularyTopicRepository.findByActiveTrueOrderByIdAsc().stream()
                .map(t -> new VocabularyTopicSummaryResponse(
                        t.getId(),
                        t.getName(),
                        t.getDescription(),
                        t.getLevel(),
                        countsByTopic.isEmpty()
                                ? vocabularyRepository.countByTopicId(t.getId())
                                : countsByTopic.getOrDefault(t.getId(), 0L),
                        studiedByTopic.getOrDefault(t.getId(), 0L),
                        masteredByTopic.getOrDefault(t.getId(), 0L)
                ))
                .collect(Collectors.toList());
    }

    @Transactional
    public List<VocabularyStudyItemResponse> getDueToday(String email, Long topicId) {
        return getDueToday(email, topicId, null, null, null);
    }

    @Transactional
    public List<VocabularyStudyItemResponse> getDueToday(
            String email,
            Long topicId,
            String level,
            String query,
            Integer limit
    ) {
        ensureStarterVocabularySeeded();
        User user = findUser(email);
        LocalDateTime now = LocalDateTime.now();

        Map<Long, UserVocabularyProgress> progressMap = userVocabularyProgressRepository.findByUserId(user.getId())
                .stream()
                .collect(Collectors.toMap(p -> p.getVocabulary().getId(), p -> p, (a, b) -> a));

        List<Vocabulary> candidates = fetchCandidates(topicId, level, query, limit);

        return candidates.stream()
                .filter(v -> {
                    UserVocabularyProgress p = progressMap.get(v.getId());
                    return p == null || p.getNextReviewAt() == null || !p.getNextReviewAt().isAfter(now);
                })
                .map(v -> toStudyItem(v, progressMap.get(v.getId())))
                .collect(Collectors.toList());
    }

    @Transactional
    public List<VocabularyStudyItemResponse> getAllWords(String email, Long topicId) {
        return getAllWords(email, topicId, null, null, null);
    }

    @Transactional
    public List<VocabularyStudyItemResponse> getAllWords(
            String email,
            Long topicId,
            String level,
            String query,
            Integer limit
    ) {
        ensureStarterVocabularySeeded();
        User user = findUser(email);
        Map<Long, UserVocabularyProgress> progressMap = userVocabularyProgressRepository.findByUserId(user.getId())
                .stream()
                .collect(Collectors.toMap(p -> p.getVocabulary().getId(), p -> p, (a, b) -> a));

        List<Vocabulary> candidates = fetchCandidates(topicId, level, query, limit);

        return candidates.stream()
                .map(v -> toStudyItem(v, progressMap.get(v.getId())))
                .collect(Collectors.toList());
    }

    private List<Vocabulary> fetchCandidates(Long topicId, String level, String query, Integer limit) {
        String normalizedLevel = trimToNull(level);
        String normalizedQuery = trimToNull(query);
        boolean hasFilter = normalizedLevel != null || normalizedQuery != null || limit != null;

        if (!hasFilter) {
            if (topicId != null) {
                return vocabularyRepository.findByTopicIdOrderByIdAsc(topicId);
            }
            return vocabularyRepository.searchActiveVocabularies(
                    null, null, null, PageRequest.of(0, DEFAULT_UNFILTERED_LIMIT)
            );
        }

        int effectiveLimit = limit != null && limit > 0
                ? Math.min(limit, MAX_QUERY_LIMIT)
                : (topicId != null ? MAX_QUERY_LIMIT : DEFAULT_UNFILTERED_LIMIT);
        Pageable pageable = PageRequest.of(0, effectiveLimit);
        return vocabularyRepository.searchActiveVocabularies(topicId, normalizedLevel, normalizedQuery, pageable);
    }

    private String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Transactional
    public VocabularyStudyItemResponse reviewVocabulary(String email, Long vocabularyId, String rating) {
        User user = findUser(email);
        if (vocabularyId == null) {
            throw new AppException(ErrorCode.VOCABULARY_NOT_FOUND);
        }
        Vocabulary vocab = vocabularyRepository.findById(vocabularyId)
                .orElseThrow(() -> new AppException(ErrorCode.VOCABULARY_NOT_FOUND));

        int quality = mapRatingToSm2Quality(rating);

        UserVocabularyProgress progress = userVocabularyProgressRepository
                .findByUserIdAndVocabularyId(user.getId(), vocabularyId)
                .orElseGet(() -> {
                    UserVocabularyProgress created = new UserVocabularyProgress();
                    created.setUser(user);
                    created.setVocabulary(vocab);
                    created.setEaseFactor(2.5);
                    created.setIntervalDays(0);
                    created.setRepetitions(0);
                    created.setFamiliarityLevel(0);
                    created.setStatus(VocabularyStatus.LEARNING);
                    return created;
                });

        applySm2Scheduling(progress, quality, LocalDateTime.now());
        UserVocabularyProgress saved = userVocabularyProgressRepository.save(progress);

        int diamondsEarned = 0;
        if (diamondRewardService != null && quality >= 4) {
            LocalDate today = LocalDate.now(DiamondRewardService.VN_ZONE);
            diamondsEarned = diamondRewardService.grantStudyReward(
                    user, "VOCAB_REVIEW", "vocab:" + vocab.getId() + ":" + today, 2, 5, 1,
                    "Ôn từ vựng: " + vocab.getWord(), true);
        }

        VocabularyStudyItemResponse res = toStudyItem(vocab, saved);
        res.setDiamondsEarned(diamondsEarned);
        res.setCurrentDiamonds(user.getDiamonds());
        return res;
    }

    /**
     * Standard SM-2 spaced repetition calculation mapping user recall ratings
     * (AGAIN=1, HARD=3, GOOD=4, EASY=5) to interval days and ease factor.
     */
    public void applySm2Scheduling(UserVocabularyProgress progress, int quality, LocalDateTime reviewedAt) {
        double ef = progress.getEaseFactor() != null ? progress.getEaseFactor() : 2.5;
        int reps = progress.getRepetitions() != null ? progress.getRepetitions() : 0;
        int interval = progress.getIntervalDays() != null ? progress.getIntervalDays() : 0;
        int familiarity = progress.getFamiliarityLevel() != null ? progress.getFamiliarityLevel() : 0;

        if (quality < 3) {
            reps = 0;
            interval = 1;
            familiarity = Math.max(0, familiarity - 1);
            progress.setStatus(VocabularyStatus.LEARNING);
        } else {
            reps += 1;
            if (reps == 1) {
                interval = 1;
            } else if (reps == 2) {
                interval = 6;
            } else {
                interval = (int) Math.max(1, Math.round(interval * ef));
            }
            if (quality == 5) {
                interval = (int) Math.max(interval + 1, Math.round(interval * 1.2));
            }
            familiarity = Math.min(5, familiarity + 1);
            progress.setStatus(reps >= 3 || interval >= 14 ? VocabularyStatus.MASTERED : VocabularyStatus.REVIEWING);
        }

        double nextEf = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        progress.setEaseFactor(Math.max(1.3, Math.round(nextEf * 100.0) / 100.0));
        progress.setRepetitions(reps);
        progress.setIntervalDays(interval);
        progress.setFamiliarityLevel(familiarity);
        progress.setLastReviewedAt(reviewedAt);
        progress.setNextReviewAt(reviewedAt.plusDays(interval));
    }

    private int mapRatingToSm2Quality(String rating) {
        if (rating == null || rating.isBlank()) {
            throw new AppException(ErrorCode.INVALID_REVIEW_RATING);
        }
        return switch (rating.trim().toUpperCase(Locale.ROOT)) {
            case "AGAIN" -> 1;
            case "HARD" -> 3;
            case "GOOD" -> 4;
            case "EASY" -> 5;
            default -> throw new AppException(ErrorCode.INVALID_REVIEW_RATING);
        };
    }

    private VocabularyStudyItemResponse toStudyItem(Vocabulary vocab, UserVocabularyProgress progress) {
        VocabularyStudyItemResponse item = new VocabularyStudyItemResponse();
        item.setVocabularyId(vocab.getId());
        item.setTopicId(vocab.getTopic() != null ? vocab.getTopic().getId() : null);
        item.setTopicName(vocab.getTopic() != null ? vocab.getTopic().getName() : null);
        item.setWord(vocab.getWord());
        item.setIpa(vocab.getIpa());
        item.setAudioUrl(vocab.getAudioUrl());
        item.setMeaningVi(vocab.getMeaningVi());
        item.setMeaningEn(vocab.getMeaningEn());
        item.setExampleSentence(vocab.getExampleSentence());
        item.setExampleTranslation(vocab.getExampleTranslation());
        item.setPartOfSpeech(vocab.getPartOfSpeech());
        item.setDifficultyLevel(vocab.getDifficultyLevel());

        if (progress != null) {
            item.setFamiliarityLevel(progress.getFamiliarityLevel());
            item.setEaseFactor(progress.getEaseFactor());
            item.setIntervalDays(progress.getIntervalDays());
            item.setRepetitions(progress.getRepetitions());
            item.setLastReviewedAt(progress.getLastReviewedAt());
            item.setNextReviewAt(progress.getNextReviewAt());
            item.setStatus(progress.getStatus());
        } else {
            item.setFamiliarityLevel(0);
            item.setEaseFactor(2.5);
            item.setIntervalDays(0);
            item.setRepetitions(0);
            item.setStatus(VocabularyStatus.LEARNING);
        }
        return item;
    }

    private void ensureStarterVocabularySeeded() {
        if (vocabularyTopicRepository.count() > 0) {
            return;
        }
        VocabularyTopic topic = new VocabularyTopic();
        topic.setName("TOEIC Core Business & Office");
        topic.setDescription("Essential TOEIC vocabulary for contracts, travel, and office meetings");
        topic.setLevel("500+");
        topic.setActive(true);
        VocabularyTopic savedTopic = vocabularyTopicRepository.save(topic);

        List<Vocabulary> seeds = List.of(
                seedWord(savedTopic, "negotiate", "/nɪˈɡəʊ.ʃi.eɪt/", "verb", "INTERMEDIATE",
                        "đàm phán, thương lượng", "We will negotiate the contract terms tomorrow.", "Chúng tôi sẽ đàm phán các điều khoản hợp đồng vào ngày mai."),
                seedWord(savedTopic, "itinerary", "/aɪˈtɪn.ə.rer.i/", "noun", "INTERMEDIATE",
                        "lịch trình chuyến đi", "The travel agent emailed our flight itinerary.", "Đại lý du lịch đã gửi lịch trình bay cho chúng tôi."),
                seedWord(savedTopic, "reimburse", "/ˌriː.ɪmˈbɜːs/", "verb", "ADVANCED",
                        "hoàn trả chi phí", "The company will reimburse all travel expenses.", "Công ty sẽ hoàn trả toàn bộ chi phí đi lại."),
                seedWord(savedTopic, "mandatory", "/ˈmæn.də.tɔːr.i/", "adjective", "BEGINNER",
                        "bắt buộc", "Safety training is mandatory for all new staff.", "Đào tạo an toàn là bắt buộc đối với nhân viên mới."),
                seedWord(savedTopic, "preliminary", "/prɪˈlɪm.ɪ.ner.i/", "adjective", "ADVANCED",
                        "sơ bộ, ban đầu", "Preliminary results show a 15% increase in sales.", "Kết quả sơ bộ cho thấy doanh số tăng 15%."),
                seedWord(savedTopic, "complimentary", "/ˌkɒm.plɪˈmen.tər.i/", "adjective", "INTERMEDIATE",
                        "miễn phí (dịch vụ kèm theo)", "Guests receive complimentary breakfast at the hotel.", "Khách được phục vụ bữa sáng miễn phí tại khách sạn."),
                seedWord(savedTopic, "agenda", "/əˈdʒen.də/", "noun", "BEGINNER",
                        "chương trình nghị sự, nội dung họp", "Let's review the first item on today's agenda.", "Hãy xem qua mục đầu tiên trong chương trình họp hôm nay."),
                seedWord(savedTopic, "deadline", "/ˈded.laɪn/", "noun", "BEGINNER",
                        "hạn chót", "Please submit the quarterly report before the deadline.", "Vui lòng nộp báo cáo quý trước hạn chót.")
        );
        vocabularyRepository.saveAll(seeds);
    }

    private Vocabulary seedWord(
            VocabularyTopic topic,
            String word,
            String ipa,
            String pos,
            String level,
            String meaningVi,
            String exampleSentence,
            String exampleTranslation
    ) {
        Vocabulary v = new Vocabulary();
        v.setTopic(topic);
        v.setWord(word);
        v.setIpa(ipa);
        v.setPartOfSpeech(pos);
        v.setDifficultyLevel(level);
        v.setMeaningVi(meaningVi);
        v.setExampleSentence(exampleSentence);
        v.setExampleTranslation(exampleTranslation);
        return v;
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }
}
