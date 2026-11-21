package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.AssignTestPartQuestionsRequest;
import org.example.backend.dto.request.CreateTestPartRequest;
import org.example.backend.dto.request.CreateTestRequest;
import org.example.backend.dto.request.UpdateTestPartRequest;
import org.example.backend.dto.request.UpdateTestRequest;
import org.example.backend.dto.response.TestResponse;
import org.example.backend.dto.response.TestPartResponse;
import org.example.backend.dto.response.TestPartQuestionResponse;
import org.example.backend.entity.Test;
import org.example.backend.entity.TestPart;
import org.example.backend.entity.TestPartQuestion;
import org.example.backend.entity.Question;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.TestMapper;
import org.example.backend.mapper.TestPartMapper;
import org.example.backend.mapper.TestPartQuestionMapper;
import org.example.backend.repository.TestRepository;
import org.example.backend.repository.TestPartRepository;
import org.example.backend.repository.TestPartQuestionRepository;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.UserTestAnswerRepository;
import org.example.backend.repository.UserTestAttemptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminTestService {

    private final TestRepository testRepository;
    private final TestPartRepository testPartRepository;
    private final TestPartQuestionRepository testPartQuestionRepository;
    private final UserTestAnswerRepository userTestAnswerRepository;
    private final UserTestAttemptRepository userTestAttemptRepository;
    private final QuestionRepository questionRepository;
    private final TestMapper testMapper;
    private final TestPartMapper testPartMapper;
    private final TestPartQuestionMapper testPartQuestionMapper;

    // ===== Test Management =====

    @Transactional
    public TestResponse createTest(CreateTestRequest request) {
        if (request == null || isBlank(request.getTitle())) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        Test test = new Test();
        test.setTitle(request.getTitle());
        test.setDescription(request.getDescription());
        test.setTestType(request.getTestType() != null ? request.getTestType() : "FULL_TEST");
        test.setTotalDurationMinutes(request.getTotalDurationMinutes() != null ? request.getTotalDurationMinutes() : 120);
        test.setTargetScore(request.getTargetScore());
        test.setPublished(request.getPublished() != null ? request.getPublished() : false);

        return testMapper.toResponse(testRepository.save(test));
    }

    @Transactional(readOnly = true)
    public List<TestResponse> getAllTests() {
        return testMapper.toResponseList(testRepository.findAllByOrderByCreatedAtDesc());
    }

    @Transactional(readOnly = true)
    public List<TestResponse> getPublishedTests() {
        return testMapper.toResponseList(testRepository.findByPublishedTrueOrderByCreatedAtDesc());
    }

    @Transactional(readOnly = true)
    public TestResponse getTestById(Long testId) {
        return testMapper.toResponse(findTest(testId));
    }

    @Transactional
    public TestResponse updateTest(Long testId, UpdateTestRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        Test test = findTest(testId);

        if (request.getTitle() != null && !isBlank(request.getTitle())) {
            test.setTitle(request.getTitle());
        }
        if (request.getDescription() != null) {
            test.setDescription(request.getDescription());
        }
        if (request.getTestType() != null) {
            test.setTestType(request.getTestType());
        }
        if (request.getTotalDurationMinutes() != null) {
            test.setTotalDurationMinutes(request.getTotalDurationMinutes());
        }
        if (request.getTargetScore() != null) {
            test.setTargetScore(request.getTargetScore());
        }
        if (request.getPublished() != null) {
            test.setPublished(request.getPublished());
        }

        return testMapper.toResponse(testRepository.save(test));
    }

    @Transactional
    public void deleteTest(Long testId) {
        Test test = findTest(testId);
        userTestAnswerRepository.deleteByTestId(testId);
        userTestAttemptRepository.deleteByTestId(testId);
        testRepository.delete(test);
    }

    // ===== TestPart Management =====

    @Transactional
    public TestPartResponse createTestPart(Long testId, CreateTestPartRequest request) {
        if (request == null || request.getPartNumber() == null || request.getPartNumber() < 1 || request.getPartNumber() > 7) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        Test test = findTest(testId);
        int partNo = request.getPartNumber();
        String section = isBlank(request.getPartSection())
                ? (partNo <= 4 ? "LISTENING" : "READING")
                : request.getPartSection().trim().toUpperCase(Locale.ROOT);
        String name = isBlank(request.getPartName())
                ? defaultPartName(partNo)
                : request.getPartName().trim();

        TestPart part = new TestPart();
        part.setTest(test);
        part.setPartName(name);
        part.setPartNumber(partNo);
        part.setPartSection(section);
        part.setDescription(request.getDescription());
        part.setSortOrder(request.getSortOrder() != null ? request.getSortOrder() : partNo);
        part.setDurationMinutes(request.getDurationMinutes() != null ? request.getDurationMinutes() : defaultPartDuration(partNo, false));

        return testPartMapper.toResponse(testPartRepository.save(part));
    }

    @Transactional
    public List<TestPartResponse> initStandardToeicParts(Long testId) {
        Test test = findTest(testId);
        List<TestPart> existing = testPartRepository.findByTestIdOrderBySortOrderAsc(testId);
        Set<Integer> existingPartNumbers = existing.stream()
                .map(TestPart::getPartNumber)
                .collect(Collectors.toSet());

        String type = test.getTestType() == null ? "FULL_TEST" : test.getTestType().trim().toUpperCase(Locale.ROOT);
        boolean mini = "MINI_TEST".equals(type);
        int startPart = "READING_ONLY".equals(type) ? 5 : 1;
        int endPart = "LISTENING_ONLY".equals(type) ? 4 : 7;

        for (int p = startPart; p <= endPart; p++) {
            if (existingPartNumbers.contains(p)) {
                continue;
            }
            TestPart part = new TestPart();
            part.setTest(test);
            part.setPartNumber(p);
            part.setPartName(defaultPartName(p));
            part.setPartSection(p <= 4 ? "LISTENING" : "READING");
            part.setSortOrder(p);
            part.setDurationMinutes(defaultPartDuration(p, mini));
            testPartRepository.save(part);
        }

        return testPartMapper.toResponseList(testPartRepository.findByTestIdOrderBySortOrderAsc(testId));
    }

    @Transactional(readOnly = true)
    public List<TestPartResponse> getTestParts(Long testId) {
        findTest(testId); // Validate test exists
        return testPartMapper.toResponseList(testPartRepository.findByTestIdOrderBySortOrderAsc(testId));
    }

    @Transactional
    public TestPartResponse updateTestPart(Long testPartId, UpdateTestPartRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        TestPart part = findTestPart(testPartId);

        if (request.getPartNumber() != null) {
            if (request.getPartNumber() < 1 || request.getPartNumber() > 7) {
                throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
            }
            part.setPartNumber(request.getPartNumber());
        }
        if (request.getPartSection() != null && !isBlank(request.getPartSection())) {
            part.setPartSection(request.getPartSection().trim().toUpperCase(Locale.ROOT));
        }
        if (request.getPartName() != null && !isBlank(request.getPartName())) {
            part.setPartName(request.getPartName().trim());
        }
        if (request.getDescription() != null) {
            part.setDescription(request.getDescription());
        }
        if (request.getDurationMinutes() != null) {
            part.setDurationMinutes(request.getDurationMinutes());
        }
        if (request.getSortOrder() != null) {
            part.setSortOrder(request.getSortOrder());
        }

        return testPartMapper.toResponse(testPartRepository.save(part));
    }

    @Transactional
    public void deleteTestPart(Long testPartId) {
        TestPart part = findTestPart(testPartId);
        // delete any user answers referencing questions in this part first to avoid FK constraint
        userTestAnswerRepository.deleteByTestPartId(testPartId);
        testPartQuestionRepository.deleteByTestPartId(testPartId);
        testPartRepository.delete(part);
    }

    // ===== TestPart Questions Management =====

    @Transactional
    public List<TestPartQuestionResponse> assignQuestionsToTestPart(
            Long testPartId,
            AssignTestPartQuestionsRequest request
    ) {
        if (request == null || request.getQuestionIds() == null || request.getQuestionIds().isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        TestPart part = findTestPart(testPartId);

        Set<Long> uniqueIds = new LinkedHashSet<>(request.getQuestionIds());
        List<Long> requestedIds = new ArrayList<>(uniqueIds);
        Map<Long, Question> questionById = questionRepository.findAllById(requestedIds).stream()
                .collect(Collectors.toMap(Question::getId, q -> q));
        if (questionById.size() != requestedIds.size()) {
            throw new AppException(ErrorCode.QUESTION_NOT_FOUND);
        }

        List<TestPartQuestion> existing = testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(testPartId);
        Set<Long> existingQuestionIds = existing.stream()
                .map(tpq -> tpq.getQuestion().getId())
                .collect(Collectors.toSet());
        int nextSortOrder = existing.isEmpty() ? 1 : existing.stream()
                .mapToInt(TestPartQuestion::getSortOrder)
                .max()
                .orElse(0) + 1;

        int added = 0;
        for (Long questionId : requestedIds) {
            if (!existingQuestionIds.add(questionId)) {
                continue;
            }
            TestPartQuestion tpq = new TestPartQuestion();
            tpq.setTestPart(part);
            tpq.setQuestion(questionById.get(questionId));
            tpq.setSortOrder(nextSortOrder++);
            testPartQuestionRepository.save(tpq);
            added++;
        }

        part.setQuestionCount(existing.size() + added);
        testPartRepository.save(part);

        return testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(testPartId).stream()
                .map(testPartQuestionMapper::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public List<TestPartQuestionResponse> syncTestPartQuestions(
            Long testPartId,
            AssignTestPartQuestionsRequest request
    ) {
        if (request == null || request.getQuestionIds() == null) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        TestPart part = findTestPart(testPartId);
        List<Long> desiredIds = new ArrayList<>(new LinkedHashSet<>(request.getQuestionIds()));
        Map<Long, Question> questionById = desiredIds.isEmpty()
                ? Map.of()
                : questionRepository.findAllById(desiredIds).stream()
                        .collect(Collectors.toMap(Question::getId, q -> q));
        if (questionById.size() != desiredIds.size()) {
            throw new AppException(ErrorCode.QUESTION_NOT_FOUND);
        }

        List<TestPartQuestion> existing = testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(testPartId);
        Map<Long, TestPartQuestion> existingByQuestionId = new LinkedHashMap<>();
        for (TestPartQuestion tpq : existing) {
            // Keep first occurrence if legacy duplicate data exists; remove extras cleanly below
            if (!existingByQuestionId.containsKey(tpq.getQuestion().getId())) {
                existingByQuestionId.put(tpq.getQuestion().getId(), tpq);
            } else {
                userTestAnswerRepository.deleteByTestPartQuestionId(tpq.getId());
                testPartQuestionRepository.delete(tpq);
            }
        }

        Set<Long> desiredSet = new LinkedHashSet<>(desiredIds);
        for (TestPartQuestion tpq : existingByQuestionId.values()) {
            if (!desiredSet.contains(tpq.getQuestion().getId())) {
                userTestAnswerRepository.deleteByTestPartQuestionId(tpq.getId());
                testPartQuestionRepository.delete(tpq);
            }
        }

        int sortOrder = 1;
        for (Long qId : desiredIds) {
            TestPartQuestion existingRow = existingByQuestionId.get(qId);
            if (existingRow != null) {
                existingRow.setSortOrder(sortOrder++);
                testPartQuestionRepository.save(existingRow);
            } else {
                TestPartQuestion created = new TestPartQuestion();
                created.setTestPart(part);
                created.setQuestion(questionById.get(qId));
                created.setSortOrder(sortOrder++);
                testPartQuestionRepository.save(created);
            }
        }

        part.setQuestionCount(desiredIds.size());
        testPartRepository.save(part);

        return testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(testPartId).stream()
                .map(testPartQuestionMapper::toResponse)
                .collect(Collectors.toList());
    }

    private String defaultPartName(int partNumber) {
        return switch (partNumber) {
            case 1 -> "Part 1: Photographs";
            case 2 -> "Part 2: Question-Response";
            case 3 -> "Part 3: Conversations";
            case 4 -> "Part 4: Short Talks";
            case 5 -> "Part 5: Incomplete Sentences";
            case 6 -> "Part 6: Text Completion";
            case 7 -> "Part 7: Reading Comprehension";
            default -> "Part " + partNumber;
        };
    }

    private int defaultPartDuration(int partNumber, boolean miniTest) {
        if (miniTest) {
            return partNumber <= 4 ? 5 : 10;
        }
        return switch (partNumber) {
            case 1 -> 5;
            case 2 -> 12;
            case 3 -> 15;
            case 4 -> 13;
            case 5 -> 15;
            case 6 -> 12;
            case 7 -> 48;
            default -> 15;
        };
    }

    @Transactional(readOnly = true)
    public List<TestPartQuestionResponse> getTestPartQuestions(Long testPartId) {
        findTestPart(testPartId); // Validate exists
        return testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(testPartId).stream()
                .map(testPartQuestionMapper::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void removeQuestionFromTestPart(Long testPartId, Long testPartQuestionId) {
        TestPart part = findTestPart(testPartId);
        TestPartQuestion tpq = testPartQuestionRepository.findById(testPartQuestionId)
                .orElseThrow(() -> new AppException(ErrorCode.QUESTION_NOT_FOUND));

        if (!tpq.getTestPart().getId().equals(testPartId)) {
            throw new AppException(ErrorCode.QUESTION_NOT_FOUND);
        }

        // remove any user answers that reference this question first
        userTestAnswerRepository.deleteByTestPartQuestionId(testPartQuestionId);
        testPartQuestionRepository.delete(tpq);
        part.setQuestionCount(Math.max(0, part.getQuestionCount() - 1));
        testPartRepository.save(part);
    }

    // ===== Helper Methods =====

    private Test findTest(Long testId) {
        if (testId == null) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }
        return testRepository.findById(testId)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_QUESTION_DATA));
    }

    private TestPart findTestPart(Long testPartId) {
        if (testPartId == null) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }
        return testPartRepository.findById(testPartId)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_QUESTION_DATA));
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}

