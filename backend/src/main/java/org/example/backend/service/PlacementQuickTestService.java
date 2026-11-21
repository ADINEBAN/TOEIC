package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.EvaluatePlacementTestRequest;
import org.example.backend.dto.response.PlacementEvaluationResponse;
import org.example.backend.dto.response.PlacementQuickTestResponse;
import org.example.backend.entity.LearningPath;
import org.example.backend.entity.Question;
import org.example.backend.entity.QuestionOption;
import org.example.backend.entity.User;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PlacementQuickTestService {

    private static final int TARGET_QUESTION_COUNT = 8;

    private record SeedQuestion(
            String key,
            int partNo,
            String skillArea,
            String questionText,
            String passageText,
            String optA,
            String optB,
            String optC,
            String optD,
            String correctLabel
    ) {}

    private static final List<SeedQuestion> BUILTIN_DIAGNOSTIC_BANK = List.of(
            new SeedQuestion("SEED:1", 5, "Ngữ pháp · Từ loại",
                    "An accurate ______ of customer surveys is essential for improving product quality.",
                    null, "analyze", "analysis", "analytical", "analytically", "B"),
            new SeedQuestion("SEED:2", 5, "Ngữ pháp · Thì & Chia động từ",
                    "Following next week's inspection, the engineering team ______ a full automation plan.",
                    null, "will create", "was created", "creating", "has been creating", "A"),
            new SeedQuestion("SEED:3", 5, "Từ vựng TOEIC",
                    "Please submit your expense reimbursement report ______ April 30.",
                    null, "until", "between", "by", "during", "C"),
            new SeedQuestion("SEED:4", 5, "Ngữ pháp · Liên từ",
                    "______ his busy schedule, Mr. Tanaka attended every client meeting on time.",
                    null, "Although", "Because", "Despite", "Unless", "C"),
            new SeedQuestion("SEED:5", 6, "Hoàn thành đoạn văn (Part 6)",
                    "Employees are encouraged to register early, as seating is ______ to 40 participants per room.",
                    "Memo: All staff interested in the quarterly Excel workshop must register online by Friday. Seating is ______ (5) to 40 participants per room.",
                    "limit", "limited", "limitation", "limiting", "B"),
            new SeedQuestion("SEED:6", 6, "Hoàn thành đoạn văn (Part 6)",
                    "______ your badge at the reception desk before entering the laboratory.",
                    "Security Notice: Visitors must sign in with a valid photo ID. ______ (6) your badge at the reception desk before entering the laboratory.",
                    "Wearing", "To wear", "Wear", "Worn", "C"),
            new SeedQuestion("SEED:7", 7, "Đọc hiểu (Part 7)",
                    "What is the main purpose of the notice?",
                    "Notice to Tenants: Beginning November 1, the main lobby elevator will undergo routine maintenance between 9:00 P.M. and 5:00 A.M. During these hours, please use the east service elevator.",
                    "To announce a rent increase", "To inform residents about elevator maintenance",
                    "To hire maintenance technicians", "To relocate the main lobby entrance", "B"),
            new SeedQuestion("SEED:8", 7, "Đọc hiểu · Suy luận (Part 7)",
                    "When should tenants use the east service elevator?",
                    "Notice to Tenants: Beginning November 1, the main lobby elevator will undergo routine maintenance between 9:00 P.M. and 5:00 A.M. During these hours, please use the east service elevator.",
                    "Every weekday morning", "During overnight maintenance hours",
                    "Only on weekends", "Whenever moving heavy furniture", "B")
    );

    private static final Map<String, SeedQuestion> SEED_BY_KEY = buildSeedMap();

    private static Map<String, SeedQuestion> buildSeedMap() {
        Map<String, SeedQuestion> map = new LinkedHashMap<>();
        for (SeedQuestion sq : BUILTIN_DIAGNOSTIC_BANK) {
            map.put(sq.key(), sq);
        }
        return map;
    }

    private final QuestionRepository questionRepository;
    private final UserRepository userRepository;
    private final PlacementOnboardingService placementOnboardingService;

    @Transactional(readOnly = true)
    public PlacementQuickTestResponse buildQuickTest() {
        List<PlacementQuickTestResponse.QuickTestQuestion> selected = new ArrayList<>();
        List<Question> dbQuestions = questionRepository.findAllByOrderByCreatedAtDesc();

        // Pick a balanced sample from DB reading/grammar questions (Parts 5, 6, 7 without required audio)
        Map<Integer, Integer> partCap = Map.of(5, 4, 6, 2, 7, 2);
        Map<Integer, Integer> partCount = new LinkedHashMap<>();
        for (Question q : dbQuestions) {
            if (selected.size() >= TARGET_QUESTION_COUNT) break;
            Integer pNo = q.getPartNo();
            if (pNo == null || pNo < 5 || pNo > 7) continue;
            if (q.getOptions() == null || q.getOptions().size() < 4) continue;
            int cur = partCount.getOrDefault(pNo, 0);
            if (cur >= partCap.getOrDefault(pNo, 2)) continue;
            partCount.put(pNo, cur + 1);
            selected.add(toDbQuickQuestion(q));
        }

        // Supplement cleanly from curated TOEIC diagnostic items so quick test always has 8 questions
        for (SeedQuestion seed : BUILTIN_DIAGNOSTIC_BANK) {
            if (selected.size() >= TARGET_QUESTION_COUNT) break;
            selected.add(toSeedQuickQuestion(seed));
        }

        return PlacementQuickTestResponse.builder().questions(selected).build();
    }

    @Transactional
    public PlacementEvaluationResponse evaluateTest(String email, EvaluatePlacementTestRequest request) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        List<EvaluatePlacementTestRequest.QuickAnswerItem> answers =
                request != null && request.getAnswers() != null ? request.getAnswers() : List.of();
        if (answers.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        Map<Integer, int[]> partStats = new LinkedHashMap<>();
        Map<Integer, String> partSkillHint = new LinkedHashMap<>();
        int totalCorrect = 0;
        int totalAnswered = 0;

        for (EvaluatePlacementTestRequest.QuickAnswerItem item : answers) {
            if (item == null || item.getQuestionKey() == null) continue;
            String key = item.getQuestionKey().trim();
            String selected = item.getSelectedLabel() == null ? "" : item.getSelectedLabel().trim().toUpperCase(Locale.ROOT);

            Integer partNo = null;
            String skillArea = null;
            String correctLabel = null;

            if (key.startsWith("SEED:")) {
                SeedQuestion sq = SEED_BY_KEY.get(key);
                if (sq != null) {
                    partNo = sq.partNo();
                    skillArea = sq.skillArea();
                    correctLabel = sq.correctLabel();
                }
            } else if (key.startsWith("DB:")) {
                try {
                    long qId = Long.parseLong(key.substring(3));
                    Optional<Question> qOpt = questionRepository.findById(qId);
                    if (qOpt.isPresent()) {
                        Question q = qOpt.get();
                        partNo = q.getPartNo() != null ? q.getPartNo() : 5;
                        skillArea = labelForPart(partNo);
                        correctLabel = q.getOptions().stream()
                                .filter(o -> Boolean.TRUE.equals(o.getCorrect()))
                                .map(QuestionOption::getOptionLabel)
                                .findFirst()
                                .orElse("A");
                    }
                } catch (NumberFormatException ignored) {
                    // Ignore malformed key
                }
            }

            if (partNo == null || correctLabel == null) continue;
            totalAnswered++;
            boolean isCorrect = correctLabel.equalsIgnoreCase(selected);
            if (isCorrect) totalCorrect++;

            int[] stats = partStats.computeIfAbsent(partNo, k -> new int[2]);
            stats[1]++;
            if (isCorrect) stats[0]++;
            partSkillHint.putIfAbsent(partNo, skillArea != null ? skillArea : labelForPart(partNo));
        }

        if (totalAnswered == 0) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        double accuracy = (totalCorrect * 100.0) / totalAnswered;
        int estimatedScore = Math.min(900, Math.max(200, (int) (Math.round((200 + accuracy * 7.0) / 10.0) * 10)));
        String levelLabel = estimatedScore < 450 ? "BEGINNER" : (estimatedScore < 700 ? "INTERMEDIATE" : "ADVANCED");

        int recommendedTarget;
        if (request != null && request.getTargetScore() != null && request.getTargetScore() >= 300) {
            recommendedTarget = Math.max(request.getTargetScore(), Math.min(900, estimatedScore + 100));
        } else if (estimatedScore < 450) {
            recommendedTarget = 500;
        } else if (estimatedScore < 650) {
            recommendedTarget = 650;
        } else {
            recommendedTarget = 800;
        }

        Optional<LearningPath> matchedPath = placementOnboardingService.findBestMatchingPathForScore(recommendedTarget);
        user.setCurrentLevel(levelLabel);
        userRepository.save(user);

        List<PlacementEvaluationResponse.PartBreakdownItem> breakdown = new ArrayList<>();
        List<String> weakAreas = new ArrayList<>();
        List<String> strengths = new ArrayList<>();

        for (Map.Entry<Integer, int[]> entry : partStats.entrySet()) {
            int pNo = entry.getKey();
            int corr = entry.getValue()[0];
            int tot = entry.getValue()[1];
            double acc = tot > 0 ? Math.round((corr * 1000.0) / tot) / 10.0 : 0.0;
            String area = labelForPart(pNo);

            breakdown.add(PlacementEvaluationResponse.PartBreakdownItem.builder()
                    .partNo(pNo)
                    .skillArea(area)
                    .correct(corr)
                    .total(tot)
                    .accuracyPercent(acc)
                    .build());

            if (acc < 60.0) {
                weakAreas.add(area + " (" + Math.round(acc) + "%)");
            } else if (acc >= 75.0) {
                strengths.add(area + " (" + Math.round(acc) + "%)");
            }
        }

        return PlacementEvaluationResponse.builder()
                .correctCount(totalCorrect)
                .totalQuestions(totalAnswered)
                .accuracyPercent(Math.round(accuracy * 10.0) / 10.0)
                .estimatedScore(estimatedScore)
                .recommendedTargetScore(recommendedTarget)
                .levelLabel(levelLabel)
                .recommendedPathId(matchedPath.map(LearningPath::getId).orElse(null))
                .recommendedPathTitle(matchedPath.map(LearningPath::getTitle).orElse(null))
                .partBreakdown(breakdown)
                .weakAreas(weakAreas)
                .strengths(strengths)
                .build();
    }

    private PlacementQuickTestResponse.QuickTestQuestion toDbQuickQuestion(Question q) {
        int partNo = q.getPartNo() != null ? q.getPartNo() : 5;
        List<PlacementQuickTestResponse.QuickOption> opts = q.getOptions().stream()
                .map(o -> PlacementQuickTestResponse.QuickOption.builder()
                        .label(o.getOptionLabel())
                        .text(o.getOptionText())
                        .build())
                .toList();
        return PlacementQuickTestResponse.QuickTestQuestion.builder()
                .questionKey("DB:" + q.getId())
                .partNo(partNo)
                .skillArea(labelForPart(partNo))
                .questionText(q.getQuestionText())
                .passageText(q.getPassageText())
                .options(opts)
                .build();
    }

    private PlacementQuickTestResponse.QuickTestQuestion toSeedQuickQuestion(SeedQuestion s) {
        return PlacementQuickTestResponse.QuickTestQuestion.builder()
                .questionKey(s.key())
                .partNo(s.partNo())
                .skillArea(s.skillArea())
                .questionText(s.questionText())
                .passageText(s.passageText())
                .options(List.of(
                        PlacementQuickTestResponse.QuickOption.builder().label("A").text(s.optA()).build(),
                        PlacementQuickTestResponse.QuickOption.builder().label("B").text(s.optB()).build(),
                        PlacementQuickTestResponse.QuickOption.builder().label("C").text(s.optC()).build(),
                        PlacementQuickTestResponse.QuickOption.builder().label("D").text(s.optD()).build()
                ))
                .build();
    }

    private String labelForPart(int partNo) {
        return switch (partNo) {
            case 1, 2, 3, 4 -> "Part " + partNo + " · Nghe hiểu";
            case 5 -> "Part 5 · Ngữ pháp & Từ vựng";
            case 6 -> "Part 6 · Hoàn thành đoạn văn";
            case 7 -> "Part 7 · Đọc hiểu";
            default -> "Part " + partNo;
        };
    }
}
