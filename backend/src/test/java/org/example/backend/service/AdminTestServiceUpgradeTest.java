package org.example.backend.service;

import org.example.backend.dto.request.AssignTestPartQuestionsRequest;
import org.example.backend.dto.request.AutoPopulateTestRequest;
import org.example.backend.dto.response.AutoPopulateTestResponse;
import org.example.backend.dto.response.TestPartQuestionResponse;
import org.example.backend.dto.response.TestPartResponse;
import org.example.backend.entity.Question;
import org.example.backend.entity.Test;
import org.example.backend.entity.TestPart;
import org.example.backend.entity.TestPartQuestion;
import org.example.backend.mapper.TestMapper;
import org.example.backend.mapper.TestPartMapper;
import org.example.backend.mapper.TestPartQuestionMapper;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestPartQuestionRepository;
import org.example.backend.repository.TestPartRepository;
import org.example.backend.repository.TestRepository;
import org.example.backend.repository.UserTestAnswerRepository;
import org.example.backend.repository.UserTestAttemptRepository;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminTestServiceUpgradeTest {

    @Mock
    private TestRepository testRepository;
    @Mock
    private TestPartRepository testPartRepository;
    @Mock
    private TestPartQuestionRepository testPartQuestionRepository;
    @Mock
    private UserTestAnswerRepository userTestAnswerRepository;
    @Mock
    private UserTestAttemptRepository userTestAttemptRepository;
    @Mock
    private QuestionRepository questionRepository;
    @Mock
    private TestMapper testMapper;
    @Mock
    private TestPartMapper testPartMapper;
    @Mock
    private TestPartQuestionMapper testPartQuestionMapper;

    private AdminTestService service() {
        return new AdminTestService(
                testRepository,
                testPartRepository,
                testPartQuestionRepository,
                userTestAnswerRepository,
                userTestAttemptRepository,
                questionRepository,
                testMapper,
                testPartMapper,
                testPartQuestionMapper
        );
    }

    @org.junit.jupiter.api.Test
    void initStandardToeicPartsCreatesOnlyMissingReadingPartsForReadingOnlyTest() {
        org.example.backend.entity.Test test = new org.example.backend.entity.Test();
        test.setId(2L);
        test.setTestType("READING_ONLY");

        TestPart existingPart5 = new TestPart();
        existingPart5.setPartNumber(5);

        when(testRepository.findById(2L)).thenReturn(Optional.of(test));
        when(testPartRepository.findByTestIdOrderBySortOrderAsc(2L))
                .thenReturn(List.of(existingPart5));
        when(testPartMapper.toResponseList(any())).thenReturn(List.of(new TestPartResponse()));

        List<TestPartResponse> out = service().initStandardToeicParts(2L);
        assertEquals(1, out.size());
        // Should only create Part 6 and Part 7 (skipping Part 5)
        verify(testPartRepository, times(2)).save(any(TestPart.class));
    }

    @org.junit.jupiter.api.Test
    void assignQuestionsDeduplicatesExistingEntriesAndSyncReplacesCleanly() {
        TestPart part = new TestPart();
        part.setId(10L);
        part.setQuestionCount(1);

        Question q1 = new Question();
        q1.setId(101L);
        Question q2 = new Question();
        q2.setId(102L);

        TestPartQuestion existingRow = new TestPartQuestion();
        existingRow.setId(1L);
        existingRow.setTestPart(part);
        existingRow.setQuestion(q1);
        existingRow.setSortOrder(1);

        when(testPartRepository.findById(10L)).thenReturn(Optional.of(part));
        when(questionRepository.findAllById(any())).thenReturn(List.of(q1, q2));
        when(testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(10L))
                .thenReturn(List.of(existingRow));
        when(testPartQuestionMapper.toResponse(any())).thenReturn(new TestPartQuestionResponse());

        AssignTestPartQuestionsRequest req = new AssignTestPartQuestionsRequest();
        req.setQuestionIds(List.of(101L, 102L, 102L));

        AdminTestService svc = service();
        AtomicInteger savedCount = new AtomicInteger();
        when(testPartQuestionRepository.save(any(TestPartQuestion.class))).thenAnswer(inv -> {
            savedCount.incrementAndGet();
            return inv.getArgument(0);
        });

        svc.assignQuestionsToTestPart(10L, req);
        // Only q2 (102L) is new; q1 (101L) and duplicate 102L must be skipped
        assertEquals(1, savedCount.get());
        assertEquals(2, part.getQuestionCount());

        svc.syncTestPartQuestions(10L, req);
        verify(testPartRepository, times(2)).save(part);
    }

    @org.junit.jupiter.api.Test
    void autoPopulateFiltersByPrefixAssignsMatchingPartsAndSafelyNoOpsOnUnknownPrefix() {
        Test test = new Test();
        test.setId(5L);
        test.setTitle("De 01 Full");
        test.setTestType("FULL_TEST");

        TestPart part1 = new TestPart();
        part1.setId(51L);
        part1.setPartNumber(1);
        part1.setQuestionCount(0);

        TestPart part5 = new TestPart();
        part5.setId(55L);
        part5.setPartNumber(5);
        part5.setQuestionCount(1);

        Question t1Q1 = new Question();
        t1Q1.setId(1L);
        t1Q1.setPartNo(1);
        t1Q1.setQuestionGroupCode("T1_P01_Q01");
        t1Q1.setQuestionText("Office laptop");

        Question t1Q5 = new Question();
        t1Q5.setId(2L);
        t1Q5.setPartNo(5);
        t1Q5.setQuestionGroupCode("T1_P05_101");
        t1Q5.setQuestionText("Grammar gap");

        Question t2Q5 = new Question();
        t2Q5.setId(3L);
        t2Q5.setPartNo(5);
        t2Q5.setQuestionGroupCode("T2_P05_101");
        t2Q5.setQuestionText("Other test grammar");

        when(testRepository.findById(5L)).thenReturn(Optional.of(test));
        when(testPartRepository.findByTestIdOrderBySortOrderAsc(5L)).thenReturn(List.of(part1, part5));
        when(testPartRepository.findById(51L)).thenReturn(Optional.of(part1));
        when(testPartRepository.findById(55L)).thenReturn(Optional.of(part5));
        when(questionRepository.findAll(any(Sort.class))).thenReturn(List.of(t1Q1, t1Q5, t2Q5));
        when(questionRepository.findAllById(anyList())).thenAnswer(inv -> {
            List<Long> ids = inv.getArgument(0);
            if (ids.equals(List.of(1L))) return List.of(t1Q1);
            if (ids.equals(List.of(2L))) return List.of(t1Q5);
            return List.of();
        });
        when(testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(51L))
                .thenReturn(List.of(), List.of(new TestPartQuestion()));
        when(testPartQuestionRepository.findByTestPartIdOrderBySortOrderAsc(55L))
                .thenReturn(List.of(), List.of(new TestPartQuestion()));
        when(testPartQuestionMapper.toResponse(any())).thenReturn(new TestPartQuestionResponse());
        when(testPartMapper.toResponseList(any())).thenReturn(List.of(new TestPartResponse(), new TestPartResponse()));

        AutoPopulateTestRequest req = new AutoPopulateTestRequest();
        req.setGroupPrefix("T1_");
        req.setReplaceExisting(true);

        AdminTestService svc = service();
        AutoPopulateTestResponse resp = svc.autoPopulateTest(5L, req);

        assertEquals(2, resp.getTotalAssignedQuestions());
        assertEquals(1, resp.getAssignedPerPart().get(1));
        assertEquals(1, resp.getAssignedPerPart().get(5));
        assertEquals(1, part1.getQuestionCount());
        assertEquals(1, part5.getQuestionCount());

        // Typo prefix matching zero questions must not wipe existing parts
        AutoPopulateTestRequest missingReq = new AutoPopulateTestRequest();
        missingReq.setGroupPrefix("T99_");
        missingReq.setReplaceExisting(true);
        AutoPopulateTestResponse emptyResp = svc.autoPopulateTest(5L, missingReq);
        assertEquals(0, emptyResp.getTotalAssignedQuestions());
        assertEquals(1, part1.getQuestionCount());
    }
}
