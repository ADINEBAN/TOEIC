package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.AdaptiveRecommendationResponse;
import org.example.backend.dto.response.AdaptiveRecommendationResponse.DailyTaskItem;
import org.example.backend.dto.response.AdaptiveRecommendationResponse.PartAccuracyItem;
import org.example.backend.dto.response.UserRoadmapResponse;
import org.example.backend.entity.User;
import org.example.backend.entity.UserVocabularyProgress;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.ProgressStatus;
import org.example.backend.exception.AppException;
import org.example.backend.repository.UserPracticeAnswerRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAnswerRepository;
import org.example.backend.repository.UserVocabularyProgressRepository;
import org.example.backend.repository.VocabularyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AdaptiveLearningService {

    private final UserRepository userRepository;
    private final UserPracticeAnswerRepository userPracticeAnswerRepository;
    private final UserTestAnswerRepository userTestAnswerRepository;
    private final UserVocabularyProgressRepository userVocabularyProgressRepository;
    private final VocabularyRepository vocabularyRepository;
    private final MistakeBankService mistakeBankService;
    private final UserLearningService userLearningService;

    @Transactional(readOnly = true)
    public AdaptiveRecommendationResponse getRecommendations(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Map<Integer, long[]> statsByPart = new LinkedHashMap<>();
        accumulatePartStats(statsByPart, userPracticeAnswerRepository.summarizeAccuracyByPart(user.getId()));
        accumulatePartStats(statsByPart, userTestAnswerRepository.summarizeAccuracyByPart(user.getId()));

        List<PartAccuracyItem> partAccuracies = new ArrayList<>();
        Integer weakestPartNo = null;
        Double weakestPartAccuracy = null;

        for (Map.Entry<Integer, long[]> e : statsByPart.entrySet()) {
            long total = e.getValue()[0];
            long correct = e.getValue()[1];
            if (total <= 0) continue;
            double acc = Math.round((correct * 1000.0) / total) / 10.0;
            partAccuracies.add(PartAccuracyItem.builder()
                    .partNo(e.getKey())
                    .correct(correct)
                    .total(total)
                    .accuracyPercent(acc)
                    .build());

            if (weakestPartAccuracy == null || acc < weakestPartAccuracy) {
                weakestPartAccuracy = acc;
                weakestPartNo = e.getKey();
            }
        }
        partAccuracies.sort(Comparator.comparingInt(PartAccuracyItem::getPartNo));

        int mistakeCount = mistakeBankService.getMyMistakes(email).size();
        long dueVocabCount = countDueVocabularies(user.getId());

        UserRoadmapResponse roadmap = null;
        try {
            roadmap = userLearningService.getActiveRoadmap(email);
        } catch (AppException ignored) {
            // User has not picked a learning path yet (e.g. skipped onboarding)
        }

        List<Long> prioritizedModuleIds = new ArrayList<>();
        Long nextModuleId = roadmap != null ? roadmap.getCurrentModuleId() : null;
        String nextModuleTitle = null;
        String nextModuleReason = null;

        if (roadmap != null && roadmap.getMilestones() != null) {
            List<UserRoadmapResponse.ModuleItem> allModules = roadmap.getMilestones().stream()
                    .flatMap(ms -> ms.getModules() == null ? java.util.stream.Stream.empty() : ms.getModules().stream())
                    .toList();

            for (UserRoadmapResponse.ModuleItem m : allModules) {
                if (m.getModuleId().equals(nextModuleId)) {
                    nextModuleTitle = m.getTitle();
                }
                if (ProgressStatus.COMPLETED.name().equals(m.getProgressStatus())) {
                    continue;
                }
                if (matchesWeakArea(m, weakestPartNo, dueVocabCount)) {
                    prioritizedModuleIds.add(m.getModuleId());
                }
            }

            if (weakestPartNo != null && !prioritizedModuleIds.isEmpty()) {
                Long firstPriorityId = prioritizedModuleIds.get(0);
                UserRoadmapResponse.ModuleItem priorityMod = allModules.stream()
                        .filter(m -> m.getModuleId().equals(firstPriorityId))
                        .findFirst()
                        .orElse(null);
                if (priorityMod != null) {
                    nextModuleId = priorityMod.getModuleId();
                    nextModuleTitle = priorityMod.getTitle();
                    nextModuleReason = String.format(
                            Locale.ROOT,
                            "Ưu tiên cải thiện Part %d (độ chính xác hiện tại %.0f%%)",
                            weakestPartNo,
                            weakestPartAccuracy
                    );
                }
            } else if (nextModuleTitle != null) {
                nextModuleReason = "Bài học kế tiếp trong lộ trình mục tiêu của bạn";
            }
        }

        List<DailyTaskItem> dailyPlan = buildDailyPlan(
                dueVocabCount,
                mistakeCount,
                weakestPartNo,
                weakestPartAccuracy,
                nextModuleId,
                nextModuleTitle,
                nextModuleReason,
                roadmap != null
        );

        return AdaptiveRecommendationResponse.builder()
                .targetScore(user.getTargetScore())
                .currentLevel(user.getCurrentLevel())
                .weakestPartNo(weakestPartNo)
                .weakestPartAccuracy(weakestPartAccuracy)
                .mistakeCount(mistakeCount)
                .dueVocabCount(dueVocabCount)
                .nextModuleId(nextModuleId)
                .nextModuleTitle(nextModuleTitle)
                .nextModuleReason(nextModuleReason)
                .prioritizedModuleIds(prioritizedModuleIds)
                .partAccuracies(partAccuracies)
                .dailyPlan(dailyPlan)
                .build();
    }

    private void accumulatePartStats(Map<Integer, long[]> statsByPart, List<Object[]> rows) {
        if (rows == null) return;
        for (Object[] row : rows) {
            if (row == null || row.length < 3 || !(row[0] instanceof Number partNum)) continue;
            int pNo = partNum.intValue();
            if (pNo < 1 || pNo > 7) continue;
            long total = row[1] instanceof Number t ? t.longValue() : 0L;
            long correct = row[2] instanceof Number c ? c.longValue() : 0L;
            long[] acc = statsByPart.computeIfAbsent(pNo, k -> new long[2]);
            acc[0] += total;
            acc[1] += correct;
        }
    }

    private long countDueVocabularies(Long userId) {
        long totalActive = vocabularyRepository.count();
        if (totalActive <= 0) return 0L;
        LocalDateTime now = LocalDateTime.now();
        long notDueYet = 0L;
        for (UserVocabularyProgress p : userVocabularyProgressRepository.findByUserId(userId)) {
            if (p.getNextReviewAt() != null && p.getNextReviewAt().isAfter(now)) {
                notDueYet++;
            }
        }
        return Math.max(0L, totalActive - notDueYet);
    }

    private boolean matchesWeakArea(UserRoadmapResponse.ModuleItem module, Integer weakestPartNo, long dueVocabCount) {
        String title = module.getTitle() == null ? "" : module.getTitle().toLowerCase(Locale.ROOT);
        String type = module.getModuleType() == null ? "" : module.getModuleType().name();
        if (weakestPartNo != null) {
            if (title.contains("part " + weakestPartNo)) return true;
            if (weakestPartNo == 5 && "GRAMMAR".equals(type)) return true;
            if (weakestPartNo <= 4 && "VIDEO".equals(type) && title.contains("nghe")) return true;
        }
        return dueVocabCount >= 10 && "VOCABULARY".equals(type);
    }

    private List<DailyTaskItem> buildDailyPlan(
            long dueVocabCount,
            int mistakeCount,
            Integer weakestPartNo,
            Double weakestPartAccuracy,
            Long nextModuleId,
            String nextModuleTitle,
            String nextModuleReason,
            boolean hasRoadmap
    ) {
        List<DailyTaskItem> tasks = new ArrayList<>();
        if (nextModuleId != null && nextModuleTitle != null) {
            tasks.add(DailyTaskItem.builder()
                    .id("module-" + nextModuleId)
                    .title(nextModuleTitle)
                    .subtitle(nextModuleReason != null ? nextModuleReason : "Bài học tiếp theo trên lộ trình")
                    .badge(weakestPartNo != null ? "Ưu tiên" : "Tiếp tục")
                    .route("/user/roadmap?moduleId=" + nextModuleId)
                    .build());
        } else if (!hasRoadmap) {
            tasks.add(DailyTaskItem.builder()
                    .id("onboarding")
                    .title("Thiết lập lộ trình học cá nhân")
                    .subtitle("Làm bài test nhanh (hoặc chọn bỏ qua) để mở lộ trình theo mục tiêu")
                    .badge("Bắt đầu")
                    .route("/user/onboarding")
                    .build());
        }

        if (mistakeCount > 0) {
            String sub = weakestPartNo != null && weakestPartAccuracy != null
                    ? String.format(Locale.ROOT, "Part %d đang yếu nhất (%.0f%%) · Ôn lại để sửa lỗi", weakestPartNo, weakestPartAccuracy)
                    : "Ôn lại các câu làm sai gần đây để không mất điểm lặp lại";
            tasks.add(DailyTaskItem.builder()
                    .id("mistakes")
                    .title("Sửa " + mistakeCount + " câu hay làm sai")
                    .subtitle(sub)
                    .badge("Điểm yếu")
                    .route("/user/mistakes")
                    .build());
        }

        if (dueVocabCount > 0) {
            tasks.add(DailyTaskItem.builder()
                    .id("sm2")
                    .title("Ôn " + Math.min(dueVocabCount, 20) + " từ vựng đến hạn (SM-2)")
                    .subtitle("Lặp lại ngắt quãng giúp ghi nhớ sâu trước khi quên")
                    .badge("Hôm nay")
                    .route("/user/cards?mode=sm2")
                    .build());
        }
        return tasks;
    }
}
