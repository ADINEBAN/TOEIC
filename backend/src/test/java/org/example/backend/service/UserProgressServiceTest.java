package org.example.backend.service;

import org.example.backend.dto.request.UpdateLessonProgressRequest;
import org.example.backend.dto.response.LessonProgressUpdateResponse;
import org.example.backend.entity.LearningModule;
import org.example.backend.entity.User;
import org.example.backend.entity.UserModuleProgress;
import org.example.backend.entity.UserVideoProgress;
import org.example.backend.entity.VideoLesson;
import org.example.backend.enums.PathStatus;
import org.example.backend.enums.ProgressStatus;
import org.example.backend.repository.LearningModuleRepository;
import org.example.backend.repository.LearningPathMilestoneRepository;
import org.example.backend.repository.MilestoneModuleRepository;
import org.example.backend.repository.UserLearningPathRepository;
import org.example.backend.repository.UserModuleProgressRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserVideoProgressRepository;
import org.example.backend.repository.VideoLessonRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserProgressServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private UserLearningPathRepository userLearningPathRepository;
    @Mock private LearningPathMilestoneRepository learningPathMilestoneRepository;
    @Mock private MilestoneModuleRepository milestoneModuleRepository;
    @Mock private LearningModuleRepository learningModuleRepository;
    @Mock private VideoLessonRepository videoLessonRepository;
    @Mock private UserVideoProgressRepository userVideoProgressRepository;
    @Mock private UserModuleProgressRepository userModuleProgressRepository;

    private UserProgressService progressService;

    @BeforeEach
    void setUp() {
        progressService = new UserProgressService(
                userRepository,
                userLearningPathRepository,
                learningPathMilestoneRepository,
                milestoneModuleRepository,
                learningModuleRepository,
                videoLessonRepository,
                userVideoProgressRepository,
                userModuleProgressRepository
        );
    }

    @Test
    void updatesProgressEvenWithoutActiveLearningPathAndTracksRealWatchedSeconds() {
        User user = new User();
        user.setId(1L);
        user.setEmail("learner@toeic.local");
        user.setDiamonds(10);

        LearningModule module = new LearningModule();
        module.setId(33L);
        module.setTitle("Tranh ta nguoi");

        VideoLesson lesson = new VideoLesson();
        lesson.setId(100L);
        lesson.setModule(module);
        lesson.setTitle("Lesson 1");
        lesson.setPublished(true);
        lesson.setDurationSeconds(100);

        UserVideoProgress existing = new UserVideoProgress();
        existing.setUser(user);
        existing.setLesson(lesson);
        existing.setLastPositionSeconds(0);
        existing.setWatchedSeconds(0);
        existing.setCompletionPercent(0.0);
        existing.setStatus(ProgressStatus.NOT_STARTED);
        existing.setLastWatchedAt(LocalDateTime.now().minusSeconds(10));

        when(userRepository.findByEmail("learner@toeic.local")).thenReturn(Optional.of(user));
        when(videoLessonRepository.findById(100L)).thenReturn(Optional.of(lesson));
        when(userLearningPathRepository.findTopByUserIdAndStatusOrderByAssignedAtDesc(1L, PathStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(userVideoProgressRepository.findByUserIdAndLessonId(1L, 100L)).thenReturn(Optional.of(existing));
        when(userVideoProgressRepository.save(any(UserVideoProgress.class))).thenAnswer(inv -> inv.getArgument(0));
        when(videoLessonRepository.findByModuleIdAndPublishedTrueOrderBySortOrderAsc(33L)).thenReturn(List.of(lesson));
        when(userVideoProgressRepository.findByUserIdAndLessonIdIn(1L, List.of(100L))).thenReturn(List.of(existing));
        when(userModuleProgressRepository.findByUserIdAndModuleId(1L, 33L)).thenReturn(Optional.empty());
        when(userModuleProgressRepository.save(any(UserModuleProgress.class))).thenAnswer(inv -> inv.getArgument(0));

        // 1) Seeking straight to 95s with only 5s actually watched must stay IN_PROGRESS (5%)
        UpdateLessonProgressRequest seekReq = new UpdateLessonProgressRequest();
        seekReq.setLastPositionSeconds(95);
        seekReq.setWatchedSeconds(5);
        seekReq.setStatus("IN_PROGRESS");

        LessonProgressUpdateResponse seekResp = progressService.updateLessonProgress("learner@toeic.local", 100L, seekReq);
        assertEquals("IN_PROGRESS", seekResp.getLessonStatus());
        assertEquals(5, seekResp.getWatchedSeconds());
        assertEquals(95, seekResp.getLastPositionSeconds());
        assertEquals(5.0, seekResp.getLessonCompletionPercent());

        // 2) Watching >= 80% genuinely completes lesson & module
        existing.setLastWatchedAt(LocalDateTime.now().minusSeconds(40));
        UpdateLessonProgressRequest passReq = new UpdateLessonProgressRequest();
        passReq.setLastPositionSeconds(82);
        passReq.setWatchedSeconds(80);

        LessonProgressUpdateResponse passResp = progressService.updateLessonProgress("learner@toeic.local", 100L, passReq);
        assertEquals("COMPLETED", passResp.getLessonStatus());
        assertEquals(100.0, passResp.getLessonCompletionPercent());
        assertEquals("COMPLETED", passResp.getModuleStatus());
    }
}
