package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.UserLearningPathResponse;
import org.example.backend.entity.LearningPath;
import org.example.backend.entity.User;
import org.example.backend.entity.UserLearningPath;
import org.example.backend.entity.UserPracticeAttempt;
import org.example.backend.enums.AttemptStatus;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.PathStatus;
import org.example.backend.enums.PracticeSetType;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.UserLearningPathMapper;
import org.example.backend.repository.LearningPathRepository;
import org.example.backend.repository.UserLearningPathRepository;
import org.example.backend.repository.UserPracticeAttemptRepository;
import org.example.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PlacementOnboardingService {

    private final UserRepository userRepository;
    private final UserPracticeAttemptRepository userPracticeAttemptRepository;
    private final LearningPathRepository learningPathRepository;
    private final UserLearningPathRepository userLearningPathRepository;
    private final UserLearningPathMapper userLearningPathMapper;

    @Transactional
    public UserLearningPathResponse assignRecommendedLearningPath(
            String email,
            Long requestedLearningPathId,
            Integer requestedTargetScore
    ) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        LearningPath learningPath = resolveLearningPath(user, requestedLearningPathId, requestedTargetScore);

        archiveActivePaths(user.getId());

        UserLearningPath assignment = new UserLearningPath();
        assignment.setUser(user);
        assignment.setLearningPath(learningPath);
        assignment.setSource("PLACEMENT_ONBOARDING");
        assignment.setStatus(PathStatus.ACTIVE);

        userRepository.save(user);
        UserLearningPath saved = userLearningPathRepository.save(assignment);
        return userLearningPathMapper.toResponse(saved);
    }

    @Transactional
    public void tryAutoAssignForTargetScore(User user) {
        if (user == null || user.getId() == null || user.getTargetScore() == null) {
            return;
        }
        Optional<LearningPath> matched = findBestMatchingPathForScore(user.getTargetScore());
        if (matched.isEmpty()) {
            return;
        }
        LearningPath targetPath = matched.get();
        List<UserLearningPath> currentActives = userLearningPathRepository.findByUserIdAndStatus(user.getId(), PathStatus.ACTIVE);
        boolean alreadyMatched = !currentActives.isEmpty()
                && currentActives.stream().anyMatch(ulp -> ulp.getLearningPath() != null
                        && targetPath.getId().equals(ulp.getLearningPath().getId()));
        if (alreadyMatched) {
            return;
        }

        archiveActivePaths(user.getId());
        UserLearningPath assignment = new UserLearningPath();
        assignment.setUser(user);
        assignment.setLearningPath(targetPath);
        assignment.setSource("TARGET_GOAL_SYNC");
        assignment.setStatus(PathStatus.ACTIVE);
        userLearningPathRepository.save(assignment);
    }

    public Optional<LearningPath> findBestMatchingPathForScore(Integer targetScore) {
        int effective = targetScore != null ? targetScore : 500;
        List<LearningPath> activePaths = learningPathRepository.findAllByActiveTrueOrderByTargetScoreAsc();
        if (activePaths != null && !activePaths.isEmpty()) {
            return activePaths.stream()
                    .filter(p -> p.getTargetScore() != null && p.getTargetScore().equals(effective))
                    .findFirst()
                    .or(() -> activePaths.stream()
                            .filter(p -> p.getTargetScore() != null && p.getTargetScore() >= effective)
                            .findFirst())
                    .or(() -> Optional.of(activePaths.get(activePaths.size() - 1)));
        }
        return learningPathRepository.findFirstByActiveTrueAndTargetScoreGreaterThanEqualOrderByTargetScoreAsc(effective)
                .or(() -> learningPathRepository.findFirstByActiveTrueOrderByTargetScoreDesc());
    }

    private LearningPath resolveLearningPath(User user, Long requestedLearningPathId, Integer requestedTargetScore) {
        if (requestedLearningPathId != null) {
            LearningPath learningPath = learningPathRepository.findByIdAndActiveTrue(requestedLearningPathId)
                    .orElseThrow(() -> new AppException(ErrorCode.LEARNING_PATH_NOT_FOUND));
            user.setTargetScore(learningPath.getTargetScore());
            return learningPath;
        }

        Integer recommendedTargetScore = resolveRecommendedTargetScore(user, requestedTargetScore);
        return selectLearningPath(recommendedTargetScore);
    }

    private Integer resolveRecommendedTargetScore(User user, Integer requestedTargetScore) {
        if (requestedTargetScore != null) {
            validateTargetScore(requestedTargetScore);
            user.setTargetScore(requestedTargetScore);
            return requestedTargetScore;
        }

        Integer userTarget = Optional.ofNullable(user.getTargetScore()).orElse(300);

        Optional<UserPracticeAttempt> latestPlacementAttempt =
                userPracticeAttemptRepository.findTopByUserIdAndPracticeSetSetTypeAndStatusOrderBySubmittedAtDesc(
                        user.getId(),
                        PracticeSetType.PLACEMENT,
                        AttemptStatus.SUBMITTED
                );

        if (latestPlacementAttempt.isEmpty() || latestPlacementAttempt.get().getScore() == null) {
            return userTarget;
        }

        int placementScore = (int) Math.round(latestPlacementAttempt.get().getScore());
        return Math.max(userTarget, placementScore);
    }

    private void validateTargetScore(Integer targetScore) {
        if (targetScore < 10 || targetScore > 990) {
            throw new AppException(ErrorCode.INVALID_TARGET_SCORE);
        }
    }

    private LearningPath selectLearningPath(Integer targetScore) {
        return findBestMatchingPathForScore(targetScore)
                .orElseThrow(() -> new AppException(ErrorCode.LEARNING_PATH_NOT_FOUND));
    }

    private void archiveActivePaths(Long userId) {
        List<UserLearningPath> activePaths = userLearningPathRepository.findByUserIdAndStatus(userId, PathStatus.ACTIVE);
        LocalDateTime now = LocalDateTime.now();
        for (UserLearningPath activePath : activePaths) {
            activePath.setStatus(PathStatus.ARCHIVED);
            activePath.setCompletedAt(now);
        }
    }
}

