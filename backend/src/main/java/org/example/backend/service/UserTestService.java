package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.SubmitTestAttemptRequest;
import org.example.backend.dto.response.TestAttemptResponse;
import org.example.backend.entity.*;
import org.example.backend.enums.AttemptStatus;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserTestService {

    private final UserRepository userRepository;
    private final TestRepository testRepository;
    private final TestPartQuestionRepository testPartQuestionRepository;
    private final UserTestAttemptRepository userTestAttemptRepository;
    private final UserTestAnswerRepository userTestAnswerRepository;

    @Autowired(required = false)
    private SimpMessagingTemplate messagingTemplate;

    @Autowired(required = false)
    private DiamondRewardService diamondRewardService;

    @Transactional(readOnly = true)
    public List<org.example.backend.dto.response.TestResponse> getPublishedTests() {
        return testRepository.findByPublishedTrueOrderByCreatedAtDesc()
                .stream()
                .map(t -> {
                    org.example.backend.dto.response.TestResponse r = new org.example.backend.dto.response.TestResponse();
                    r.setId(t.getId());
                    r.setTitle(t.getTitle());
                    r.setDescription(t.getDescription());
                    r.setPublished(t.getPublished());
                    r.setTestType(t.getTestType());
                    r.setTotalDurationMinutes(t.getTotalDurationMinutes());
                    return r;
                }).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public org.example.backend.dto.response.TestResponse getTestById(Long testId) {
        Test test = findTest(testId);
        return mapTestToResponse(test);
    }

    @Transactional(readOnly = true)
    public org.example.backend.dto.response.TestResponse getTestById(String email, Long testId) {
        Test test = findTestAuthorized(email, testId);
        return mapTestToResponse(test);
    }

    private org.example.backend.dto.response.TestResponse mapTestToResponse(Test test) {
        org.example.backend.dto.response.TestResponse r = new org.example.backend.dto.response.TestResponse();
        r.setId(test.getId());
        r.setTitle(test.getTitle());
        r.setDescription(test.getDescription());
        r.setPublished(test.getPublished());
        r.setTestType(test.getTestType());
        r.setTotalDurationMinutes(test.getTotalDurationMinutes());
        boolean isFullTest = test.getTestType() == null
                || "FULL_TEST".equalsIgnoreCase(test.getTestType().trim());
        r.setParts(test.getParts() == null ? List.of() : test.getParts().stream().map(p -> {
            org.example.backend.dto.response.TestPartResponse pr = new org.example.backend.dto.response.TestPartResponse();
            pr.setId(p.getId());
            pr.setPartName(p.getPartName());
            pr.setPartNumber(p.getPartNumber());
            pr.setDescription(p.getDescription());
            pr.setDurationMinutes(p.getDurationMinutes());

            List<TestPartQuestion> rawQuestions = p.getQuestions() == null ? List.of() : p.getQuestions();
            int partLimit = AdminTestService.standardToeicPartQuestionLimit(p.getPartNumber());
            if (isFullTest && rawQuestions.size() > partLimit) {
                List<TestPartQuestion> grouped = rawQuestions.stream()
                        .filter(tpq -> tpq.getQuestion() != null
                                && tpq.getQuestion().getQuestionGroupCode() != null
                                && !tpq.getQuestion().getQuestionGroupCode().isBlank())
                        .collect(Collectors.toList());
                if (grouped.size() >= partLimit) {
                    rawQuestions = grouped.subList(0, partLimit);
                } else {
                    rawQuestions = rawQuestions.subList(rawQuestions.size() - partLimit, rawQuestions.size());
                }
            }

            pr.setQuestionCount(rawQuestions.size());
            pr.setQuestions(rawQuestions.stream().map(q -> {
                org.example.backend.dto.response.TestPartQuestionResponse qr = new org.example.backend.dto.response.TestPartQuestionResponse();
                qr.setId(q.getId());
                qr.setQuestionId(q.getQuestion().getId());
                qr.setQuestionText(q.getQuestion().getQuestionText());
                qr.setSortOrder(q.getSortOrder());
                qr.setPartNo(q.getQuestion().getPartNo());
                qr.setDifficultyLevel(q.getQuestion().getDifficultyLevel());
                qr.setAudioUrl(q.getQuestion().getAudioUrl());
                qr.setImageUrl(q.getQuestion().getImageUrl());
                qr.setPassageText(q.getQuestion().getPassageText());
                qr.setQuestionGroupCode(q.getQuestion().getQuestionGroupCode());
                qr.setOptions(q.getQuestion().getOptions() == null ? List.of() : q.getQuestion().getOptions().stream().map(o -> {
                    org.example.backend.dto.response.QuestionOptionResponse or = new org.example.backend.dto.response.QuestionOptionResponse();
                    or.setId(o.getId());
                    or.setOptionLabel(o.getOptionLabel());
                    or.setOptionText(o.getOptionText());
                    // Do NOT set 'correct' to prevent cheating
                    return or;
                }).collect(Collectors.toList()));
                return qr;
            }).collect(Collectors.toList()));
            return pr;
        }).collect(Collectors.toList()));
        return r;
    }

    @Transactional
    public TestAttemptResponse startTest(String email, Long testId) {
        User user = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        Test test = findTestAuthorized(email, testId);

        UserTestAttempt attempt = new UserTestAttempt();
        attempt.setUser(user);
        attempt.setTest(test);
        attempt.setStartedAt(LocalDateTime.now());
        // calculate totalQuestions from test parts
        boolean isFullTest = test.getTestType() == null
                || "FULL_TEST".equalsIgnoreCase(test.getTestType().trim());
        int total = test.getParts() == null ? 0 : test.getParts().stream().mapToInt(p -> {
            int rawCount = p.getQuestionCount() == null ? 0 : p.getQuestionCount();
            int limit = AdminTestService.standardToeicPartQuestionLimit(p.getPartNumber());
            return isFullTest ? Math.min(rawCount, limit) : rawCount;
        }).sum();
        attempt.setTotalQuestions(total);
        attempt.setStatus(AttemptStatus.IN_PROGRESS);

        userTestAttemptRepository.save(attempt);

        TestAttemptResponse resp = new TestAttemptResponse();
        resp.setAttemptId(attempt.getId());
        resp.setTestId(test.getId());
        resp.setTestTitle(test.getTitle());
        resp.setStartedAt(attempt.getStartedAt());
        resp.setTotalQuestions(attempt.getTotalQuestions());
        return resp;
    }

    @Transactional
    public TestAttemptResponse submitAttempt(String email, Long attemptId, SubmitTestAttemptRequest request) {
        User user = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        UserTestAttempt attempt = userTestAttemptRepository.findById(attemptId).orElseThrow(() -> new AppException(ErrorCode.INVALID_QUESTION_DATA));
        if (!attempt.getUser().getId().equals(user.getId())) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        if (attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        // load mapping of questionId -> correct label
        List<Long> questionIds = request.getAnswers() == null ? List.of() : request.getAnswers().stream().map(SubmitTestAttemptRequest.AnswerSubmission::getTestPartQuestionId).collect(Collectors.toList());
        List<TestPartQuestion> tpqs = testPartQuestionRepository.findAllById(questionIds);
        Map<Long, TestPartQuestion> tpqMap = tpqs.stream().collect(Collectors.toMap(TestPartQuestion::getId, t -> t));

        int correct = 0;
        List<UserTestAnswer> answersToSave = new ArrayList<>();

        for (SubmitTestAttemptRequest.AnswerSubmission a : request.getAnswers()) {
            TestPartQuestion tpq = tpqMap.get(a.getTestPartQuestionId());
            if (tpq == null) continue;
            // find correct option label for question
            String correctLabel = tpq.getQuestion().getOptions().stream().filter(o -> Boolean.TRUE.equals(o.getCorrect())).findFirst().map(org.example.backend.entity.QuestionOption::getOptionLabel).orElse(null);
            boolean isCorrect = correctLabel != null && correctLabel.equalsIgnoreCase(a.getSelectedLabel());
            if (isCorrect) correct++;

            UserTestAnswer uta = new UserTestAnswer();
            uta.setAttempt(attempt);
            uta.setTestPartQuestion(tpq);
            uta.setSelectedLabel(a.getSelectedLabel());
            uta.setCorrect(isCorrect);
            answersToSave.add(uta);
        }

        userTestAnswerRepository.saveAll(answersToSave);

        attempt.setSubmittedAt(LocalDateTime.now());
        attempt.setCorrectCount(correct);
        attempt.setTotalQuestions(attempt.getTotalQuestions() == null ? request.getAnswers().size() : attempt.getTotalQuestions());
        double score = attempt.getTotalQuestions() == 0 ? 0.0 : ((double) correct / (double) attempt.getTotalQuestions()) * 100.0;
        attempt.setScore(score);
        applyToeicScaledScores(attempt, answersToSave);
        attempt.setStatus(AttemptStatus.SUBMITTED);
        userTestAttemptRepository.save(attempt);

        int diamondsEarned = 0;
        if (diamondRewardService != null && correct > 0) {
            int baseDiamonds = Math.max(5, Math.min(25, (int) Math.ceil(correct / 2.0)));
            int bonus = score >= 80.0 ? 20 : (score >= 50.0 ? 10 : 0);
            diamondsEarned = diamondRewardService.grantStudyReward(
                    user, "TEST_SUBMIT", "test:" + attempt.getId(), baseDiamonds + bonus, 10 + correct, 5,
                    "Hoàn thành bài thi: " + attempt.getTest().getTitle() + " (" + correct + "/" + attempt.getTotalQuestions() + ")",
                    true);
        }

        // build response
        TestAttemptResponse resp = new TestAttemptResponse();
        resp.setAttemptId(attempt.getId());
        resp.setTestId(attempt.getTest().getId());
        resp.setTestTitle(attempt.getTest().getTitle());
        resp.setStartedAt(attempt.getStartedAt());
        resp.setSubmittedAt(attempt.getSubmittedAt());
        resp.setScore(attempt.getScore());
        resp.setListeningScore(attempt.getListeningScore());
        resp.setReadingScore(attempt.getReadingScore());
        resp.setToeicScore(attempt.getToeicScore());
        resp.setCorrectCount(attempt.getCorrectCount());
        resp.setTotalQuestions(attempt.getTotalQuestions());
        resp.setDiamondsEarned(diamondsEarned);
        resp.setCurrentDiamonds(user.getDiamonds());
        resp.setPartBreakdown(buildPartBreakdown(answersToSave));

        List<TestAttemptResponse.QuestionAnswerResult> details = answersToSave.stream().map(this::buildQuestionAnswerResult).collect(Collectors.toList());

        resp.setAnswers(details);
        broadcastLeaderboardUpdate();
        return resp;
    }

    private void broadcastLeaderboardUpdate() {
        if (messagingTemplate == null) return;
        try {
            messagingTemplate.convertAndSend("/topic/leaderboard", getLeaderboardTop3());
        } catch (Exception ignored) {
        }
    }

    @Transactional(readOnly = true)
    public List<org.example.backend.dto.response.TestAttemptResponse> getAttemptsForUser(String email) {
        org.example.backend.entity.User user = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        return userTestAttemptRepository.findByUserIdOrderByStartedAtDesc(user.getId()).stream().map(attempt -> {
            org.example.backend.dto.response.TestAttemptResponse r = new org.example.backend.dto.response.TestAttemptResponse();
            r.setAttemptId(attempt.getId());
            r.setTestId(attempt.getTest().getId());
            r.setTestTitle(attempt.getTest().getTitle());
            r.setStartedAt(attempt.getStartedAt());
            r.setSubmittedAt(attempt.getSubmittedAt());
            r.setScore(attempt.getScore());
            r.setListeningScore(attempt.getListeningScore());
            r.setReadingScore(attempt.getReadingScore());
            r.setToeicScore(attempt.getToeicScore());
            r.setCorrectCount(attempt.getCorrectCount());
            r.setTotalQuestions(attempt.getTotalQuestions());
            return r;
        }).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public org.example.backend.dto.response.TestAttemptResponse getAttemptDetails(String email, Long attemptId) {
        org.example.backend.entity.User user = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        UserTestAttempt attempt = userTestAttemptRepository.findById(attemptId).orElseThrow(() -> new AppException(ErrorCode.INVALID_QUESTION_DATA));
        
        // Verify user owns this attempt
        if (!attempt.getUser().getId().equals(user.getId())) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }

        // Load all answers for this attempt
        List<UserTestAnswer> answers = userTestAnswerRepository.findByAttemptIdOrderByIdAsc(attemptId);
        if (attempt.getStatus() == AttemptStatus.SUBMITTED
                && (attempt.getToeicScore() == null
                || attempt.getToeicScore() < 10
                || attempt.getListeningScore() == null
                || attempt.getReadingScore() == null)) {
            applyToeicScaledScores(attempt, answers);
            userTestAttemptRepository.save(attempt);
        }

        // Build response with full details
        org.example.backend.dto.response.TestAttemptResponse r = new org.example.backend.dto.response.TestAttemptResponse();
        r.setAttemptId(attempt.getId());
        r.setTestId(attempt.getTest().getId());
        r.setTestTitle(attempt.getTest().getTitle());
        r.setStartedAt(attempt.getStartedAt());
        r.setSubmittedAt(attempt.getSubmittedAt());
        r.setScore(attempt.getScore());
        r.setListeningScore(attempt.getListeningScore());
        r.setReadingScore(attempt.getReadingScore());
        r.setToeicScore(attempt.getToeicScore());
        r.setCorrectCount(attempt.getCorrectCount());
        r.setTotalQuestions(attempt.getTotalQuestions());
        r.setPartBreakdown(buildPartBreakdown(answers));

        List<org.example.backend.dto.response.TestAttemptResponse.QuestionAnswerResult> details = answers.stream().map(this::buildQuestionAnswerResult).collect(Collectors.toList());

        r.setAnswers(details);
        return r;
    }

    // Official ETS TOEIC 100-question Listening & Reading Scaled Score Conversion Tables (5..495)
    private static final int[] ETS_LISTENING_TABLE = {
            5, 5, 5, 5, 5, 5, 5, 10, 15, 20,
            25, 30, 35, 40, 45, 50, 55, 60, 65, 70,
            75, 80, 85, 90, 95, 100, 110, 115, 120, 125,
            130, 135, 140, 145, 150, 160, 165, 170, 175, 180,
            185, 190, 195, 200, 210, 215, 220, 230, 240, 245,
            250, 255, 260, 270, 275, 280, 290, 295, 300, 310,
            315, 320, 325, 330, 340, 345, 350, 360, 365, 370,
            380, 385, 390, 395, 400, 405, 410, 420, 425, 430,
            440, 445, 450, 460, 465, 470, 475, 480, 485, 490,
            495, 495, 495, 495, 495, 495, 495, 495, 495, 495, 495
    };

    private static final int[] ETS_READING_TABLE = {
            5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
            10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
            60, 65, 70, 75, 80, 90, 95, 100, 105, 115,
            120, 125, 130, 140, 145, 150, 160, 165, 170, 175,
            180, 190, 195, 200, 210, 215, 220, 225, 230, 240,
            245, 250, 260, 265, 270, 275, 285, 290, 295, 300,
            310, 315, 320, 325, 330, 335, 340, 350, 355, 360,
            365, 370, 375, 385, 390, 395, 400, 405, 415, 420,
            425, 430, 435, 440, 450, 455, 460, 465, 470, 475,
            480, 485, 485, 490, 490, 495, 495, 495, 495, 495, 495
    };

    public static int calculateToeicSectionScore(int correctCount, int totalCount) {
        return calculateToeicSectionScore(correctCount, totalCount, true);
    }

    public static int calculateToeicSectionScore(int correctCount, int totalCount, boolean listeningSection) {
        if (totalCount <= 0) {
            return 0;
        }
        int safeCorrect = Math.max(0, Math.min(totalCount, correctCount));
        int scaledRaw100 = totalCount == 100
                ? safeCorrect
                : (int) Math.round((safeCorrect * 100.0) / totalCount);
        int idx = Math.max(0, Math.min(100, scaledRaw100));
        return listeningSection ? ETS_LISTENING_TABLE[idx] : ETS_READING_TABLE[idx];
    }

    private void applyToeicScaledScores(UserTestAttempt attempt, List<UserTestAnswer> answers) {
        int listeningCorrect = 0;
        int answeredListeningTotal = 0;
        int readingCorrect = 0;
        int answeredReadingTotal = 0;

        for (UserTestAnswer answer : answers) {
            if (isListeningAnswer(answer)) {
                answeredListeningTotal++;
                if (Boolean.TRUE.equals(answer.getCorrect())) {
                    listeningCorrect++;
                }
            } else {
                answeredReadingTotal++;
                if (Boolean.TRUE.equals(answer.getCorrect())) {
                    readingCorrect++;
                }
            }
        }

        int testListeningTotal = 0;
        int testReadingTotal = 0;
        Test test = attempt.getTest();
        boolean isFullTest = test == null
                || test.getTestType() == null
                || "FULL_TEST".equalsIgnoreCase(test.getTestType().trim());

        if (test != null && test.getParts() != null && !test.getParts().isEmpty()) {
            for (TestPart p : test.getParts()) {
                int rawPartCount = p.getQuestionCount() != null ? p.getQuestionCount() : 0;
                int limit = AdminTestService.standardToeicPartQuestionLimit(p.getPartNumber());
                int effectiveCount = isFullTest ? Math.min(rawPartCount, limit) : rawPartCount;
                boolean isListeningPart = (p.getPartSection() != null && "LISTENING".equalsIgnoreCase(p.getPartSection()))
                        || (p.getPartNumber() != null && p.getPartNumber() <= 4);
                if (isListeningPart) {
                    testListeningTotal += effectiveCount;
                } else {
                    testReadingTotal += effectiveCount;
                }
            }
        }

        int attemptTotal = attempt.getTotalQuestions() != null ? attempt.getTotalQuestions() : 0;
        int effectiveListeningTotal;
        int effectiveReadingTotal;
        if (testListeningTotal > 0 || testReadingTotal > 0) {
            effectiveListeningTotal = testListeningTotal;
            effectiveReadingTotal = testReadingTotal;
        } else if (isFullTest && attemptTotal >= 100) {
            effectiveListeningTotal = attemptTotal / 2;
            effectiveReadingTotal = attemptTotal - effectiveListeningTotal;
        } else {
            effectiveListeningTotal = answeredListeningTotal;
            effectiveReadingTotal = answeredReadingTotal;
        }

        Integer listeningScore = effectiveListeningTotal > 0
                ? calculateToeicSectionScore(listeningCorrect, effectiveListeningTotal, true)
                : null;
        Integer readingScore = effectiveReadingTotal > 0
                ? calculateToeicSectionScore(readingCorrect, effectiveReadingTotal, false)
                : null;

        attempt.setListeningScore(listeningScore);
        attempt.setReadingScore(readingScore);
        if (listeningScore != null && readingScore != null) {
            attempt.setToeicScore(listeningScore + readingScore);
        } else if (listeningScore != null) {
            attempt.setToeicScore(listeningScore);
        } else if (readingScore != null) {
            attempt.setToeicScore(readingScore);
        } else {
            attempt.setToeicScore(0);
        }
    }

    private List<TestAttemptResponse.PartScoreBreakdown> buildPartBreakdown(List<UserTestAnswer> answers) {
        Map<Integer, List<UserTestAnswer>> byPart = new LinkedHashMap<>();
        for (UserTestAnswer answer : answers) {
            Question q = answer.getTestPartQuestion() != null ? answer.getTestPartQuestion().getQuestion() : null;
            int partNo = q != null && q.getPartNo() != null ? q.getPartNo() : 0;
            byPart.computeIfAbsent(partNo, ignored -> new ArrayList<>()).add(answer);
        }

        return byPart.entrySet().stream()
                .sorted(Map.Entry.comparingByKey(Comparator.naturalOrder()))
                .map(entry -> {
                    int total = entry.getValue().size();
                    int correct = (int) entry.getValue().stream().filter(a -> Boolean.TRUE.equals(a.getCorrect())).count();
                    String section = entry.getKey() > 0 && entry.getKey() <= 4 ? "LISTENING" : "READING";
                    TestAttemptResponse.PartScoreBreakdown item = new TestAttemptResponse.PartScoreBreakdown();
                    item.setPartNo(entry.getKey());
                    item.setPartSection(section);
                    item.setCorrectCount(correct);
                    item.setTotalCount(total);
                    item.setAccuracy(total == 0 ? 0.0 : Math.round(((double) correct / total) * 1000.0) / 10.0);
                    return item;
                })
                .collect(Collectors.toList());
    }

    private boolean isListeningAnswer(UserTestAnswer answer) {
        if (answer.getTestPartQuestion() != null) {
            TestPart part = answer.getTestPartQuestion().getTestPart();
            if (part != null && part.getPartSection() != null && !part.getPartSection().isBlank()) {
                return "LISTENING".equalsIgnoreCase(part.getPartSection());
            }
            Question q = answer.getTestPartQuestion().getQuestion();
            if (q != null && q.getPartNo() != null) {
                return q.getPartNo() <= 4;
            }
        }
        return false;
    }

    @Transactional(readOnly = true)
    public List<org.example.backend.dto.response.UserTestLeaderboardResponse> getLeaderboardTop3() {
        List<org.example.backend.dto.response.UserTestLeaderboardResponse> leaderboard =
                userTestAttemptRepository.findLeaderboard(PageRequest.of(0, 3));

        for (int i = 0; i < leaderboard.size(); i++) {
            leaderboard.get(i).setPosition(i + 1);
        }

        return leaderboard;
    }

    private org.example.backend.dto.response.TestAttemptResponse.QuestionAnswerResult buildQuestionAnswerResult(UserTestAnswer u) {
        org.example.backend.dto.response.TestAttemptResponse.QuestionAnswerResult q = new org.example.backend.dto.response.TestAttemptResponse.QuestionAnswerResult();
        Question question = u.getTestPartQuestion().getQuestion();
        
        q.setTestPartQuestionId(u.getTestPartQuestion().getId());
        q.setPartNo(question.getPartNo());
        q.setQuestionText(question.getQuestionText());
        q.setExplanation(question.getExplanation());
        q.setDifficultyLevel(question.getDifficultyLevel());
        q.setSourceType(question.getSourceType() != null ? question.getSourceType().name() : null);
        q.setSourceYear(question.getSourceYear());
        q.setAudioUrl(question.getAudioUrl());
        q.setImageUrl(question.getImageUrl());
        q.setPassageText(question.getPassageText());
        q.setTranscript(question.getTranscript());
        q.setQuestionGroupCode(question.getQuestionGroupCode());
        q.setSelectedLabel(u.getSelectedLabel());
        q.setCorrectLabel(question.getOptions().stream().filter(o -> Boolean.TRUE.equals(o.getCorrect())).findFirst().map(org.example.backend.entity.QuestionOption::getOptionLabel).orElse(null));
        q.setCorrect(u.getCorrect());
        
        // Build options list
        List<org.example.backend.dto.response.TestAttemptResponse.OptionInfo> options = question.getOptions().stream().map(o -> {
            org.example.backend.dto.response.TestAttemptResponse.OptionInfo opt = new org.example.backend.dto.response.TestAttemptResponse.OptionInfo();
            opt.setOptionLabel(o.getOptionLabel());
            opt.setOptionText(o.getOptionText());
            opt.setCorrect(o.getCorrect());
            return opt;
        }).collect(Collectors.toList());
        q.setOptions(options);
        
        return q;
    }

    private Test findTest(Long testId) {
        if (testId == null) throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        return testRepository.findById(testId).orElseThrow(() -> new AppException(ErrorCode.INVALID_QUESTION_DATA));
    }

    private Test findTestAuthorized(String email, Long testId) {
        Test test = findTest(testId);
        if (test.getOwnerUserId() != null && email != null) {
            User caller = userRepository.findByEmail(email)
                    .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
            if (!test.getOwnerUserId().equals(caller.getId()) && !"ADMIN".equals(caller.getRole().name())) {
                throw new AppException(ErrorCode.INVALID_TOKEN);
            }
        }
        return test;
    }
}

