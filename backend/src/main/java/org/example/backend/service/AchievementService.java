package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.ProfileInsightsResponse;
import org.example.backend.entity.DiamondTransaction;
import org.example.backend.entity.User;
import org.example.backend.entity.UserAchievement;
import org.example.backend.entity.UserFriendship;
import org.example.backend.entity.UserTestAttempt;
import org.example.backend.enums.AttemptStatus;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.ProgressStatus;
import org.example.backend.enums.VocabularyStatus;
import org.example.backend.exception.AppException;
import org.example.backend.repository.DiamondTransactionRepository;
import org.example.backend.repository.UserAchievementRepository;
import org.example.backend.repository.UserFriendshipRepository;
import org.example.backend.repository.UserModuleProgressRepository;
import org.example.backend.repository.UserPracticeAttemptRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAttemptRepository;
import org.example.backend.repository.UserVideoLearningStateRepository;
import org.example.backend.repository.UserVideoProgressRepository;
import org.example.backend.repository.UserVocabularyProgressRepository;
import org.example.backend.util.LevelCalculator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AchievementService {

    private final UserRepository userRepository;
    private final UserAchievementRepository userAchievementRepository;
    private final UserVideoProgressRepository userVideoProgressRepository;
    private final UserModuleProgressRepository userModuleProgressRepository;
    private final UserPracticeAttemptRepository userPracticeAttemptRepository;
    private final UserTestAttemptRepository userTestAttemptRepository;
    private final UserVocabularyProgressRepository userVocabularyProgressRepository;
    private final UserVideoLearningStateRepository userVideoLearningStateRepository;
    private final DiamondTransactionRepository diamondTransactionRepository;
    private final DiamondRewardService diamondRewardService;

    @Lazy
    @Autowired(required = false)
    private ChatService chatService;

    @Autowired(required = false)
    private UserFriendshipRepository userFriendshipRepository;

    @Transactional
    public ProfileInsightsResponse getMyInsights(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        ProfileInsightsResponse out = buildInsights(user, true);
        out.setRelationStatus("SELF");
        return out;
    }

    @Transactional(readOnly = true)
    public ProfileInsightsResponse getPublicProfile(Long userId) {
        return getPublicProfile(null, userId);
    }

    @Transactional(readOnly = true)
    public ProfileInsightsResponse getPublicProfile(String viewerEmail, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        ProfileInsightsResponse out = buildInsights(user, false);
        if (viewerEmail != null && !viewerEmail.isBlank() && userFriendshipRepository != null) {
            userRepository.findByEmail(viewerEmail).ifPresent(viewer -> {
                if (viewer.getId().equals(user.getId())) {
                    out.setRelationStatus("SELF");
                } else {
                    List<UserFriendship> links = userFriendshipRepository.findBetweenUsers(viewer.getId(), user.getId());
                    out.setRelationStatus(ChatService.resolveRelationStatus(viewer.getId(), user.getId(), links));
                }
            });
        }
        return out;
    }

    @Transactional
    public List<UserAchievement> evaluateAndUnlock(User user) {
        if (user == null || user.getId() == null) {
            return List.of();
        }
        Metrics m = computeMetrics(user);
        Map<String, UserAchievement> existing = loadExistingMap(user.getId());
        List<UserAchievement> newlyUnlocked = new ArrayList<>();

        for (AchievementDef def : buildCatalog(m)) {
            if (def.currentProgress >= def.targetProgress && !existing.containsKey(def.code)) {
                UserAchievement entity = new UserAchievement();
                entity.setUser(user);
                entity.setAchievementCode(def.code);
                entity.setTitleVi(def.title);
                entity.setDescriptionVi(def.description);
                entity.setIconName(def.iconName);
                entity.setRewardDiamonds(def.rewardDiamonds);
                entity.setUnlockedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
                entity = userAchievementRepository.save(entity);
                existing.put(def.code, entity);
                newlyUnlocked.add(entity);

                if (def.rewardDiamonds > 0) {
                    diamondRewardService.grantStudyReward(
                            user,
                            "ACHIEVEMENT",
                            "ach:" + def.code,
                            def.rewardDiamonds,
                            30,
                            0,
                            "Mở khóa thành tựu: " + def.title,
                            false
                    );
                }
                if (chatService != null) {
                    try {
                        chatService.postSystemMilestone(
                                user,
                                "🏆 @" + DiamondRewardService.resolveUsername(user)
                                        + " vừa đạt thành tựu \"" + def.title + "\" (+"
                                        + def.rewardDiamonds + " 💎)!"
                        );
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        return newlyUnlocked;
    }

    private ProfileInsightsResponse buildInsights(User user, boolean allowEvaluateAndHistory) {
        Metrics m = computeMetrics(user);
        if (allowEvaluateAndHistory) {
            evaluateAndUnlock(user);
        }
        Map<String, UserAchievement> unlockedMap = loadExistingMap(user.getId());

        ProfileInsightsResponse out = new ProfileInsightsResponse();
        out.setUserId(user.getId());
        out.setFullName(DiamondRewardService.resolveDisplayName(user));
        out.setUsername(DiamondRewardService.resolveUsername(user));
        out.setBio(user.getBio());
        out.setAvatarUrl(user.getAvatarUrl());
        out.setEquippedFrameId(user.getEquippedFrameId());
        out.setEquippedAvatarId(user.getEquippedAvatarId());
        out.setCurrentLevel(user.getCurrentLevel());
        out.setTargetScore(user.getTargetScore());
        out.setPremium(user.getPremium());
        out.setVerified(Boolean.TRUE.equals(user.getVerified()));
        out.setDiamonds(user.getDiamonds() != null ? user.getDiamonds() : 50);

        Long weeklyRaw = diamondTransactionRepository.sumWeeklyStudyDiamondsByUser(
                user.getId(), diamondRewardService.getWeekStartDate(0));
        out.setWeeklyStudyDiamonds(weeklyRaw != null ? weeklyRaw.intValue() : 0);

        int xp = user.getLearningXp() != null ? user.getLearningXp() : 0;
        LevelCalculator.LevelProgress lp = LevelCalculator.fromXp(xp);
        out.setLearningXp(lp.totalXp());
        out.setLevel(lp.level());
        out.setCurrentLevelMinXp(lp.currentLevelMinXp());
        out.setNextLevelXp(lp.nextLevelXp());
        out.setLevelProgressPercent(lp.progressPercent());
        out.setLevelTitle(lp.levelTitle());
        out.setCurrentStreak(user.getCurrentLoginStreak() != null ? user.getCurrentLoginStreak() : 0);
        out.setLongestStreak(user.getLongestLoginStreak() != null ? user.getLongestLoginStreak() : 0);
        out.setTotalStudyMinutes(user.getTotalStudyMinutes() != null ? user.getTotalStudyMinutes() : 0);
        out.setLastActiveAt(user.getLastLoginAt() != null ? user.getLastLoginAt() : user.getUpdatedAt());

        ProfileInsightsResponse.StudyStats stats = new ProfileInsightsResponse.StudyStats();
        stats.setCompletedLessons(m.completedLessons);
        stats.setCompletedModules(m.completedModules);
        stats.setCompletedPracticeSets(m.completedPracticeSets);
        stats.setSubmittedTests(m.submittedTests);
        stats.setReviewedVocabCount(m.reviewedVocabCount);
        stats.setMasteredVocabCount(m.masteredVocabCount);
        stats.setCompletedVideos(m.completedVideos);
        stats.setArenaWins(m.arenaWins);
        stats.setArenaLosses(user.getArenaLosses() != null ? user.getArenaLosses() : 0);
        stats.setArenaElo(user.getArenaElo() != null ? user.getArenaElo() : 1000);
        stats.setTotalAchievementsUnlocked(unlockedMap.size());
        out.setStats(stats);

        List<ProfileInsightsResponse.AchievementItem> achievementItems = new ArrayList<>();
        for (AchievementDef def : buildCatalog(m)) {
            UserAchievement ua = unlockedMap.get(def.code);
            ProfileInsightsResponse.AchievementItem item = new ProfileInsightsResponse.AchievementItem();
            item.setCode(def.code);
            item.setTitle(def.title);
            item.setDescription(def.description);
            item.setIconName(def.iconName);
            item.setAccentColor(def.accentColor);
            item.setRewardDiamonds(def.rewardDiamonds);
            item.setCurrentProgress(Math.min(def.targetProgress, def.currentProgress));
            item.setTargetProgress(def.targetProgress);
            item.setUnlocked(ua != null);
            item.setUnlockedAt(ua != null ? ua.getUnlockedAt() : null);
            achievementItems.add(item);
        }
        out.setAchievements(achievementItems);

        if (allowEvaluateAndHistory) {
            List<ProfileInsightsResponse.DiamondHistoryItem> history = new ArrayList<>();
            for (DiamondTransaction tx : diamondTransactionRepository.findTop30ByUserIdOrderByCreatedAtDesc(user.getId())) {
                ProfileInsightsResponse.DiamondHistoryItem h = new ProfileInsightsResponse.DiamondHistoryItem();
                h.setId(tx.getId());
                h.setSourceType(tx.getSourceType());
                h.setDiamondsDelta(tx.getDiamondsDelta() != null ? tx.getDiamondsDelta() : 0);
                h.setStudyReward(Boolean.TRUE.equals(tx.getStudyReward()));
                h.setDescription(tx.getDescriptionVi());
                h.setCreatedAt(tx.getCreatedAt());
                history.add(h);
            }
            out.setRecentDiamonds(history);
        } else {
            out.setRecentDiamonds(List.of());
        }
        return out;
    }

    private Map<String, UserAchievement> loadExistingMap(Long userId) {
        Map<String, UserAchievement> map = new HashMap<>();
        for (UserAchievement ua : userAchievementRepository.findByUserIdOrderByUnlockedAtDesc(userId)) {
            map.put(ua.getAchievementCode(), ua);
        }
        return map;
    }

    private Metrics computeMetrics(User user) {
        Long uid = user.getId();
        int lessons = (int) userVideoProgressRepository.countByUserIdAndStatus(uid, ProgressStatus.COMPLETED);
        int modules = (int) userModuleProgressRepository.countByUserIdAndStatus(uid, ProgressStatus.COMPLETED);
        int practiceSets = (int) userPracticeAttemptRepository.findByUserIdOrderByStartedAtDesc(uid).stream()
                .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED)
                .count();

        List<UserTestAttempt> submittedTestsList = userTestAttemptRepository.findByUserIdOrderByStartedAtDesc(uid).stream()
                .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED)
                .toList();
        int tests = submittedTestsList.size();
        int maxToeicScore = submittedTestsList.stream()
                .map(UserTestAttempt::getToeicScore)
                .filter(s -> s != null)
                .max(Integer::compareTo)
                .orElse(0);

        int reviewedVocab = (int) userVocabularyProgressRepository.countByUserIdAndLastReviewedAtIsNotNull(uid);
        int masteredVocab = (int) userVocabularyProgressRepository.countByUserIdAndStatus(uid, VocabularyStatus.MASTERED);
        int completedVideos = (int) userVideoLearningStateRepository.countByUserIdAndCompletedTrue(uid);
        int streak = Math.max(
                user.getCurrentLoginStreak() != null ? user.getCurrentLoginStreak() : 0,
                user.getLongestLoginStreak() != null ? user.getLongestLoginStreak() : 0
        );
        int arenaWins = user.getArenaWins() != null ? user.getArenaWins() : 0;

        return new Metrics(lessons, modules, practiceSets, tests, maxToeicScore, reviewedVocab, masteredVocab, completedVideos, streak, arenaWins);
    }

    private List<AchievementDef> buildCatalog(Metrics m) {
        int totalActivities = m.completedLessons + m.completedPracticeSets + m.submittedTests + m.completedVideos;
        return List.of(
                new AchievementDef("FIRST_STEP", "Bước Khởi Đầu", "Hoàn thành bài học, luyện tập hoặc bài thi đầu tiên", "footsteps", "#10B981", 15, totalActivities, 1),
                new AchievementDef("VOCAB_STARTER", "Người Săn Từ", "Ôn tập SM-2 ít nhất 20 từ vựng TOEIC", "albums", "#EC4899", 25, m.reviewedVocabCount, 20),
                new AchievementDef("VOCAB_MASTER", "Từ Điển Sống", "Thành thạo (MASTERED) ít nhất 50 từ vựng", "sparkles", "#8B5CF6", 60, m.masteredVocabCount, 50),
                new AchievementDef("PRACTICE_PRO", "Kiện Tướng Luyện Tập", "Hoàn thành 3 bộ bài luyện tập trên lộ trình", "flash", "#F59E0B", 35, m.completedPracticeSets, 3),
                new AchievementDef("VIDEO_EXPLORER", "Tai Thính Song Ngữ", "Hoàn thành 3 bài học Video AI song ngữ", "play-circle", "#EF4444", 35, m.completedVideos + m.completedLessons, 3),
                new AchievementDef("TEST_WARRIOR", "Chiến Binh Phòng Thi", "Nộp đủ 3 bài thi thử TOEIC", "ribbon", "#3B82F6", 40, m.submittedTests, 3),
                new AchievementDef("HIGH_SCORER", "Chạm Mốc 700+", "Đạt từ 700 điểm quy đổi trở lên trong 1 bài thi thử", "trophy", "#D97706", 80, m.maxToeicScore, 700),
                new AchievementDef("STREAK_7", "Ngọn Lửa 7 Ngày", "Duy trì chuỗi học tập 7 ngày liên tiếp", "flame", "#F97316", 50, m.bestStreak, 7),
                new AchievementDef("STREAK_30", "Huyền Thoại 30 Ngày", "Duy trì chuỗi học tập 30 ngày liên tiếp", "bonfire", "#DC2626", 150, m.bestStreak, 30),
                new AchievementDef("ARENA_WINNER", "Chiến Thắng Solo", "Giành chiến thắng đầu tiên tại Đấu trường 1v1", "medal", "#14B8A6", 25, m.arenaWins, 1),
                new AchievementDef("ARENA_CHAMPION", "Đấu Sĩ Bất Bại", "Thắng 5 trận tại Đấu trường 1v1", "shield-checkmark", "#6366F1", 75, m.arenaWins, 5)
        );
    }

    private record Metrics(
            int completedLessons,
            int completedModules,
            int completedPracticeSets,
            int submittedTests,
            int maxToeicScore,
            int reviewedVocabCount,
            int masteredVocabCount,
            int completedVideos,
            int bestStreak,
            int arenaWins
    ) {}

    private record AchievementDef(
            String code,
            String title,
            String description,
            String iconName,
            String accentColor,
            int rewardDiamonds,
            int currentProgress,
            int targetProgress
    ) {}
}
