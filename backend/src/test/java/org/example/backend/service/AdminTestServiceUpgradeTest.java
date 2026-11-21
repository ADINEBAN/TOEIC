package org.example.backend.service;

import org.example.backend.dto.request.AssignTestPartQuestionsRequest;
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

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
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
}
