package org.example.backend.service;

import org.example.backend.dto.request.EvaluatePlacementTestRequest;
import org.example.backend.dto.response.AdaptiveRecommendationResponse;
import org.example.backend.dto.response.PlacementEvaluationResponse;
import org.example.backend.dto.response.PlacementQuickTestResponse;
import org.example.backend.dto.response.UserRoadmapResponse;
import org.example.backend.entity.LearningPath;
import org.example.backend.entity.User;
import org.example.backend.entity.UserVocabularyProgress;
import org.example.backend.enums.ModuleType;
import org.example.backend.enums.ProgressStatus;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.UserPracticeAnswerRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAnswerRepository;
import org.example.backend.repository.UserVocabularyProgressRepository;
import org.example.backend.repository.VocabularyRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserAdaptiveAndPlacementTest {

    @Mock
    private QuestionRepository questionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private PlacementOnboardingService placementOnboardingService;
    @Mock
    private UserPracticeAnswerRepository userPracticeAnswerRepository;
    @Mock
    private UserTestAnswerRepository userTestAnswerRepository;
    @Mock
    private UserVocabularyProgressRepository userVocabularyProgressRepository;
    @Mock
    private VocabularyRepository vocabularyRepository;
    @Mock
    private MistakeBankService mistakeBankService;
    @Mock
    private UserLearningService userLearningService;

    @Test
    void buildsQuickTestAndEvaluatesDiagnosticResult() {
        User user = new User();
        user.setId(1L);
        user.setEmail("learner@toeic.test");

        LearningPath path650 = new LearningPath();
        path650.setId(2L);
        path650.setTitle("Lộ trình 650+");
        path650.setTargetScore(650);

        when(questionRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of());
        when(userRepository.findByEmail("learner@toeic.test")).thenReturn(Optional.of(user));
        when(placementOnboardingService.findBestMatchingPathForScore(650)).thenReturn(Optional.of(path650));

        PlacementQuickTestService svc = new PlacementQuickTestService(
                questionRepository,
                userRepository,
                placementOnboardingService
        );

        PlacementQuickTestResponse test = svc.buildQuickTest();
        assertEquals(8, test.getQuestions().size());

        // Answer 4 Part 5 right (B, A, C, C), get Part 6 & 7 wrong -> weak Part 6 & 7
        EvaluatePlacementTestRequest req = new EvaluatePlacementTestRequest();
        req.setAnswers(List.of(
                answer("SEED:1", "B"),
                answer("SEED:2", "A"),
                answer("SEED:3", "C"),
                answer("SEED:4", "C"),
                answer("SEED:5", "A"),
                answer("SEED:6", "A"),
                answer("SEED:7", "A"),
                answer("SEED:8", "A")
        ));

        PlacementEvaluationResponse eval = svc.evaluateTest("learner@toeic.test", req);
        assertEquals(4, eval.getCorrectCount());
        assertEquals(8, eval.getTotalQuestions());
        assertEquals(550, eval.getEstimatedScore());
        assertEquals(650, eval.getRecommendedTargetScore());
        assertEquals("INTERMEDIATE", eval.getLevelLabel());
        assertEquals(2L, eval.getRecommendedPathId());
        assertTrue(eval.getStrengths().stream().anyMatch(s -> s.contains("Part 5")));
        assertTrue(eval.getWeakAreas().stream().anyMatch(w -> w.contains("Part 6")));
    }

    @Test
    void recommendsWeakestPartModuleAndDailyPlan() {
        User user = new User();
        user.setId(5L);
        user.setEmail("student@toeic.test");
        user.setTargetScore(600);
        user.setCurrentLevel("BEGINNER");

        UserRoadmapResponse.ModuleItem modVideo = new UserRoadmapResponse.ModuleItem();
        modVideo.setModuleId(10L);
        modVideo.setTitle("Video cơ bản");
        modVideo.setModuleType(ModuleType.VIDEO);
        modVideo.setProgressStatus(ProgressStatus.NOT_STARTED.name());

        UserRoadmapResponse.ModuleItem modPart5 = new UserRoadmapResponse.ModuleItem();
        modPart5.setModuleId(11L);
        modPart5.setTitle("Luyện ngữ pháp Part 5");
        modPart5.setModuleType(ModuleType.GRAMMAR);
        modPart5.setProgressStatus(ProgressStatus.NOT_STARTED.name());

        UserRoadmapResponse.MilestoneItem ms = new UserRoadmapResponse.MilestoneItem();
        ms.setModules(List.of(modVideo, modPart5));

        UserRoadmapResponse roadmap = new UserRoadmapResponse();
        roadmap.setCurrentModuleId(10L);
        roadmap.setMilestones(List.of(ms));

        UserVocabularyProgress futureWord = new UserVocabularyProgress();
        futureWord.setNextReviewAt(LocalDateTime.now().plusDays(3));

        when(userRepository.findByEmail("student@toeic.test")).thenReturn(Optional.of(user));
        when(userPracticeAnswerRepository.summarizeAccuracyByPart(5L))
                .thenReturn(List.<Object[]>of(new Object[]{5, 10L, 4L}));
        when(userTestAnswerRepository.summarizeAccuracyByPart(5L))
                .thenReturn(List.<Object[]>of(new Object[]{7, 10L, 8L}));
        when(mistakeBankService.getMyMistakes("student@toeic.test")).thenReturn(List.of());
        when(vocabularyRepository.count()).thenReturn(20L);
        when(userVocabularyProgressRepository.findByUserId(5L)).thenReturn(List.of(futureWord));
        when(userLearningService.getActiveRoadmap("student@toeic.test")).thenReturn(roadmap);

        AdaptiveLearningService svc = new AdaptiveLearningService(
                userRepository,
                userPracticeAnswerRepository,
                userTestAnswerRepository,
                userVocabularyProgressRepository,
                vocabularyRepository,
                mistakeBankService,
                userLearningService
        );

        AdaptiveRecommendationResponse res = svc.getRecommendations("student@toeic.test");
        assertNotNull(res);
        assertEquals(5, res.getWeakestPartNo());
        assertEquals(40.0, res.getWeakestPartAccuracy());
        assertEquals(19L, res.getDueVocabCount());
        assertEquals(11L, res.getNextModuleId());
        assertTrue(res.getPrioritizedModuleIds().contains(11L));
        assertEquals(2, res.getDailyPlan().size());
    }

    private EvaluatePlacementTestRequest.QuickAnswerItem answer(String key, String label) {
        EvaluatePlacementTestRequest.QuickAnswerItem item = new EvaluatePlacementTestRequest.QuickAnswerItem();
        item.setQuestionKey(key);
        item.setSelectedLabel(label);
        return item;
    }
}
