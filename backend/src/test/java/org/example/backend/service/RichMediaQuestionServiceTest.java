package org.example.backend.service;

import org.example.backend.dto.request.CreateQuestionOptionRequest;
import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.dto.response.TestResponse;
import org.example.backend.entity.Question;
import org.example.backend.entity.QuestionOption;
import org.example.backend.entity.Test;
import org.example.backend.entity.TestPart;
import org.example.backend.entity.TestPartQuestion;
import org.example.backend.enums.QuestionSourceType;
import org.example.backend.mapper.QuestionMapper;
import org.example.backend.repository.PracticeSetQuestionRepository;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestPartQuestionRepository;
import org.example.backend.repository.TestRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAnswerRepository;
import org.example.backend.repository.UserTestAttemptRepository;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RichMediaQuestionServiceTest {

    @Mock
    private QuestionRepository questionRepository;

    @Mock
    private PracticeSetQuestionRepository practiceSetQuestionRepository;

    @Mock
    private QuestionMapper questionMapper;

    @InjectMocks
    private AdminQuestionBankService adminQuestionBankService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TestRepository testRepository;

    @Mock
    private TestPartQuestionRepository testPartQuestionRepository;

    @Mock
    private UserTestAttemptRepository userTestAttemptRepository;

    @Mock
    private UserTestAnswerRepository userTestAnswerRepository;

    @InjectMocks
    private UserTestService userTestService;

    @org.junit.jupiter.api.Test
    void createQuestion_persistsRichMediaAndGroupFields() {
        CreateQuestionRequest request = new CreateQuestionRequest();
        request.setPartNo(3);
        request.setQuestionText("Where are the speakers?");
        request.setExplanation("Look at the first turn in the dialogue.");
        request.setDifficultyLevel("INTERMEDIATE");
        request.setSourceType(QuestionSourceType.ETS);
        request.setSourceYear(2025);
        request.setAudioUrl(" https://cdn.example.com/part3-q32.mp3 ");
        request.setImageUrl(" https://cdn.example.com/part3-chart.png ");
        request.setPassageText("Flight Schedule Table");
        request.setTranscript("M: Did the flight to Seoul depart?");
        request.setQuestionGroupCode("ETS25-P3-G01");

        CreateQuestionOptionRequest a = new CreateQuestionOptionRequest();
        a.setOptionLabel("A");
        a.setOptionText("At an airport");
        a.setCorrect(true);
        CreateQuestionOptionRequest b = new CreateQuestionOptionRequest();
        b.setOptionLabel("B");
        b.setOptionText("At a hotel");
        b.setCorrect(false);
        CreateQuestionOptionRequest c = new CreateQuestionOptionRequest();
        c.setOptionLabel("C");
        c.setOptionText("In a bank");
        c.setCorrect(false);
        CreateQuestionOptionRequest d = new CreateQuestionOptionRequest();
        d.setOptionLabel("D");
        d.setOptionText("On a train");
        d.setCorrect(false);
        request.setOptions(List.of(a, b, c, d));

        when(questionRepository.save(any(Question.class))).thenAnswer(inv -> {
            Question saved = inv.getArgument(0);
            QuestionResponse mockResp = new QuestionResponse();
            mockResp.setAudioUrl(saved.getAudioUrl());
            mockResp.setImageUrl(saved.getImageUrl());
            mockResp.setPassageText(saved.getPassageText());
            mockResp.setTranscript(saved.getTranscript());
            mockResp.setQuestionGroupCode(saved.getQuestionGroupCode());
            when(questionMapper.toResponse(saved)).thenReturn(mockResp);
            return saved;
        });

        QuestionResponse response = adminQuestionBankService.createQuestion(request);
        assertEquals("https://cdn.example.com/part3-q32.mp3", response.getAudioUrl());
        assertEquals("https://cdn.example.com/part3-chart.png", response.getImageUrl());
        assertEquals("Flight Schedule Table", response.getPassageText());
        assertEquals("M: Did the flight to Seoul depart?", response.getTranscript());
        assertEquals("ETS25-P3-G01", response.getQuestionGroupCode());
    }

    @org.junit.jupiter.api.Test
    void getTestById_mapsRichMediaWithoutLeakingAnswerKey() {
        Question q = new Question();
        q.setId(10L);
        q.setPartNo(1);
        q.setQuestionText("Look at the picture and choose the best description.");
        q.setAudioUrl("https://cdn.example.com/part1-q1.mp3");
        q.setImageUrl("https://cdn.example.com/part1-q1.jpg");
        q.setPassageText(null);
        q.setTranscript("Hidden transcript during live exam");
        q.setQuestionGroupCode("P1-PHOTO-01");

        QuestionOption optA = new QuestionOption();
        optA.setId(1L);
        optA.setOptionLabel("A");
        optA.setOptionText("She is typing on a laptop.");
        optA.setCorrect(true);
        q.setOptions(List.of(optA));

        TestPartQuestion tpq = new TestPartQuestion();
        tpq.setId(100L);
        tpq.setSortOrder(1);
        tpq.setQuestion(q);

        TestPart part = new TestPart();
        part.setId(5L);
        part.setPartName("Listening Part 1");
        part.setPartNumber(1);
        part.setQuestionCount(1);
        part.setQuestions(List.of(tpq));

        Test test = new Test();
        test.setId(1L);
        test.setTitle("ETS Mock Test 1");
        test.setTotalDurationMinutes(120);
        test.setPublished(true);
        test.setParts(List.of(part));

        when(testRepository.findById(1L)).thenReturn(Optional.of(test));

        TestResponse result = userTestService.getTestById(1L);
        assertNotNull(result);
        var mappedQ = result.getParts().get(0).getQuestions().get(0);
        assertEquals("https://cdn.example.com/part1-q1.mp3", mappedQ.getAudioUrl());
        assertEquals("https://cdn.example.com/part1-q1.jpg", mappedQ.getImageUrl());
        assertEquals("P1-PHOTO-01", mappedQ.getQuestionGroupCode());
        assertEquals(null, mappedQ.getOptions().get(0).getCorrect());
    }
}
