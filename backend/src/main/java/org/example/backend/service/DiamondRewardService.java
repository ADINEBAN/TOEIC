package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.WeeklyLeaderboardResponse;
import org.example.backend.entity.DiamondTransaction;
import org.example.backend.entity.User;
import org.example.backend.entity.UserAchievement;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.DiamondTransactionRepository;
import org.example.backend.repository.UserAchievementRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.util.LevelCalculator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DiamondRewardService {

    public static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final UserRepository userRepository;
    private final DiamondTransactionRepository diamondTransactionRepository;
    private final UserAchievementRepository userAchievementRepository;

    @Lazy
    @Autowired(required = false)
    private AchievementService achievementService;

    public LocalDate getWeekStartDate(int weekOffset) {
        LocalDate today = LocalDate.now(VN_ZONE);
        return today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).plusWeeks(weekOffset);
    }

    @Transactional
    public int grantStudyReward(
            User user,
            String sourceType,
            String referenceKey,
            int diamonds,
            int xpGain,
            int studyMinutesGain,
            String descriptionVi,
            boolean evaluateAchievements
    ) {
        if (user == null || user.getId() == null || diamonds <= 0) {
            return 0;
        }
        String normSource = sourceType != null ? sourceType.trim().toUpperCase(Locale.ROOT) : "STUDY";
        if (referenceKey != null && !referenceKey.isBlank()
                && diamondTransactionRepository.existsByUserIdAndSourceTypeAndReferenceKey(
                        user.getId(), normSource, referenceKey.trim())) {
            return 0;
        }

        int currentDiamonds = user.getDiamonds() != null ? user.getDiamonds() : 50;
        int currentXp = user.getLearningXp() != null ? user.getLearningXp() : 0;
        int currentMinutes = user.getTotalStudyMinutes() != null ? user.getTotalStudyMinutes() : 0;

        user.setDiamonds(Math.max(0, currentDiamonds + diamonds));
        user.setLearningXp(Math.max(0, currentXp + Math.max(0, xpGain)));
        user.setTotalStudyMinutes(Math.max(0, currentMinutes + Math.max(0, studyMinutesGain)));
        userRepository.save(user);

        DiamondTransaction tx = new DiamondTransaction();
        tx.setUser(user);
        tx.setSourceType(normSource);
        tx.setReferenceKey(referenceKey != null && !referenceKey.isBlank() ? referenceKey.trim() : null);
        tx.setDiamondsDelta(diamonds);
        tx.setStudyReward(true);
        tx.setDescriptionVi(descriptionVi != null ? descriptionVi : "Hoàn thành hoạt động học tập");
        tx.setWeekStartDate(getWeekStartDate(0));
        tx.setCreatedAt(LocalDateTime.now(VN_ZONE));
        diamondTransactionRepository.save(tx);

        if (evaluateAchievements && achievementService != null) {
            try {
                achievementService.evaluateAndUnlock(user);
            } catch (Exception ignored) {
                // Keep core learning action resilient
            }
        }
        return diamonds;
    }

    @Transactional
    public void recordSpend(User user, String sourceType, String referenceKey, int amount, String descriptionVi) {
        if (user == null || user.getId() == null || amount <= 0) {
            return;
        }
        DiamondTransaction tx = new DiamondTransaction();
        tx.setUser(user);
        tx.setSourceType(sourceType != null ? sourceType : "SHOP_PURCHASE");
        tx.setReferenceKey(referenceKey);
        tx.setDiamondsDelta(-amount);
        tx.setStudyReward(false);
        tx.setDescriptionVi(descriptionVi != null ? descriptionVi : "Mua vật phẩm cửa hàng");
        tx.setWeekStartDate(getWeekStartDate(0));
        tx.setCreatedAt(LocalDateTime.now(VN_ZONE));
        diamondTransactionRepository.save(tx);
    }

    @Transactional(readOnly = true)
    public WeeklyLeaderboardResponse getWeeklyLeaderboard(String email, int rawOffset) {
        int weekOffset = Math.max(-12, Math.min(0, rawOffset));
        User viewer = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        LocalDate weekStart = getWeekStartDate(weekOffset);
        LocalDate weekEnd = weekStart.plusDays(6);

        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM");
        String weekLabel = weekOffset == 0
                ? "Tuần này (" + weekStart.format(fmt) + " - " + weekEnd.format(fmt) + ")"
                : "Tuần " + weekStart.format(fmt) + " - " + weekEnd.format(fmt);

        long secondsUntilClose = 0L;
        if (weekOffset == 0) {
            ZonedDateTime now = ZonedDateTime.now(VN_ZONE);
            ZonedDateTime closeAt = weekEnd.plusDays(1).atStartOfDay(VN_ZONE);
            secondsUntilClose = Math.max(0L, Duration.between(now, closeAt).getSeconds());
        }

        List<Object[]> rawRows = diamondTransactionRepository.findWeeklyStudyRankings(weekStart, PageRequest.of(0, 50));
        List<Long> userIds = new ArrayList<>();
        for (Object[] row : rawRows) {
            if (row[0] instanceof Number idNum) {
                userIds.add(idNum.longValue());
            }
        }
        Map<Long, User> userById = new HashMap<>();
        if (!userIds.isEmpty()) {
            for (User u : userRepository.findAllById(userIds)) {
                userById.put(u.getId(), u);
            }
        }

        List<WeeklyLeaderboardResponse.WeeklyLeaderboardEntry> entries = new ArrayList<>();
        WeeklyLeaderboardResponse.WeeklyLeaderboardEntry viewerEntry = null;

        int rank = 1;
        for (Object[] row : rawRows) {
            if (!(row[0] instanceof Number idNum)) {
                continue;
            }
            Long uid = idNum.longValue();
            User u = userById.get(uid);
            if (u == null) {
                continue;
            }
            int weeklyScore = row[1] instanceof Number n ? n.intValue() : 0;
            int activityCount = row[2] instanceof Number n ? n.intValue() : 0;

            WeeklyLeaderboardResponse.WeeklyLeaderboardEntry entry = toLeaderboardEntry(rank, u, weeklyScore, activityCount);
            entries.add(entry);
            if (uid.equals(viewer.getId())) {
                viewerEntry = entry;
            }
            rank++;
        }

        if (viewerEntry == null) {
            Long myScoreRaw = diamondTransactionRepository.sumWeeklyStudyDiamondsByUser(viewer.getId(), weekStart);
            int myScore = myScoreRaw != null ? myScoreRaw.intValue() : 0;
            viewerEntry = toLeaderboardEntry(entries.size() + 1, viewer, myScore, 0);
        }

        WeeklyLeaderboardResponse response = new WeeklyLeaderboardResponse();
        response.setWeekOffset(weekOffset);
        response.setWeekStartDate(weekStart);
        response.setWeekEndDate(weekEnd);
        response.setWeekLabel(weekLabel);
        response.setSecondsUntilWeekClose(secondsUntilClose);
        Long totalActive = diamondTransactionRepository.countActiveStudyUsersInWeek(weekStart);
        response.setTotalActiveLearners(totalActive != null ? totalActive.intValue() : entries.size());
        response.setMyEntry(viewerEntry);
        response.setRewardTiers(buildDefaultRewardTiers());
        response.setEntries(entries);
        return response;
    }

    private WeeklyLeaderboardResponse.WeeklyLeaderboardEntry toLeaderboardEntry(
            int rank,
            User user,
            int weeklyStudyDiamonds,
            int activitiesCount
    ) {
        WeeklyLeaderboardResponse.WeeklyLeaderboardEntry item = new WeeklyLeaderboardResponse.WeeklyLeaderboardEntry();
        item.setRank(rank);
        item.setUserId(user.getId());
        item.setFullName(resolveDisplayName(user));
        item.setUsername(resolveUsername(user));
        item.setAvatarUrl(user.getAvatarUrl());
        item.setEquippedFrameId(user.getEquippedFrameId());
        item.setVerified(Boolean.TRUE.equals(user.getVerified()));
        int xp = user.getLearningXp() != null ? user.getLearningXp() : 0;
        item.setLevel(LevelCalculator.fromXp(xp).level());
        item.setWeeklyStudyDiamonds(weeklyStudyDiamonds);
        item.setTotalDiamonds(user.getDiamonds() != null ? user.getDiamonds() : 50);
        item.setActivitiesCount(activitiesCount);
        item.setCurrentStreak(user.getCurrentLoginStreak() != null ? user.getCurrentLoginStreak() : 0);

        List<String> badgeIcons = userAchievementRepository.findByUserIdOrderByUnlockedAtDesc(user.getId()).stream()
                .limit(3)
                .map(UserAchievement::getIconName)
                .toList();
        item.setTopBadgeIcons(badgeIcons);
        return item;
    }

    private List<WeeklyLeaderboardResponse.WeeklyRewardTier> buildDefaultRewardTiers() {
        WeeklyLeaderboardResponse.WeeklyRewardTier t1 = new WeeklyLeaderboardResponse.WeeklyRewardTier();
        t1.setRankLabel("#1");
        t1.setRewardDiamonds(300);
        t1.setBadgeTitle("Quán Quân Tuần");
        t1.setBadgeEmoji("🥇");

        WeeklyLeaderboardResponse.WeeklyRewardTier t2 = new WeeklyLeaderboardResponse.WeeklyRewardTier();
        t2.setRankLabel("#2");
        t2.setRewardDiamonds(200);
        t2.setBadgeTitle("Á Quân Tuần");
        t2.setBadgeEmoji("🥈");

        WeeklyLeaderboardResponse.WeeklyRewardTier t3 = new WeeklyLeaderboardResponse.WeeklyRewardTier();
        t3.setRankLabel("#3");
        t3.setRewardDiamonds(100);
        t3.setBadgeTitle("Hạng 3 Tuần");
        t3.setBadgeEmoji("🥉");

        WeeklyLeaderboardResponse.WeeklyRewardTier t10 = new WeeklyLeaderboardResponse.WeeklyRewardTier();
        t10.setRankLabel("Top 10");
        t10.setRewardDiamonds(50);
        t10.setBadgeTitle("Chăm Chỉ");
        t10.setBadgeEmoji("🏅");

        return List.of(t1, t2, t3, t10);
    }

    public static String resolveDisplayName(User user) {
        if (user == null) {
            return "Học viên TOEIC";
        }
        if (user.getFullName() != null && !user.getFullName().isBlank()) {
            return user.getFullName().trim();
        }
        if (user.getEmail() != null && user.getEmail().contains("@")) {
            return user.getEmail().substring(0, user.getEmail().indexOf('@'));
        }
        return "Học viên TOEIC";
    }

    public static String resolveUsername(User user) {
        if (user == null) {
            return "learner";
        }
        if (user.getUsername() != null && !user.getUsername().isBlank()) {
            return user.getUsername().trim();
        }
        String prefix = user.getEmail() != null && user.getEmail().contains("@")
                ? user.getEmail().substring(0, user.getEmail().indexOf('@'))
                : "learner";
        String clean = prefix.replaceAll("[^a-zA-Z0-9._]", "_").toLowerCase(Locale.ROOT);
        if (clean.length() < 3) {
            clean = "toeic_" + clean;
        }
        return user.getId() != null ? clean + "_" + user.getId() : clean;
    }
}
