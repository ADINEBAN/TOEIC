package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateLearningPathRequest;
import org.example.backend.dto.request.UpdateLearningPathRequest;
import org.example.backend.dto.response.AdminLearningPathOverviewResponse;
import org.example.backend.dto.response.LearningPathResponse;
import org.example.backend.entity.LearningModule;
import org.example.backend.entity.LearningPath;
import org.example.backend.entity.LearningPathMilestone;
import org.example.backend.entity.MilestoneModule;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.LearningPathMapper;
import org.example.backend.repository.FlashcardRepository;
import org.example.backend.repository.LearningPathMilestoneRepository;
import org.example.backend.repository.LearningPathRepository;
import org.example.backend.repository.MilestoneModuleRepository;
import org.example.backend.repository.PracticeSetRepository;
import org.example.backend.repository.VideoLessonRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AdminLearningPathService {

    private final LearningPathRepository learningPathRepository;
    private final LearningPathMilestoneRepository learningPathMilestoneRepository;
    private final MilestoneModuleRepository milestoneModuleRepository;
    private final FlashcardRepository flashcardRepository;
    private final VideoLessonRepository videoLessonRepository;
    private final PracticeSetRepository practiceSetRepository;
    private final LearningPathMapper learningPathMapper;

    @Transactional
    public LearningPathResponse createLearningPath(CreateLearningPathRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_LEARNING_PATH_DATA);
        }

        String code = normalizeCode(request.getCode());
        String title = trimToNull(request.getTitle());
        Integer targetScore = request.getTargetScore();

        if (code == null || title == null || !isValidTargetScore(targetScore)) {
            throw new AppException(ErrorCode.INVALID_LEARNING_PATH_DATA);
        }

        if (learningPathRepository.existsByCodeIgnoreCase(code)) {
            throw new AppException(ErrorCode.LEARNING_PATH_CODE_EXISTED);
        }

        LearningPath learningPath = new LearningPath();
        learningPath.setCode(code);
        learningPath.setTitle(title);
        learningPath.setDescription(trimToNull(request.getDescription()));
        learningPath.setTargetScore(targetScore);
        learningPath.setActive(request.getActive() == null ? true : request.getActive());

        return learningPathMapper.toResponse(learningPathRepository.save(learningPath));
    }

    @Transactional(readOnly = true)
    public List<LearningPathResponse> getAllLearningPaths() {
        return learningPathMapper.toResponseList(learningPathRepository.findAllByOrderByTargetScoreAsc());
    }

    @Transactional(readOnly = true)
    public List<AdminLearningPathOverviewResponse> getLearningPathOverviewTree() {
        List<LearningPath> paths = learningPathRepository.findAllByOrderByTargetScoreAsc();
        Map<Long, Long> videoCounts = new HashMap<>();
        Map<Long, Long> flashcardCounts = new HashMap<>();
        Map<Long, Long> practiceCounts = new HashMap<>();

        return paths.stream().map(path -> {
            List<LearningPathMilestone> milestones = learningPathMilestoneRepository
                    .findByLearningPathIdOrderBySortOrderAsc(path.getId());

            int[] moduleCounter = {0};
            int[] totalMinutes = {0};

            List<AdminLearningPathOverviewResponse.MilestoneNode> milestoneNodes = milestones.stream()
                    .map(ms -> {
                        List<MilestoneModule> links = milestoneModuleRepository
                                .findByMilestoneIdOrderBySortOrderAsc(ms.getId());
                        List<AdminLearningPathOverviewResponse.ModuleLinkNode> moduleNodes = links.stream()
                                .map(link -> {
                                    LearningModule mod = link.getModule();
                                    Long modId = mod != null ? mod.getId() : null;
                                    moduleCounter[0]++;
                                    if (mod != null && mod.getEstimatedMinutes() != null) {
                                        totalMinutes[0] += mod.getEstimatedMinutes();
                                    }
                                    AdminLearningPathOverviewResponse.ModuleLinkNode node =
                                            new AdminLearningPathOverviewResponse.ModuleLinkNode();
                                    node.setMilestoneModuleId(link.getId());
                                    node.setMilestoneId(ms.getId());
                                    node.setModuleId(modId);
                                    node.setSortOrder(link.getSortOrder());
                                    node.setRequired(link.getRequired());
                                    node.setUnlockCondition(link.getUnlockCondition());
                                    node.setModuleTitle(mod != null ? mod.getTitle() : "");
                                    node.setModuleDescription(mod != null ? mod.getDescription() : null);
                                    node.setModuleType(mod != null ? mod.getModuleType() : null);
                                    node.setEstimatedMinutes(mod != null ? mod.getEstimatedMinutes() : 0);
                                    node.setDifficultyLevel(mod != null ? mod.getDifficultyLevel() : null);
                                    node.setModuleActive(mod != null && Boolean.TRUE.equals(mod.getActive()));
                                    node.setVideoLessonCount(modId != null
                                            ? videoCounts.computeIfAbsent(modId, videoLessonRepository::countByModuleIdAndPublishedTrue)
                                            : 0L);
                                    node.setFlashcardCount(modId != null
                                            ? flashcardCounts.computeIfAbsent(modId, flashcardRepository::countByModuleIdAndActiveTrue)
                                            : 0L);
                                    node.setPracticeSetCount(modId != null
                                            ? practiceCounts.computeIfAbsent(modId, practiceSetRepository::countByModuleIdAndPublishedTrue)
                                            : 0L);
                                    return node;
                                })
                                .toList();

                        AdminLearningPathOverviewResponse.MilestoneNode msNode =
                                new AdminLearningPathOverviewResponse.MilestoneNode();
                        msNode.setId(ms.getId());
                        msNode.setLearningPathId(path.getId());
                        msNode.setTitle(ms.getTitle());
                        msNode.setDescription(ms.getDescription());
                        msNode.setSortOrder(ms.getSortOrder());
                        msNode.setModules(moduleNodes);
                        return msNode;
                    })
                    .toList();

            AdminLearningPathOverviewResponse dto = new AdminLearningPathOverviewResponse();
            dto.setId(path.getId());
            dto.setCode(path.getCode());
            dto.setTitle(path.getTitle());
            dto.setDescription(path.getDescription());
            dto.setTargetScore(path.getTargetScore());
            dto.setActive(path.getActive());
            dto.setCreatedAt(path.getCreatedAt());
            dto.setUpdatedAt(path.getUpdatedAt());
            dto.setMilestoneCount(milestoneNodes.size());
            dto.setModuleCount(moduleCounter[0]);
            dto.setEstimatedTotalMinutes(totalMinutes[0]);
            dto.setReadyForUsers(Boolean.TRUE.equals(path.getActive()) && !milestoneNodes.isEmpty() && moduleCounter[0] > 0);
            dto.setMilestones(milestoneNodes);
            return dto;
        }).toList();
    }

    @Transactional(readOnly = true)
    public LearningPathResponse getLearningPathById(Long id) {
        LearningPath learningPath = findLearningPath(id);
        return learningPathMapper.toResponse(learningPath);
    }

    @Transactional
    public LearningPathResponse updateLearningPath(Long id, UpdateLearningPathRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_LEARNING_PATH_DATA);
        }

        LearningPath learningPath = findLearningPath(id);

        if (request.getCode() != null) {
            String code = normalizeCode(request.getCode());
            if (code == null) {
                throw new AppException(ErrorCode.INVALID_LEARNING_PATH_DATA);
            }

            if (!learningPath.getCode().equalsIgnoreCase(code)
                    && learningPathRepository.existsByCodeIgnoreCase(code)) {
                throw new AppException(ErrorCode.LEARNING_PATH_CODE_EXISTED);
            }
            learningPath.setCode(code);
        }

        if (request.getTitle() != null) {
            String title = trimToNull(request.getTitle());
            if (title == null) {
                throw new AppException(ErrorCode.INVALID_LEARNING_PATH_DATA);
            }
            learningPath.setTitle(title);
        }

        if (request.getDescription() != null) {
            learningPath.setDescription(trimToNull(request.getDescription()));
        }

        if (request.getTargetScore() != null) {
            if (!isValidTargetScore(request.getTargetScore())) {
                throw new AppException(ErrorCode.INVALID_TARGET_SCORE);
            }
            learningPath.setTargetScore(request.getTargetScore());
        }

        if (request.getActive() != null) {
            learningPath.setActive(request.getActive());
        }

        return learningPathMapper.toResponse(learningPathRepository.save(learningPath));
    }

    @Transactional
    public void deactivateLearningPath(Long id) {
        LearningPath learningPath = findLearningPath(id);
        learningPath.setActive(false);
        learningPathRepository.save(learningPath);
    }

    @Transactional
    public void deleteLearningPath(Long id) {
        LearningPath learningPath = findLearningPath(id);
        learningPathRepository.delete(learningPath);
    }

    private LearningPath findLearningPath(Long id) {
        return learningPathRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.LEARNING_PATH_NOT_FOUND));
    }

    private boolean isValidTargetScore(Integer targetScore) {
        return targetScore != null && targetScore >= 10 && targetScore <= 990;
    }

    private String normalizeCode(String value) {
        String trimmed = trimToNull(value);
        return trimmed == null ? null : trimmed.toUpperCase();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
