package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.dto.request.ArenaAnswerRequest;
import org.example.backend.dto.request.ArenaCreateRoomRequest;
import org.example.backend.dto.request.ArenaMatchmakingRequest;
import org.example.backend.dto.request.ChangePasswordRequest;
import org.example.backend.dto.request.CreateQuestionOptionRequest;
import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.dto.request.CreateVideoNoteRequest;
import org.example.backend.dto.request.RefreshTokenRequest;
import org.example.backend.dto.request.SubmitTestAttemptRequest;
import org.example.backend.dto.response.AIExplainResponse;
import org.example.backend.dto.response.AdminAnalyticsOverviewResponse;
import org.example.backend.dto.response.ArenaLeaderboardResponse;
import org.example.backend.dto.response.ArenaMatchmakingStatusResponse;
import org.example.backend.dto.response.ArenaRoomResponse;
import org.example.backend.dto.response.AuthResponse;
import org.example.backend.dto.response.MistakeItemResponse;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.dto.response.TestAttemptResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.dto.response.VideoNoteResponse;
import org.example.backend.dto.response.VocabularyStudyItemResponse;
import org.example.backend.entity.AiQuestionExplanation;
import org.example.backend.entity.PracticeSet;
import org.example.backend.entity.Question;
import org.example.backend.entity.QuestionOption;
import org.example.backend.entity.Test;
import org.example.backend.entity.TestPart;
import org.example.backend.entity.TestPartQuestion;
import org.example.backend.entity.User;
import org.example.backend.entity.UserPracticeAnswer;
import org.example.backend.entity.UserPracticeAttempt;
import org.example.backend.entity.UserTestAnswer;
import org.example.backend.entity.UserTestAttempt;
import org.example.backend.entity.UserVocabularyProgress;
import org.example.backend.entity.VideoLesson;
import org.example.backend.entity.VideoNote;
import org.example.backend.entity.Vocabulary;
import org.example.backend.entity.VocabularyTopic;
import org.example.backend.enums.AttemptStatus;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.QuestionSourceType;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import org.example.backend.enums.VocabularyStatus;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.QuestionMapper;
import org.example.backend.mapper.UserMapper;
import org.example.backend.mapper.VideoNoteMapper;
import org.example.backend.repository.AiQuestionExplanationRepository;
import org.example.backend.repository.PracticeSetQuestionRepository;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestPartQuestionRepository;
import org.example.backend.repository.TestRepository;
import org.example.backend.repository.UserPracticeAnswerRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAnswerRepository;
import org.example.backend.repository.UserTestAttemptRepository;
import org.example.backend.repository.UserVocabularyProgressRepository;
import org.example.backend.repository.VideoLessonRepository;
import org.example.backend.repository.VideoNoteRepository;
import org.example.backend.repository.VocabularyRepository;
import org.example.backend.repository.VocabularyTopicRepository;
import org.example.backend.security.JwtService;
import org.example.backend.security.TokenBlacklistService;
import org.example.backend.security.UserPrincipal;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class Sprint6CoreServicesTest {

    private static User buildUser(Long id, String email, String fullName) {
        User user = new User();
        user.setId(id);
        user.setEmail(email);
        user.setFullName(fullName);
        user.setRole(UserRole.USER);
        user.setStatus(UserStatus.ACTIVE);
        user.setPremium(false);
        return user;
    }

    private static Question buildMcqQuestion(Long id, int partNo, String text, String correctLabel) {
        Question q = new Question();
        q.setId(id);
        q.setPartNo(partNo);
        q.setQuestionText(text);
        q.setSourceType(QuestionSourceType.ETS);
        List<QuestionOption> opts = List.of("A", "B", "C", "D").stream().map(label -> {
            QuestionOption opt = new QuestionOption();
            opt.setId(id * 10 + label.charAt(0));
            opt.setOptionLabel(label);
            opt.setOptionText("Option " + label);
            opt.setCorrect(label.equals(correctLabel));
            opt.setQuestion(q);
            return opt;
        }).toList();
        q.setOptions(opts);
        return q;
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class ToeicScoringAndBreakdownTests {
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
        void calculateToeicSectionScore_scalesAndClampsBetween5And495() {
            assertEquals(5, UserTestService.calculateToeicSectionScore(0, 100));
            assertEquals(495, UserTestService.calculateToeicSectionScore(100, 100));
            assertEquals(250, UserTestService.calculateToeicSectionScore(50, 100));
            assertEquals(0, UserTestService.calculateToeicSectionScore(0, 0));
        }

        @org.junit.jupiter.api.Test
        void submitAttempt_computesSectionScoresAndPartBreakdown() {
            User user = buildUser(1L, "learner@toeic.test", "Learner");
            Test test = new Test();
            test.setId(10L);
            test.setTitle("ETS Mini Test");

            UserTestAttempt attempt = new UserTestAttempt();
            attempt.setId(99L);
            attempt.setUser(user);
            attempt.setTest(test);
            attempt.setTotalQuestions(2);
            attempt.setStatus(AttemptStatus.IN_PROGRESS);

            TestPart p1 = new TestPart();
            p1.setId(101L);
            p1.setPartNumber(1);
            p1.setPartSection("LISTENING");
            TestPartQuestion tpq1 = new TestPartQuestion();
            tpq1.setId(1001L);
            tpq1.setTestPart(p1);
            tpq1.setQuestion(buildMcqQuestion(201L, 1, "Photo Q1", "A"));

            TestPart p5 = new TestPart();
            p5.setId(105L);
            p5.setPartNumber(5);
            p5.setPartSection("READING");
            TestPartQuestion tpq2 = new TestPartQuestion();
            tpq2.setId(1002L);
            tpq2.setTestPart(p5);
            tpq2.setQuestion(buildMcqQuestion(202L, 5, "Grammar Q2", "B"));

            SubmitTestAttemptRequest req = new SubmitTestAttemptRequest();
            SubmitTestAttemptRequest.AnswerSubmission a1 = new SubmitTestAttemptRequest.AnswerSubmission();
            a1.setTestPartQuestionId(1001L);
            a1.setSelectedLabel("A");
            SubmitTestAttemptRequest.AnswerSubmission a2 = new SubmitTestAttemptRequest.AnswerSubmission();
            a2.setTestPartQuestionId(1002L);
            a2.setSelectedLabel("C");
            req.setAnswers(List.of(a1, a2));

            when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
            when(userTestAttemptRepository.findById(99L)).thenReturn(Optional.of(attempt));
            when(testPartQuestionRepository.findAllById(List.of(1001L, 1002L))).thenReturn(List.of(tpq1, tpq2));

            TestAttemptResponse resp = userTestService.submitAttempt(user.getEmail(), 99L, req);

            assertEquals(495, resp.getListeningScore());
            assertEquals(5, resp.getReadingScore());
            assertEquals(500, resp.getToeicScore());
            assertEquals(2, resp.getPartBreakdown().size());
            assertEquals(100.0, resp.getPartBreakdown().get(0).getAccuracy());
            assertEquals(0.0, resp.getPartBreakdown().get(1).getAccuracy());
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class VocabularySm2ReviewTests {
        @Mock
        private VocabularyTopicRepository vocabularyTopicRepository;
        @Mock
        private VocabularyRepository vocabularyRepository;
        @Mock
        private UserVocabularyProgressRepository userVocabularyProgressRepository;
        @Mock
        private UserRepository userRepository;
        @InjectMocks
        private VocabularyReviewService vocabularyReviewService;

        @org.junit.jupiter.api.Test
        void reviewVocabulary_progressesSm2IntervalsAndResetsOnAgain() {
            User user = buildUser(2L, "sm2@toeic.test", "SM2 Learner");
            VocabularyTopic topic = new VocabularyTopic();
            topic.setId(5L);
            topic.setName("Business");
            Vocabulary vocab = new Vocabulary();
            vocab.setId(50L);
            vocab.setWord("deadline");
            vocab.setMeaningVi("hạn chót");
            vocab.setTopic(topic);

            UserVocabularyProgress stored = new UserVocabularyProgress();
            stored.setUser(user);
            stored.setVocabulary(vocab);
            stored.setEaseFactor(2.5);
            stored.setRepetitions(0);
            stored.setIntervalDays(0);
            stored.setFamiliarityLevel(0);
            stored.setStatus(VocabularyStatus.LEARNING);

            when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
            when(vocabularyRepository.findById(50L)).thenReturn(Optional.of(vocab));
            when(userVocabularyProgressRepository.findByUserIdAndVocabularyId(2L, 50L)).thenReturn(Optional.of(stored));
            when(userVocabularyProgressRepository.save(any(UserVocabularyProgress.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            VocabularyStudyItemResponse first = vocabularyReviewService.reviewVocabulary(user.getEmail(), 50L, "GOOD");
            assertEquals(1, first.getRepetitions());
            assertEquals(1, first.getIntervalDays());
            assertEquals(VocabularyStatus.REVIEWING, first.getStatus());

            VocabularyStudyItemResponse second = vocabularyReviewService.reviewVocabulary(user.getEmail(), 50L, "GOOD");
            assertEquals(2, second.getRepetitions());
            assertEquals(6, second.getIntervalDays());

            VocabularyStudyItemResponse forgot = vocabularyReviewService.reviewVocabulary(user.getEmail(), 50L,
                    "AGAIN");
            assertEquals(0, forgot.getRepetitions());
            assertEquals(1, forgot.getIntervalDays());
            assertEquals(VocabularyStatus.LEARNING, forgot.getStatus());
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class VideoNoteCrudTests {
        @Mock
        private VideoNoteRepository videoNoteRepository;
        @Mock
        private VideoLessonRepository videoLessonRepository;
        @Mock
        private UserRepository userRepository;
        @Mock
        private VideoNoteMapper videoNoteMapper;
        @InjectMocks
        private VideoNoteService videoNoteService;

        @org.junit.jupiter.api.Test
        void createNote_clampsNegativeTimestampAndTrimsNote() {
            User user = buildUser(3L, "note@toeic.test", "Note Taker");
            VideoLesson lesson = new VideoLesson();
            lesson.setId(15L);
            lesson.setTitle("Part 2 Traps");

            CreateVideoNoteRequest req = new CreateVideoNoteRequest();
            req.setTimestampSeconds(-10);
            req.setNoteText("  Watch out for similar sounding words  ");

            when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
            when(videoLessonRepository.findById(15L)).thenReturn(Optional.of(lesson));
            when(videoNoteRepository.save(any(VideoNote.class))).thenAnswer(inv -> {
                VideoNote saved = inv.getArgument(0);
                saved.setId(88L);
                return saved;
            });
            when(videoNoteMapper.toResponse(any(VideoNote.class))).thenAnswer(inv -> {
                VideoNote n = inv.getArgument(0);
                VideoNoteResponse r = new VideoNoteResponse();
                r.setId(n.getId());
                r.setTimestampSeconds(n.getTimestampSeconds());
                r.setNoteText(n.getNoteText());
                return r;
            });

            VideoNoteResponse response = videoNoteService.createNote(user.getEmail(), 15L, req);
            assertEquals(0, response.getTimestampSeconds());
            assertEquals("Watch out for similar sounding words", response.getNoteText());
        }

        @org.junit.jupiter.api.Test
        void deleteNote_throwsWhenNotOwned() {
            User user = buildUser(3L, "note@toeic.test", "Note Taker");
            when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
            when(videoNoteRepository.findByIdAndUserId(999L, 3L)).thenReturn(Optional.empty());

            AppException ex = assertThrows(AppException.class,
                    () -> videoNoteService.deleteNote(user.getEmail(), 999L));
            assertEquals(ErrorCode.VIDEO_NOTE_NOT_FOUND, ex.getErrorCode());
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class MistakeBankAndAiCacheTests {
        @Mock
        private UserRepository userRepository;
        @Mock
        private UserTestAnswerRepository userTestAnswerRepository;
        @Mock
        private UserPracticeAnswerRepository userPracticeAnswerRepository;
        @InjectMocks
        private MistakeBankService mistakeBankService;

        @Mock
        private RestTemplate restTemplate;
        @Mock
        private ObjectMapper objectMapper;
        @Mock
        private TestPartQuestionRepository testPartQuestionRepository;
        @Mock
        private PracticeSetQuestionRepository practiceSetQuestionRepository;
        @Mock
        private QuestionRepository questionRepository;
        @Mock
        private AiQuestionExplanationRepository aiQuestionExplanationRepository;
        @InjectMocks
        private OpenAIAnswerExplainService openAIAnswerExplainService;

        @org.junit.jupiter.api.Test
        void getMyMistakes_aggregatesWrongAnswersAndCountsDuplicates() {
            User user = buildUser(4L, "mistake@toeic.test", "Mistake User");
            Question q = buildMcqQuestion(301L, 5, "Company ______ is mandatory.", "B");

            Test test = new Test();
            test.setTitle("Test 1");
            UserTestAttempt tAttempt = new UserTestAttempt();
            tAttempt.setTest(test);
            tAttempt.setSubmittedAt(LocalDateTime.now().minusDays(1));
            TestPartQuestion tpq = new TestPartQuestion();
            tpq.setQuestion(q);
            UserTestAnswer testWrong = new UserTestAnswer();
            testWrong.setAttempt(tAttempt);
            testWrong.setTestPartQuestion(tpq);
            testWrong.setSelectedLabel("A");

            PracticeSet pSet = new PracticeSet();
            pSet.setTitle("Practice Part 5");
            UserPracticeAttempt pAttempt = new UserPracticeAttempt();
            pAttempt.setPracticeSet(pSet);
            UserPracticeAnswer practiceWrong = new UserPracticeAnswer();
            practiceWrong.setAttempt(pAttempt);
            practiceWrong.setQuestion(q);
            practiceWrong.setSelectedOption(q.getOptions().get(2));
            practiceWrong.setAnsweredAt(LocalDateTime.now());

            when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
            when(userTestAnswerRepository.findIncorrectAnswersByUserId(4L)).thenReturn(List.of(testWrong));
            when(userPracticeAnswerRepository.findIncorrectAnswersByUserId(4L)).thenReturn(List.of(practiceWrong));

            List<MistakeItemResponse> items = mistakeBankService.getMyMistakes(user.getEmail());
            assertEquals(1, items.size());
            assertEquals(2, items.get(0).getWrongCount());
            assertEquals("C", items.get(0).getLastSelectedLabel());
            assertEquals("B", items.get(0).getCorrectLabel());
        }

        @org.junit.jupiter.api.Test
        void explainRawQuestion_returnsCachedExplanationWithoutRemoteCall() {
            Question q = buildMcqQuestion(302L, 5, "Sample Q", "D");
            AiQuestionExplanation cached = new AiQuestionExplanation();
            cached.setCorrectAnswer("D");
            cached.setExplanation("Cached grammar rule.");
            cached.setTips("Look at preposition.");

            when(questionRepository.findById(302L)).thenReturn(Optional.of(q));
            when(aiQuestionExplanationRepository.findFirstByQuestionIdAndSelectedLabelAndExplainType(302L, "A", "BOTH"))
                    .thenReturn(Optional.of(cached));

            AIExplainResponse res = openAIAnswerExplainService.explainRawQuestion(302L, "a", "both");
            assertEquals("D", res.getCorrectAnswer());
            assertEquals("Cached grammar rule.", res.getExplanation());
            verifyNoInteractions(restTemplate);
        }

        @org.junit.jupiter.api.Test
        void explainRawQuestion_callsOpenAiEndpointAndExtractsTips() throws Exception {
            Question q = buildMcqQuestion(303L, 5, "The manager ______ the report.", "B");
            OpenAIAnswerExplainService service = new OpenAIAnswerExplainService(
                    restTemplate,
                    new ObjectMapper(),
                    testPartQuestionRepository,
                    practiceSetQuestionRepository,
                    questionRepository,
                    aiQuestionExplanationRepository);
            ReflectionTestUtils.setField(service, "apiKey", "sk-openai-test");
            ReflectionTestUtils.setField(service, "model", "gpt-4o-mini");
            ReflectionTestUtils.setField(service, "baseUrl", "https://api.openai.com/v1/chat/completions");

            when(questionRepository.findById(303L)).thenReturn(Optional.of(q));
            when(aiQuestionExplanationRepository.findFirstByQuestionIdAndSelectedLabelAndExplainType(303L, "A", "BOTH"))
                    .thenReturn(Optional.empty());
            when(restTemplate.exchange(
                    eq("https://api.openai.com/v1/chat/completions"),
                    eq(HttpMethod.POST),
                    any(HttpEntity.class),
                    eq(String.class))).thenReturn(ResponseEntity.ok("""
                            {
                              "choices": [
                                {
                                  "message": {
                                    "content": "Đáp án B đúng về thì.\\nMẹo làm bài: Chú ý dấu hiệu thì."
                                  }
                                }
                              ]
                            }
                            """));

            AIExplainResponse res = service.explainRawQuestion(303L, "a", "both");

            ArgumentCaptor<HttpEntity<?>> captor = ArgumentCaptor.forClass(HttpEntity.class);
            verify(restTemplate).exchange(
                    eq("https://api.openai.com/v1/chat/completions"),
                    eq(HttpMethod.POST),
                    captor.capture(),
                    eq(String.class));
            assertEquals("Bearer sk-openai-test", captor.getValue().getHeaders().getFirst("Authorization"));
            Map<?, ?> body = (Map<?, ?>) captor.getValue().getBody();
            assertEquals("gpt-4o-mini", body.get("model"));
            assertTrue(res.getExplanation().contains("Đáp án B đúng"));
            assertTrue(res.getTips().startsWith("Mẹo làm bài:"));
            verify(aiQuestionExplanationRepository).save(any(AiQuestionExplanation.class));
        }

        @org.junit.jupiter.api.Test
        void explainRawQuestion_throwsAiApiErrorWhenOpenAiKeyMissing() {
            Question q = buildMcqQuestion(304L, 5, "Sample missing key", "C");
            ReflectionTestUtils.setField(openAIAnswerExplainService, "apiKey", "");

            when(questionRepository.findById(304L)).thenReturn(Optional.of(q));
            when(aiQuestionExplanationRepository.findFirstByQuestionIdAndSelectedLabelAndExplainType(304L, "NONE",
                    "BOTH"))
                    .thenReturn(Optional.empty());

            AppException ex = assertThrows(AppException.class,
                    () -> openAIAnswerExplainService.explainRawQuestion(304L, null, null));
            assertEquals(ErrorCode.AI_API_ERROR, ex.getErrorCode());
            verifyNoInteractions(restTemplate);
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class AuthRefreshAndPasswordTests {
        @Mock
        private UserRepository userRepository;
        @Mock
        private PasswordEncoder passwordEncoder;
        @Mock
        private AuthenticationManager authenticationManager;
        @Mock
        private JwtService jwtService;
        @Mock
        private TokenBlacklistService tokenBlacklistService;
        @Mock
        private UserMapper userMapper;
        @Mock
        private UserLoginStreakService userLoginStreakService;
        @InjectMocks
        private AuthService authService;

        @org.junit.jupiter.api.Test
        void refresh_rotatesTokenAndBlacklistsOldRefreshToken() {
            User user = buildUser(5L, "auth@toeic.test", "Auth User");
            RefreshTokenRequest req = new RefreshTokenRequest();
            req.setRefreshToken("Bearer old-refresh-token");

            when(tokenBlacklistService.isTokenRevoked("old-refresh-token")).thenReturn(false);
            when(jwtService.extractUsername("old-refresh-token")).thenReturn("auth@toeic.test");
            when(jwtService.isRefreshTokenValid("old-refresh-token", "auth@toeic.test")).thenReturn(true);
            when(userRepository.findByEmail("auth@toeic.test")).thenReturn(Optional.of(user));
            when(jwtService.generateToken(any(UserPrincipal.class))).thenReturn("new-access-jwt");
            when(jwtService.generateRefreshToken(any(UserPrincipal.class))).thenReturn("new-refresh-jwt");
            when(jwtService.getJwtExpirationMs()).thenReturn(3600000L);
            when(userMapper.toResponse(user)).thenReturn(new UserResponse());

            AuthResponse response = authService.refresh(req);
            verify(tokenBlacklistService).revokeToken("old-refresh-token");
            assertEquals("new-access-jwt", response.getAccessToken());
            assertEquals("new-refresh-jwt", response.getRefreshToken());
        }

        @org.junit.jupiter.api.Test
        void changePassword_encodesAndSavesNewPassword() {
            User user = buildUser(5L, "auth@toeic.test", "Auth User");
            user.setPasswordHash("old-hash");
            ChangePasswordRequest req = new ChangePasswordRequest();
            req.setCurrentPassword("oldpass");
            req.setNewPassword("newpass123");

            when(userRepository.findByEmail("auth@toeic.test")).thenReturn(Optional.of(user));
            when(passwordEncoder.matches("oldpass", "old-hash")).thenReturn(true);
            when(passwordEncoder.encode("newpass123")).thenReturn("new-encoded-hash");

            authService.changePassword("auth@toeic.test", req);
            assertEquals("new-encoded-hash", user.getPasswordHash());
            verify(userRepository).save(user);
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class AdminBulkImportAndAnalyticsTests {
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
        private UserTestAttemptRepository userTestAttemptRepository;
        @Mock
        private UserMapper userMapper;
        @InjectMocks
        private AdminAnalyticsService adminAnalyticsService;

        @org.junit.jupiter.api.Test
        void bulkCreateQuestions_savesBatchAndRejectsEmptyList() {
            assertThrows(AppException.class, () -> adminQuestionBankService.bulkCreateQuestions(List.of()));

            CreateQuestionRequest qReq = new CreateQuestionRequest();
            qReq.setPartNo(5);
            qReq.setQuestionText("The CEO approved the ______.");
            qReq.setSourceType(QuestionSourceType.ETS);
            qReq.setOptions(List.of("A", "B", "C", "D").stream().map(label -> {
                CreateQuestionOptionRequest o = new CreateQuestionOptionRequest();
                o.setOptionLabel(label);
                o.setOptionText("Option " + label);
                o.setCorrect("B".equals(label));
                return o;
            }).toList());

            when(questionRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
            when(questionMapper.toResponseList(anyList())).thenReturn(List.of(new QuestionResponse()));

            List<QuestionResponse> created = adminQuestionBankService.bulkCreateQuestions(List.of(qReq));
            assertEquals(1, created.size());
        }

        @org.junit.jupiter.api.Test
        void getOverview_computesKpiMetricsAccurately() {
            User proUser = buildUser(1L, "u1@toeic.test", "U1");
            proUser.setPremium(true);
            proUser.setPlanTier("PRO");
            proUser.setPlanExpiresAt(LocalDateTime.now().plusDays(15));
            proUser.setCurrentLoginStreak(4);

            User plusUser = buildUser(3L, "u3@toeic.test", "U3");
            plusUser.setPlanTier("PLUS");
            plusUser.setPlanExpiresAt(LocalDateTime.now().plusDays(10));

            User expiredUser = buildUser(4L, "u4@toeic.test", "U4");
            expiredUser.setPremium(true);
            expiredUser.setPlanTier("PLUS");
            expiredUser.setPlanExpiresAt(LocalDateTime.now().minusDays(2));

            User blockedUser = buildUser(2L, "u2@toeic.test", "U2");
            blockedUser.setStatus(UserStatus.BLOCKED);

            Test published = new Test();
            published.setPublished(true);
            UserTestAttempt submitted = new UserTestAttempt();
            submitted.setStatus(AttemptStatus.SUBMITTED);
            submitted.setScore(80.0);
            submitted.setToeicScore(780);

            when(userRepository.findAll()).thenReturn(List.of(proUser, plusUser, expiredUser, blockedUser));
            when(testRepository.findAll()).thenReturn(List.of(published));
            when(userTestAttemptRepository.findAll()).thenReturn(List.of(submitted));
            when(questionRepository.count()).thenReturn(25L);

            AdminAnalyticsOverviewResponse overview = adminAnalyticsService.getOverview();
            assertEquals(4, overview.getTotalUsers());
            assertEquals(3, overview.getActiveUsers());
            assertEquals(1, overview.getBlockedUsers());
            assertEquals(1, overview.getPlusUsers());
            assertEquals(1, overview.getProUsers());
            assertEquals(2, overview.getFreeUsers());
            assertEquals(2, overview.getPremiumUsers());
            assertEquals(25, overview.getTotalQuestions());
            assertEquals(780, overview.getAverageToeicScore());
            assertEquals(780, overview.getHighestToeicScore());
            assertEquals(1, overview.getBand650To849());

            when(userRepository.findById(1L)).thenReturn(Optional.of(proUser));
            when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
            UserResponse mapped = new UserResponse();
            mapped.setVerified(true);
            mapped.setPlanTier("PLUS");
            when(userMapper.toResponse(any(User.class))).thenReturn(mapped);

            UserResponse verifiedRes = adminAnalyticsService.updateUserVerified(1L, true);
            assertTrue(Boolean.TRUE.equals(verifiedRes.getVerified()));
            assertTrue(Boolean.TRUE.equals(proUser.getVerified()));

            UserResponse planRes = adminAnalyticsService.updateUserPlan(1L, "PLUS", 30);
            assertEquals("PLUS", planRes.getPlanTier());
            assertEquals("PLUS", proUser.getPlanTier());
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class ArenaRoomLifecycleTests {
        @Mock
        private QuestionRepository questionRepository;
        @Mock
        private UserRepository userRepository;
        @InjectMocks
        private ArenaService arenaService;

        @org.junit.jupiter.api.Test
        void createJoinAndSubmitAnswer_updatesScoresAndFinishesMatch() {
            User host = buildUser(10L, "host@toeic.test", "Host");
            User guest = buildUser(11L, "guest@toeic.test", "Guest");

            Question q = buildMcqQuestion(500L, 5, "Arena Question", "A");
            when(questionRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(q));
            when(userRepository.findByEmail("host@toeic.test")).thenReturn(Optional.of(host));
            when(userRepository.findByEmail("guest@toeic.test")).thenReturn(Optional.of(guest));

            ArenaRoomResponse created = arenaService.createRoom("host@toeic.test", 3);
            assertEquals("WAITING", created.getStatus());
            assertNotNull(created.getRoomCode());
            assertEquals(3, created.getTotalQuestions());
            // Cannot start playing solo before an opponent enters
            assertThrows(AppException.class,
                    () -> arenaService.submitAnswer("host@toeic.test", created.getRoomCode(), 500L, "A"));

            ArenaRoomResponse joined = arenaService.joinRoom("guest@toeic.test", created.getRoomCode());
            assertEquals("IN_PROGRESS", joined.getStatus());
            assertEquals("QUESTION", joined.getRoundPhase());
            assertEquals(2, joined.getPlayers().size());
            assertTrue(joined.getRemainingSeconds() > 0);
            assertNotNull(joined.getQuestions().get(1).getQuestionTranslationVi());
            org.junit.jupiter.api.Assertions
                    .assertFalse(joined.getQuestions().get(1).getQuestionTranslationVi().isBlank());

            ArenaRoomResponse afterFirst = arenaService.submitAnswer("host@toeic.test", created.getRoomCode(), 500L,
                    "A");
            assertTrue(afterFirst.getPlayers().stream().anyMatch(p -> p.getScore() == 10));
        }

        @org.junit.jupiter.api.Test
        void privateRoomRequiresPasswordAndVocabMatchmakingPairsTwoPlayersWithDiamonds() {
            User alice = buildUser(20L, "alice@toeic.test", "Alice");
            alice.setDiamonds(50);
            alice.setArenaElo(1000);
            User bob = buildUser(21L, "bob@toeic.test", "Bob");
            bob.setDiamonds(50);
            bob.setArenaElo(1000);

            Vocabulary vocab = new Vocabulary();
            vocab.setId(901L);
            vocab.setWord("satisfaction");
            vocab.setPartOfSpeech("noun");
            vocab.setIpa("/ˌsæt.ɪsˈfæk.ʃən/");
            vocab.setMeaningVi("sự hài lòng");
            vocab.setMeaningEn("The happy feeling when you get what you wanted.");
            vocab.setExampleSentence("Customer satisfaction is our top priority.");
            vocab.setExampleTranslation("Sự hài lòng của khách hàng là ưu tiên hàng đầu của chúng tôi.");

            VocabularyRepository vocabRepo = mock(VocabularyRepository.class);
            when(vocabRepo.findAllByOrderByIdAsc()).thenReturn(List.of(vocab));
            org.springframework.test.util.ReflectionTestUtils.setField(arenaService, "vocabularyRepository", vocabRepo);

            when(userRepository.findByEmail("alice@toeic.test")).thenReturn(Optional.of(alice));
            when(userRepository.findByEmail("bob@toeic.test")).thenReturn(Optional.of(bob));
            when(userRepository.findTop20ByOrderByArenaEloDescArenaWinsDescDiamondsDesc())
                    .thenReturn(List.of(alice, bob));

            // 1. Private room enforces password & waits in lobby
            ArenaCreateRoomRequest privReq = new ArenaCreateRoomRequest();
            privReq.setMode("VOCAB");
            privReq.setQuestionCount(3);
            privReq.setPrivateRoom(true);
            privReq.setPassword("toeic99");
            ArenaRoomResponse privRoom = arenaService.createRoom("alice@toeic.test", privReq);
            assertTrue(privRoom.isPrivateRoom());
            assertTrue(privRoom.isHasPassword());
            assertEquals("WAITING", privRoom.getStatus());

            AppException missingPwd = assertThrows(AppException.class,
                    () -> arenaService.joinRoom("bob@toeic.test", privRoom.getRoomCode(), ""));
            assertEquals(ErrorCode.ARENA_ROOM_PASSWORD_REQUIRED, missingPwd.getErrorCode());

            AppException wrongPwd = assertThrows(AppException.class,
                    () -> arenaService.joinRoom("bob@toeic.test", privRoom.getRoomCode(), "wrong"));
            assertEquals(ErrorCode.ARENA_ROOM_WRONG_PASSWORD, wrongPwd.getErrorCode());

            ArenaRoomResponse joinedPriv = arenaService.joinRoom("bob@toeic.test", privRoom.getRoomCode(), "toeic99");
            assertEquals("IN_PROGRESS", joinedPriv.getStatus());
            assertEquals("VOCAB", joinedPriv.getMode());
            assertEquals(20, joinedPriv.getRoundDurationSeconds());
            assertNull(joinedPriv.getCurrentRevealWord(),
                    "Target word must stay hidden while QUESTION phase is active");
            org.junit.jupiter.api.Assertions.assertFalse(joinedPriv.isAudioHintUnlocked(),
                    "Pronunciation/audio hint must wait until final 7 seconds");
            assertNull(joinedPriv.getAudioHintWord());
            assertNull(joinedPriv.getQuestions().get(0).getPronunciation());
            assertEquals(12, joinedPriv.getQuestions().get(0).getWordLength());
            assertTrue(joinedPriv.getQuestions().get(0).getMaskedExample().contains("************"));
            assertEquals("sự hài lòng", joinedPriv.getQuestions().get(0).getMeaningVi());
            assertNotNull(joinedPriv.getQuestions().get(0).getExplanationVi());
            assertEquals("Sự hài lòng của khách hàng là ưu tiên hàng đầu của chúng tôi.",
                    joinedPriv.getQuestions().get(0).getExampleTranslation());
            assertNotNull(joinedPriv.getQuestions().get(1).getMeaningVi());
            assertNotNull(joinedPriv.getQuestions().get(1).getExplanationVi());
            assertNotNull(joinedPriv.getQuestions().get(1).getExampleTranslation());

            // Simulate entering last 7 seconds before either player solves -> pronunciation
            // & audio hint unlock automatically
            @SuppressWarnings("unchecked")
            Map<String, Object> roomsMap = (Map<String, Object>) org.springframework.test.util.ReflectionTestUtils
                    .getField(arenaService, "rooms");
            Object roomStateObj = roomsMap.get(privRoom.getRoomCode());
            long now = System.currentTimeMillis();
            org.springframework.test.util.ReflectionTestUtils.setField(roomStateObj, "roundStartedAtEpochMs",
                    now - 15_000L);
            org.springframework.test.util.ReflectionTestUtils.setField(roomStateObj, "roundEndsAtEpochMs",
                    now + 5_000L);
            ArenaRoomResponse lateHintRoom = arenaService.getRoom("alice@toeic.test", privRoom.getRoomCode());
            assertTrue(lateHintRoom.isAudioHintUnlocked(), "Pronunciation & audio hint must unlock in final 7s");
            assertEquals("satisfaction", lateHintRoom.getAudioHintWord());
            assertEquals("/ˌsæt.ɪsˈfæk.ʃən/", lateHintRoom.getQuestions().get(0).getPronunciation());

            // Players can fire fun 1v1 taunt emotes live during match
            ArenaRoomResponse emotedByAlice = arenaService.sendEmote("alice@toeic.test", privRoom.getRoomCode(), "SMIRK");
            var aliceStateAfterEmote = emotedByAlice.getPlayers().stream()
                    .filter(p -> "alice@toeic.test".equals(p.getEmail()))
                    .findFirst()
                    .orElseThrow();
            assertNotNull(aliceStateAfterEmote.getActiveEmote());
            assertEquals("SMIRK", aliceStateAfterEmote.getActiveEmote().getEmoteCode());
            assertEquals("😏", aliceStateAfterEmote.getActiveEmote().getEmoji());
            assertThrows(AppException.class,
                    () -> arenaService.sendEmote("alice@toeic.test", privRoom.getRoomCode(), "INVALID_CODE"));

            // Bob solves Round 1 -> enters REVEAL & earns diamonds
            ArenaAnswerRequest ansReq = new ArenaAnswerRequest();
            ansReq.setQuestionId(901L);
            ansReq.setTextAnswer("satisfaction");
            ArenaRoomResponse afterVocabSolve = arenaService.submitAnswer("bob@toeic.test", privRoom.getRoomCode(),
                    ansReq);
            assertEquals("REVEAL", afterVocabSolve.getRoundPhase());
            assertEquals("satisfaction", afterVocabSolve.getCurrentRevealWord());
            assertTrue(afterVocabSolve.isAudioHintUnlocked());
            assertEquals("/ˌsæt.ɪsˈfæk.ʃən/", afterVocabSolve.getQuestions().get(0).getPronunciation());
            assertEquals("Bob", afterVocabSolve.getRoundWinnerName());
            assertTrue(afterVocabSolve.getRoundDiamondReward() >= 1);

            arenaService.leaveRoom("alice@toeic.test", privRoom.getRoomCode());
            arenaService.leaveRoom("bob@toeic.test", privRoom.getRoomCode());

            // 2. Random matchmaking pairs two players searching in same mode
            ArenaMatchmakingRequest mmReq = new ArenaMatchmakingRequest();
            mmReq.setMode("VOCAB");
            mmReq.setQuestionCount(3);

            ArenaMatchmakingStatusResponse firstSearch = arenaService.joinMatchmaking("alice@toeic.test", mmReq);
            assertEquals("SEARCHING", firstSearch.getStatus());
            assertNull(firstSearch.getRoom());

            ArenaMatchmakingStatusResponse secondMatch = arenaService.joinMatchmaking("bob@toeic.test", mmReq);
            assertEquals("MATCHED", secondMatch.getStatus());
            assertNotNull(secondMatch.getRoom());
            assertEquals("RANDOM", secondMatch.getRoom().getMatchType());
            assertEquals("IN_PROGRESS", secondMatch.getRoom().getStatus());
            assertEquals(2, secondMatch.getRoom().getPlayers().size());

            ArenaMatchmakingStatusResponse alicePoll = arenaService.getMatchmakingStatus("alice@toeic.test");
            assertEquals("MATCHED", alicePoll.getStatus());
            assertEquals(secondMatch.getRoom().getRoomCode(), alicePoll.getRoom().getRoomCode());

            ArenaLeaderboardResponse lb = arenaService.getLeaderboard("alice@toeic.test");
            assertEquals(2, lb.getEntries().size());
        }
    }
}
