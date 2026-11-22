package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.AdminAnalyticsOverviewResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.entity.PaymentOrder;
import org.example.backend.entity.Test;
import org.example.backend.entity.User;
import org.example.backend.entity.UserTestAttempt;
import org.example.backend.enums.AttemptStatus;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserStatus;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.UserMapper;
import org.example.backend.repository.PaymentOrderRepository;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAttemptRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AdminAnalyticsService {

    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final UserRepository userRepository;
    private final QuestionRepository questionRepository;
    private final TestRepository testRepository;
    private final UserTestAttemptRepository userTestAttemptRepository;
    private final UserMapper userMapper;

    @Autowired(required = false)
    private PaymentOrderRepository paymentOrderRepository;

    @Transactional(readOnly = true)
    public AdminAnalyticsOverviewResponse getOverview() {
        List<User> users = userRepository.findAll();
        List<Test> tests = testRepository.findAll();
        List<UserTestAttempt> submittedAttempts = userTestAttemptRepository.findAll().stream()
                .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED)
                .toList();

        LocalDate yesterdayVn = LocalDate.now(VN_ZONE).minusDays(1);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime sevenDaysAgo = now.minusDays(7);
        LocalDateTime thirtyDaysAgo = now.minusDays(30);

        long plusCount = users.stream()
                .filter(u -> "PLUS".equalsIgnoreCase(u.getActivePlanTier()))
                .count();
        long proCount = users.stream()
                .filter(u -> "PRO".equalsIgnoreCase(u.getActivePlanTier()))
                .count();
        long freeCount = users.size() - plusCount - proCount;

        AdminAnalyticsOverviewResponse res = new AdminAnalyticsOverviewResponse();
        res.setTotalUsers(users.size());
        res.setActiveUsers(users.stream().filter(u -> u.getStatus() == UserStatus.ACTIVE).count());
        res.setBlockedUsers(users.stream().filter(u -> u.getStatus() == UserStatus.BLOCKED).count());
        res.setVerifiedUsers(users.stream().filter(u -> Boolean.TRUE.equals(u.getVerified())).count());
        res.setFreeUsers(freeCount);
        res.setPlusUsers(plusCount);
        res.setProUsers(proCount);
        res.setPremiumUsers(plusCount + proCount);
        res.setUsersWithStreak(users.stream()
                .filter(u -> u.getCurrentLoginStreak() != null
                        && u.getCurrentLoginStreak() > 0
                        && (u.getLastLoginDate() == null || !u.getLastLoginDate().isBefore(yesterdayVn)))
                .count());
        res.setTotalQuestions(questionRepository.count());
        res.setTotalTests(tests.size());
        res.setPublishedTests(tests.stream().filter(t -> Boolean.TRUE.equals(t.getPublished())).count());
        res.setTotalTestAttempts(submittedAttempts.size());
        res.setAttemptsLast7Days(submittedAttempts.stream()
                .filter(a -> a.getSubmittedAt() != null && !a.getSubmittedAt().isBefore(sevenDaysAgo))
                .count());

        double avgAccuracy = submittedAttempts.stream()
                .mapToDouble(a -> a.getScore() != null ? a.getScore() : 0.0)
                .average()
                .orElse(0.0);
        res.setAverageAccuracyPercent(Math.round(avgAccuracy * 10.0) / 10.0);

        List<Integer> attemptToeicScores = submittedAttempts.stream()
                .map(a -> a.getToeicScore() != null
                        ? a.getToeicScore()
                        : UserTestService.calculateToeicSectionScore(
                                a.getCorrectCount() != null ? a.getCorrectCount() : 0,
                                a.getTotalQuestions() != null ? a.getTotalQuestions() : 0
                        ) * 2)
                .toList();

        int avgToeic = (int) Math.round(attemptToeicScores.stream()
                .mapToInt(Integer::intValue)
                .average()
                .orElse(0.0));
        int maxToeic = attemptToeicScores.stream()
                .mapToInt(Integer::intValue)
                .max()
                .orElse(0);
        res.setAverageToeicScore(avgToeic);
        res.setHighestToeicScore(maxToeic);
        res.setBandUnder450(attemptToeicScores.stream().filter(s -> s < 450).count());
        res.setBand450To649(attemptToeicScores.stream().filter(s -> s >= 450 && s < 650).count());
        res.setBand650To849(attemptToeicScores.stream().filter(s -> s >= 650 && s < 850).count());
        res.setBand850Plus(attemptToeicScores.stream().filter(s -> s >= 850).count());

        if (paymentOrderRepository != null) {
            List<PaymentOrder> paidOrders = paymentOrderRepository.findAllByStatusOrderByPaidAtDesc("PAID");
            res.setPaidOrdersCount(paidOrders.size());
            res.setPendingOrdersCount(paymentOrderRepository.countByStatus("PENDING"));
            res.setTotalRevenueVnd(paidOrders.stream()
                    .mapToLong(o -> o.getAmountVnd() != null ? o.getAmountVnd() : 0L)
                    .sum());
            res.setRevenueLast30DaysVnd(paidOrders.stream()
                    .filter(o -> o.getPaidAt() != null && !o.getPaidAt().isBefore(thirtyDaysAgo))
                    .mapToLong(o -> o.getAmountVnd() != null ? o.getAmountVnd() : 0L)
                    .sum());

            List<AdminAnalyticsOverviewResponse.RecentOrderSummary> recent = new ArrayList<>();
            for (int i = 0; i < Math.min(5, paidOrders.size()); i++) {
                PaymentOrder order = paidOrders.get(i);
                AdminAnalyticsOverviewResponse.RecentOrderSummary item =
                        new AdminAnalyticsOverviewResponse.RecentOrderSummary();
                item.setOrderCode(order.getOrderCode());
                item.setPlanCode(order.getPlanCode());
                item.setPlanTier(order.getPlanTier());
                item.setAmountVnd(order.getAmountVnd() != null ? order.getAmountVnd() : 0L);
                item.setPaidAt(order.getPaidAt());
                if (order.getUser() != null) {
                    item.setUserEmail(order.getUser().getEmail());
                    item.setUserName(order.getUser().getFullName());
                }
                recent.add(item);
            }
            res.setRecentPaidOrders(recent);
        }
        return res;
    }

    @Transactional
    public UserResponse updateUserStatus(Long userId, UserStatus status) {
        if (userId == null || status == null) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        user.setStatus(status);
        return userMapper.toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUserPlan(Long userId, String planTierRaw, Integer durationDays) {
        if (userId == null || planTierRaw == null || planTierRaw.isBlank()) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        String normalizedTier = planTierRaw.trim().toUpperCase(Locale.ROOT);
        if (!"FREE".equals(normalizedTier) && !"PLUS".equals(normalizedTier) && !"PRO".equals(normalizedTier)) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        if ("FREE".equals(normalizedTier)) {
            user.setPlanTier("FREE");
            user.setPlanExpiresAt(null);
            user.setPremium(false);
        } else {
            int days = durationDays != null ? durationDays : 30;
            LocalDateTime now = LocalDateTime.now();
            if (days > 0) {
                LocalDateTime currentExpiry = user.getPlanExpiresAt();
                LocalDateTime base = normalizedTier.equalsIgnoreCase(user.getActivePlanTier())
                        && currentExpiry != null
                        && currentExpiry.isAfter(now)
                        ? currentExpiry
                        : now;
                user.setPlanExpiresAt(base.plusDays(days));
            } else {
                user.setPlanExpiresAt(null);
            }
            user.setPlanTier(normalizedTier);
            user.setPremium(true);
            if ("PRO".equals(normalizedTier)) {
                user.setVerified(true);
            }
        }
        return userMapper.toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUserPremium(Long userId, Boolean premium) {
        if (userId == null || premium == null) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        return updateUserPlan(userId, Boolean.TRUE.equals(premium) ? "PRO" : "FREE", 30);
    }

    @Transactional
    public UserResponse updateUserVerified(Long userId, Boolean verified) {
        if (userId == null || verified == null) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        user.setVerified(verified);
        return userMapper.toResponse(userRepository.save(user));
    }
}
