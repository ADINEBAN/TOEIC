package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.MistakeItemResponse;
import org.example.backend.entity.Question;
import org.example.backend.entity.User;
import org.example.backend.entity.UserPracticeAnswer;
import org.example.backend.entity.UserTestAnswer;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.UserPracticeAnswerRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.UserTestAnswerRepository;
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
public class MistakeBankService {

    private static final int MAX_MISTAKES = 50;

    private final UserRepository userRepository;
    private final UserTestAnswerRepository userTestAnswerRepository;
    private final UserPracticeAnswerRepository userPracticeAnswerRepository;

    @Transactional(readOnly = true)
    public List<MistakeItemResponse> getMyMistakes(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Map<Long, MistakeItemResponse> byQuestionId = new LinkedHashMap<>();

        List<UserTestAnswer> testWrong = userTestAnswerRepository.findIncorrectAnswersByUserId(user.getId());
        for (UserTestAnswer answer : testWrong) {
            if (answer.getTestPartQuestion() == null || answer.getTestPartQuestion().getQuestion() == null) {
                continue;
            }
            Question q = answer.getTestPartQuestion().getQuestion();
            LocalDateTime when = answer.getAttempt() != null && answer.getAttempt().getSubmittedAt() != null
                    ? answer.getAttempt().getSubmittedAt()
                    : answer.getCreatedAt();
            String title = answer.getAttempt() != null && answer.getAttempt().getTest() != null
                    ? answer.getAttempt().getTest().getTitle()
                    : "Mock Test";
            mergeMistake(byQuestionId, q, "MOCK_TEST", title, answer.getSelectedLabel(), when);
        }

        List<UserPracticeAnswer> practiceWrong = userPracticeAnswerRepository.findIncorrectAnswersByUserId(user.getId());
        for (UserPracticeAnswer answer : practiceWrong) {
            if (answer.getQuestion() == null) {
                continue;
            }
            Question q = answer.getQuestion();
            String selected = answer.getSelectedOption() != null ? answer.getSelectedOption().getOptionLabel() : null;
            LocalDateTime when = answer.getAnsweredAt() != null ? answer.getAnsweredAt() : answer.getCreatedAt();
            String title = answer.getAttempt() != null && answer.getAttempt().getPracticeSet() != null
                    ? answer.getAttempt().getPracticeSet().getTitle()
                    : "Practice";
            mergeMistake(byQuestionId, q, "PRACTICE", title, selected, when);
        }

        List<MistakeItemResponse> result = new ArrayList<>(byQuestionId.values());
        result.sort(Comparator.comparing(
                MistakeItemResponse::getLastWrongAt,
                Comparator.nullsLast(Comparator.reverseOrder())
        ));
        return result.size() > MAX_MISTAKES ? result.subList(0, MAX_MISTAKES) : result;
    }

    private void mergeMistake(
            Map<Long, MistakeItemResponse> map,
            Question question,
            String sourceType,
            String sourceTitle,
            String selectedLabel,
            LocalDateTime when
    ) {
        MistakeItemResponse existing = map.get(question.getId());
        if (existing != null) {
            existing.setWrongCount(existing.getWrongCount() + 1);
            if (when != null && (existing.getLastWrongAt() == null || when.isAfter(existing.getLastWrongAt()))) {
                existing.setLastWrongAt(when);
                existing.setLastSelectedLabel(selectedLabel);
                existing.setSourceType(sourceType);
                existing.setSourceTitle(sourceTitle);
            }
            return;
        }

        MistakeItemResponse item = new MistakeItemResponse();
        item.setQuestionId(question.getId());
        item.setPartNo(question.getPartNo());
        item.setSourceType(sourceType);
        item.setSourceTitle(sourceTitle);
        item.setQuestionText(question.getQuestionText());
        item.setAudioUrl(question.getAudioUrl());
        item.setImageUrl(question.getImageUrl());
        item.setPassageText(question.getPassageText());
        item.setTranscript(question.getTranscript());
        item.setQuestionGroupCode(question.getQuestionGroupCode());
        item.setExplanation(question.getExplanation());
        item.setDifficultyLevel(question.getDifficultyLevel());
        item.setLastSelectedLabel(selectedLabel);
        item.setCorrectLabel(
                question.getOptions().stream()
                        .filter(o -> Boolean.TRUE.equals(o.getCorrect()))
                        .map(o -> o.getOptionLabel())
                        .findFirst()
                        .orElse(null)
        );
        item.setWrongCount(1);
        item.setLastWrongAt(when);
        item.setOptions(question.getOptions().stream().map(opt -> {
            MistakeItemResponse.OptionItem o = new MistakeItemResponse.OptionItem();
            o.setId(opt.getId());
            o.setOptionLabel(opt.getOptionLabel());
            o.setOptionText(opt.getOptionText());
            o.setCorrect(opt.getCorrect());
            return o;
        }).collect(Collectors.toList()));
        map.put(question.getId(), item);
    }
}
