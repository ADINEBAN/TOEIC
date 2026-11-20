package org.example.backend.service;

import org.example.backend.dto.request.CreateMilestoneQuickModuleRequest;
import org.example.backend.dto.response.AdminLearningPathOverviewResponse;
import org.example.backend.dto.response.MilestoneModuleResponse;
import org.example.backend.dto.response.UserLearningPathCatalogItemResponse;
import org.example.backend.dto.response.UserLearningPathResponse;
import org.example.backend.entity.LearningModule;
import org.example.backend.entity.LearningPath;
import org.example.backend.entity.LearningPathMilestone;
import org.example.backend.entity.MilestoneModule;
import org.example.backend.entity.User;
import org.example.backend.entity.UserLearningPath;
import org.example.backend.enums.ModuleType;
import org.example.backend.enums.PathStatus;
import org.example.backend.mapper.LearningPathMapper;
import org.example.backend.mapper.MilestoneModuleMapper;
import org.example.backend.mapper.UserLearningPathMapper;
import org.example.backend.repository.FlashcardRepository;
import org.example.backend.repository.LearningModuleRepository;
import org.example.backend.repository.LearningPathMilestoneRepository;
import org.example.backend.repository.LearningPathRepository;
import org.example.backend.repository.MilestoneModuleRepository;
import org.example.backend.repository.PracticeSetRepository;
import org.example.backend.repository.UserLearningPathRepository;
import org.example.backend.repository.UserPracticeAttemptRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.VideoLessonRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LearningPathGoalFlowTest {

    @Mock private UserRepository userRepository;
    @Mock private UserPracticeAttemptRepository userPracticeAttemptRepository;
    @Mock private LearningPathRepository learningPathRepository;
    @Mock private UserLearningPathRepository userLearningPathRepository;
    @Mock private UserLearningPathMapper userLearningPathMapper;
    @Mock private LearningPathMilestoneRepository learningPathMilestoneRepository;
    @Mock private MilestoneModuleRepository milestoneModuleRepository;
    @Mock private LearningModuleRepository learningModuleRepository;
    @Mock private FlashcardRepository flashcardRepository;
    @Mock private VideoLessonRepository videoLessonRepository;
    @Mock private PracticeSetRepository practiceSetRepository;
    @Mock private LearningPathMapper learningPathMapper;
    @Mock private MilestoneModuleMapper milestoneModuleMapper;

    @InjectMocks private PlacementOnboardingService placementOnboardingService;
    @InjectMocks private AdminLearningPathService adminLearningPathService;
    @InjectMocks private AdminMilestoneModuleService adminMilestoneModuleService;

    private static LearningPath buildPath(Long id, String code, String title, int targetScore, boolean active) {
        LearningPath p = new LearningPath();
        p.setId(id);
        p.setCode(code);
        p.setTitle(title);
        p.setTargetScore(targetScore);
        p.setActive(active);
        return p;
    }

    @Test
    void matchesExactCeilingAndHighestTargetScoresConsistently() {
        LearningPath p300 = buildPath(1L, "T300", "TOEIC 300+", 300, true);
        LearningPath p600 = buildPath(2L, "T600", "TOEIC 600+", 600, true);
        LearningPath p800 = buildPath(3L, "T800", "TOEIC 800+", 800, true);
        when(learningPathRepository.findAllByActiveTrueOrderByTargetScoreAsc()).thenReturn(List.of(p300, p600, p800));

        assertEquals(1L, placementOnboardingService.findBestMatchingPathForScore(300).orElseThrow().getId());
        assertEquals(2L, placementOnboardingService.findBestMatchingPathForScore(450).orElseThrow().getId());
        assertEquals(2L, placementOnboardingService.findBestMatchingPathForScore(600).orElseThrow().getId());
        assertEquals(3L, placementOnboardingService.findBestMatchingPathForScore(750).orElseThrow().getId());
        assertEquals(3L, placementOnboardingService.findBestMatchingPathForScore(950).orElseThrow().getId());
    }

    @Test
    void selectingSpecificPathSyncsUserTargetScoreAndActiveAssignment() {
        User user = new User();
        user.setId(9L);
        user.setEmail("learner@toeic.test");
        user.setTargetScore(300);

        LearningPath p800 = buildPath(4L, "T800", "TOEIC 800+", 800, true);
        when(userRepository.findByEmail("learner@toeic.test")).thenReturn(Optional.of(user));
        when(learningPathRepository.findByIdAndActiveTrue(4L)).thenReturn(Optional.of(p800));
        when(userLearningPathRepository.findByUserIdAndStatus(9L, PathStatus.ACTIVE)).thenReturn(List.of());
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(userLearningPathRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UserLearningPathResponse expectedDto = new UserLearningPathResponse();
        expectedDto.setLearningPathId(4L);
        when(userLearningPathMapper.toResponse(any())).thenReturn(expectedDto);

        UserLearningPathResponse res = placementOnboardingService.assignRecommendedLearningPath("learner@toeic.test", 4L, null);
        assertEquals(4L, res.getLearningPathId());
        assertEquals(800, user.getTargetScore(), "Choosing a specific path must keep user.targetScore in sync");
    }

    @Test
    void quickModuleCreatesModuleAndLinksDirectlyToMilestone() {
        LearningPathMilestone milestone = new LearningPathMilestone();
        milestone.setId(12L);
        milestone.setTitle("Chặng 1: Nền tảng 600+");

        when(learningModuleRepository.existsByTitleIgnoreCase("Từ vựng Văn phòng")).thenReturn(false);
        when(learningPathMilestoneRepository.findById(12L)).thenReturn(Optional.of(milestone));
        when(learningModuleRepository.save(any())).thenAnswer(inv -> {
            LearningModule m = inv.getArgument(0);
            m.setId(99L);
            return m;
        });
        when(milestoneModuleRepository.findByMilestoneIdOrderBySortOrderAsc(12L)).thenReturn(List.of());
        when(milestoneModuleRepository.save(any())).thenAnswer(inv -> {
            MilestoneModule link = inv.getArgument(0);
            link.setId(501L);
            return link;
        });

        MilestoneModuleResponse dto = new MilestoneModuleResponse();
        dto.setId(501L);
        dto.setMilestoneId(12L);
        dto.setModuleId(99L);
        dto.setSortOrder(1);
        when(milestoneModuleMapper.toResponse(any())).thenReturn(dto);

        CreateMilestoneQuickModuleRequest req = new CreateMilestoneQuickModuleRequest();
        req.setModuleType(ModuleType.VOCABULARY);
        req.setTitle("Từ vựng Văn phòng");
        req.setEstimatedMinutes(35);
        req.setDifficultyLevel("INTERMEDIATE");

        MilestoneModuleResponse out = adminMilestoneModuleService.createAndLinkModule(12L, req);
        assertEquals(99L, out.getModuleId());
        assertEquals(12L, out.getMilestoneId());

        ArgumentCaptor<MilestoneModule> cap = ArgumentCaptor.forClass(MilestoneModule.class);
        verify(milestoneModuleRepository).save(cap.capture());
        assertEquals(1, cap.getValue().getSortOrder());
        assertTrue(cap.getValue().getRequired());
    }

    @Test
    void adminOverviewAndUserCatalogExposeAccurateHierarchyAndRecommendations() {
        LearningPath p600 = buildPath(2L, "T600", "Lộ trình 600+", 600, true);
        LearningPath p800 = buildPath(4L, "T800", "Lộ trình 800+", 800, true);

        LearningPathMilestone ms = new LearningPathMilestone();
        ms.setId(12L);
        ms.setLearningPath(p600);
        ms.setTitle("Chặng 1");
        ms.setSortOrder(1);

        LearningModule mod = new LearningModule();
        mod.setId(6L);
        mod.setTitle("Từ vựng TOEIC 600");
        mod.setModuleType(ModuleType.VOCABULARY);
        mod.setEstimatedMinutes(45);
        mod.setActive(true);

        MilestoneModule link = new MilestoneModule();
        link.setId(10L);
        link.setMilestone(ms);
        link.setModule(mod);
        link.setSortOrder(1);
        link.setRequired(true);

        when(learningPathRepository.findAllByOrderByTargetScoreAsc()).thenReturn(List.of(p600, p800));
        when(learningPathMilestoneRepository.findByLearningPathIdOrderBySortOrderAsc(2L)).thenReturn(List.of(ms));
        when(learningPathMilestoneRepository.findByLearningPathIdOrderBySortOrderAsc(4L)).thenReturn(List.of());
        when(milestoneModuleRepository.findByMilestoneIdOrderBySortOrderAsc(12L)).thenReturn(List.of(link));
        when(flashcardRepository.countByModuleIdAndActiveTrue(6L)).thenReturn(15L);
        when(videoLessonRepository.countByModuleIdAndPublishedTrue(6L)).thenReturn(2L);
        when(practiceSetRepository.countByModuleIdAndPublishedTrue(6L)).thenReturn(1L);

        List<AdminLearningPathOverviewResponse> tree = adminLearningPathService.getLearningPathOverviewTree();
        assertEquals(2, tree.size());
        assertTrue(tree.get(0).getReadyForUsers());
        assertFalse(tree.get(1).getReadyForUsers());
        assertEquals(15L, tree.get(0).getMilestones().get(0).getModules().get(0).getFlashcardCount());

        // Also verify UserLearningService catalog maps recommendations correctly
        User user = new User();
        user.setId(7L);
        user.setEmail("u@toeic.test");
        user.setTargetScore(600);
        when(userRepository.findByEmail("u@toeic.test")).thenReturn(Optional.of(user));
        when(learningPathRepository.findAllByActiveTrueOrderByTargetScoreAsc()).thenReturn(List.of(p600, p800));
        UserLearningPath ulp = new UserLearningPath();
        ulp.setLearningPath(p600);
        when(userLearningPathRepository.findTopByUserIdAndStatusOrderByAssignedAtDesc(7L, PathStatus.ACTIVE))
                .thenReturn(Optional.of(ulp));

        UserLearningService userLearningService = new UserLearningService(
                userRepository, userLearningPathRepository, learningPathRepository,
                learningPathMilestoneRepository, milestoneModuleRepository, null,
                learningModuleRepository, videoLessonRepository, flashcardRepository,
                practiceSetRepository, null, placementOnboardingService, null, null
        );
        List<UserLearningPathCatalogItemResponse> catalog = userLearningService.getLearningPathCatalog("u@toeic.test");
        assertEquals(2, catalog.size());
        assertTrue(catalog.get(0).getRecommended());
        assertTrue(catalog.get(0).getEnrolled());
        assertEquals(15L, catalog.get(0).getFlashcardCount());
        assertFalse(catalog.get(1).getRecommended());
    }
}
