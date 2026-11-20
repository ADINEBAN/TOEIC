package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.AdminAnalyticsOverviewResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.entity.Test;
import org.example.backend.entity.User;
import org.example.backend.entity.UserTestAttempt;
import org.example.backend.enums.AttemptStatus;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserStatus;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.UserMapper;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAttemptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminAnalyticsService {

    private final UserRepository userRepository;
    private final QuestionRepository questionRepository;
    private final TestRepository testRepository;
    private final UserTestAttemptRepository userTestAttemptRepository;
    private final UserMapper userMapper;

    @Transactional(readOnly = true)
    public AdminAnalyticsOverviewResponse getOverview() {
        List<User> users = userRepository.findAll();
        List<Test> tests = testRepository.findAll();
        List<UserTestAttempt> submittedAttempts = userTestAttemptRepository.findAll().stream()
                .filter(a -> a.getStatus() == AttemptStatus.SUBMITTED)
                .toList();

        AdminAnalyticsOverviewResponse res = new AdminAnalyticsOverviewResponse();
        res.setTotalUsers(users.size());
        res.setActiveUsers(users.stream().filter(u -> u.getStatus() == UserStatus.ACTIVE).count());
        res.setPremiumUsers(users.stream().filter(u -> Boolean.TRUE.equals(u.getPremium())).count());
        res.setUsersWithStreak(users.stream().filter(u -> u.getCurrentLoginStreak() != null && u.getCurrentLoginStreak() > 0).count());
        res.setTotalQuestions(questionRepository.count());
        res.setTotalTests(tests.size());
        res.setPublishedTests(tests.stream().filter(t -> Boolean.TRUE.equals(t.getPublished())).count());
        res.setTotalTestAttempts(submittedAttempts.size());

        double avgAccuracy = submittedAttempts.stream()
                .mapToDouble(a -> a.getScore() != null ? a.getScore() : 0.0)
                .average()
                .orElse(0.0);
        res.setAverageAccuracyPercent(Math.round(avgAccuracy * 10.0) / 10.0);

        int avgToeic = (int) Math.round(submittedAttempts.stream()
                .mapToInt(a -> a.getToeicScore() != null
                        ? a.getToeicScore()
                        : UserTestService.calculateToeicSectionScore(
                                a.getCorrectCount() != null ? a.getCorrectCount() : 0,
                                a.getTotalQuestions() != null ? a.getTotalQuestions() : 0
                        ) * 2)
                .average()
                .orElse(0.0));
        res.setAverageToeicScore(avgToeic);
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
    public UserResponse updateUserPremium(Long userId, Boolean premium) {
        if (userId == null || premium == null) {
            throw new AppException(ErrorCode.INVALID_ACCOUNT_DATA);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        user.setPremium(premium);
        return userMapper.toResponse(userRepository.save(user));
    }
}
