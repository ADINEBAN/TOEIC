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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PlacementQuickTestService {

    private static final int TARGET_QUESTION_COUNT = 10;

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
            new SeedQuestion("SEED:P1_1", 1, "Part 1 · Mô tả tranh",
                    "Look at the office workstation description and choose the statement that best matches.",
                    "Tình huống tranh: Một nhân viên nữ đang ngồi làm việc trước máy tính xách tay tại bàn văn phòng cạnh cửa sổ.",
                    "She is pouring coffee into a ceramic mug.",
                    "She is typing on a laptop computer at a desk.",
                    "She is watering a plant on the floor.",
                    "She is climbing a ladder in a warehouse.",
                    "B"),
            new SeedQuestion("SEED:P2_1", 2, "Part 2 · Hỏi – Đáp",
                    "When will the quarterly marketing budget be finalized?",
                    null,
                    "In the second-floor conference room.",
                    "By Friday afternoon at the latest.",
                    "Yes, the advertisement was popular.",
                    "(N/A)",
                    "B"),
            new SeedQuestion("SEED:P3_1", 3, "Part 3 · Hội thoại ngắn",
                    "Why is the man calling the supplier?",
                    "Conversation excerpt:\nMan: Hello, this is David from Apex Motors. We received our shipment of brake pads this morning, but ten boxes were missing from the pallet.\nWoman: I apologize for the oversight. I will arrange an express delivery for the remaining boxes this afternoon.",
                    "To cancel an upcoming contract",
                    "To report missing items in a delivery",
                    "To apply for a warehouse position",
                    "To request a change in billing address",
                    "B"),
            new SeedQuestion("SEED:1", 5, "Part 5 · Từ loại",
                    "An accurate ______ of customer surveys is essential for improving product quality.",
                    null, "analyze", "analysis", "analytical", "analytically", "B"),
            new SeedQuestion("SEED:2", 5, "Part 5 · Thì động từ",
                    "Following next week's inspection, the engineering team ______ a full automation plan.",
                    null, "will create", "was created", "creating", "has been creating", "A"),
            new SeedQuestion("SEED:3", 5, "Part 5 · Giới từ",
                    "Please submit your expense reimbursement report ______ April 30.",
                    null, "until", "between", "by", "during", "C"),
            new SeedQuestion("SEED:4", 5, "Part 5 · Liên từ",
                    "______ his busy schedule, Mr. Tanaka attended every client meeting on time.",
                    null, "Although", "Because", "Despite", "Unless", "C"),
            new SeedQuestion("SEED:5", 5, "Part 5 · Từ vựng",
                    "Employees are encouraged to register early, as seating is ______ to 40 participants per room.",
                    null, "limit", "limited", "limitation", "limiting", "B"),
            new SeedQuestion("SEED:6", 5, "Part 5 · Cấu trúc câu",
                    "Please ______ your visitor badge at the reception desk before entering the research laboratory.",
                    null, "wearing", "to wear", "wear", "worn", "C"),
            new SeedQuestion("SEED:7", 5, "Part 5 · Đại từ & Từ hạn định",
                    "All department managers must review ______ team budgets before the annual board meeting.",
                    null, "they", "them", "their", "theirs", "C")
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

    /**
     * Builds a 10-question placement test with the exact composition:
     * - 1 question from Part 1
     * - 1 question from Part 2
     * - 1 question from Part 3
     * - 7 questions from Part 5
     */
    @Transactional(readOnly = true)
    public PlacementQuickTestResponse buildQuickTest() {
        List<Question> dbQuestions = questionRepository.findAllByOrderByCreatedAtDesc();
        List<PlacementQuickTestResponse.QuickTestQuestion> selected = new ArrayList<>();

        // 1. Pick 1 Part 1 question (prefer one with audioUrl & imageUrl)
        Optional<Question> part1Db = dbQuestions.stream()
                .filter(q -> Integer.valueOf(1).equals(q.getPartNo()) && hasValidOptions(q, 3))
                .sorted(Comparator.comparingInt(this::mediaScore).reversed())
                .findFirst();
        if (part1Db.isPresent()) {
            selected.add(toDbQuickQuestion(part1Db.get()));
        } else {
            selected.add(toSeedQuickQuestion(SEED_BY_KEY.get("SEED:P1_1")));
        }

        // 2. Pick 1 Part 2 question (prefer one with audioUrl)
        Optional<Question> part2Db = dbQuestions.stream()
                .filter(q -> Integer.valueOf(2).equals(q.getPartNo()) && hasValidOptions(q, 3))
                .sorted(Comparator.comparingInt(this::mediaScore).reversed())
                .findFirst();
        if (part2Db.isPresent()) {
            selected.add(toDbQuickQuestion(part2Db.get()));
        } else {
            selected.add(toSeedQuickQuestion(SEED_BY_KEY.get("SEED:P2_1")));
        }

        // 3. Pick 1 Part 3 question (prefer one with audioUrl)
        Optional<Question> part3Db = dbQuestions.stream()
                .filter(q -> Integer.valueOf(3).equals(q.getPartNo()) && hasValidOptions(q, 4))
                .sorted(Comparator.comparingInt(this::mediaScore).reversed())
                .findFirst();
        if (part3Db.isPresent()) {
            selected.add(toDbQuickQuestion(part3Db.get()));
        } else {
            selected.add(toSeedQuickQuestion(SEED_BY_KEY.get("SEED:P3_1")));
        }

        // 4. Pick 7 Part 5 questions
        int part5Added = 0;
        for (Question q : dbQuestions) {
            if (part5Added >= 7) break;
            if (!Integer.valueOf(5).equals(q.getPartNo()) || !hasValidOptions(q, 4)) continue;
            selected.add(toDbQuickQuestion(q));
            part5Added++;
        }

        for (SeedQuestion seed : BUILTIN_DIAGNOSTIC_BANK) {
            if (selected.size() >= TARGET_QUESTION_COUNT) break;
            if (seed.partNo() != 5) continue;
            selected.add(toSeedQuickQuestion(seed));
        }

        return PlacementQuickTestResponse.builder().questions(selected).build();
    }

    private boolean hasValidOptions(Question q, int minCount) {
        return q.getOptions() != null && q.getOptions().size() >= minCount;
    }

    private int mediaScore(Question q) {
        int score = 0;
        if (q.getAudioUrl() != null && !q.getAudioUrl().isBlank()) score += 2;
        if (q.getImageUrl() != null && !q.getImageUrl().isBlank()) score += 1;
        return score;
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
        int totalCorrect = 0;
        int totalAnswered = 0;

        for (EvaluatePlacementTestRequest.QuickAnswerItem item : answers) {
            if (item == null || item.getQuestionKey() == null) continue;
            String key = item.getQuestionKey().trim();
            String selected = item.getSelectedLabel() == null ? "" : item.getSelectedLabel().trim().toUpperCase(Locale.ROOT);

            Integer partNo = null;
            String correctLabel = null;

            if (key.startsWith("SEED:")) {
                SeedQuestion sq = SEED_BY_KEY.get(key);
                if (sq != null) {
                    partNo = sq.partNo();
                    correctLabel = sq.correctLabel();
                }
            } else if (key.startsWith("DB:")) {
                try {
                    long qId = Long.parseLong(key.substring(3));
                    Optional<Question> qOpt = questionRepository.findById(qId);
                    if (qOpt.isPresent()) {
                        Question q = qOpt.get();
                        partNo = q.getPartNo() != null ? q.getPartNo() : 5;
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
        }

        if (totalAnswered == 0) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        double accuracy = (totalCorrect * 100.0) / totalAnswered;

        // Unlock rules requested:
        // - <= 3 correct: unlock 300+ only (maxUnlockedTargetScore = 300)
        // - 4..7 correct: unlock 300+ and 600+ (maxUnlockedTargetScore = 600)
        // - > 7 correct (8..10): unlock Full (maxUnlockedTargetScore = 990)
        int maxUnlockedTargetScore;
        int recommendedTarget;
        int estimatedScore;
        String levelLabel;
        String unlockSummary;

        if (totalCorrect <= 3) {
            maxUnlockedTargetScore = 300;
            recommendedTarget = 300;
            estimatedScore = 300;
            levelLabel = "BEGINNER";
            unlockSummary = "Đúng " + totalCorrect + "/" + totalAnswered + " câu (≤ 3 câu): Mở khóa Lộ trình 300+.";
        } else if (totalCorrect <= 7) {
            maxUnlockedTargetScore = 600;
            recommendedTarget = 600;
            estimatedScore = 550;
            levelLabel = "INTERMEDIATE";
            unlockSummary = "Đúng " + totalCorrect + "/" + totalAnswered + " câu (4–7 câu): Mở khóa Lộ trình 300+ và 600+.";
        } else {
            maxUnlockedTargetScore = 990;
            recommendedTarget = 800;
            estimatedScore = 780;
            levelLabel = "ADVANCED";
            unlockSummary = "Đúng " + totalCorrect + "/" + totalAnswered + " câu (> 7 câu): Mở khóa Full toàn bộ Lộ trình (300+, 600+, 800+).";
        }

        if (request != null && request.getTargetScore() != null && request.getTargetScore() <= maxUnlockedTargetScore) {
            recommendedTarget = request.getTargetScore();
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
                weakAreas.add(area);
            } else if (acc >= 75.0) {
                strengths.add(area);
            }
        }

        return PlacementEvaluationResponse.builder()
                .correctCount(totalCorrect)
                .totalQuestions(totalAnswered)
                .accuracyPercent(Math.round(accuracy * 10.0) / 10.0)
                .estimatedScore(estimatedScore)
                .recommendedTargetScore(recommendedTarget)
                .maxUnlockedTargetScore(maxUnlockedTargetScore)
                .unlockSummary(unlockSummary)
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
                .filter(o -> partNo != 2 || !"D".equalsIgnoreCase(o.getOptionLabel()))
                .map(o -> PlacementQuickTestResponse.QuickOption.builder()
                        .label(o.getOptionLabel())
                        .text(o.getOptionText())
                        .build())
                .toList();
        String cleanedQuestionText = q.getQuestionText() == null
                ? ""
                : q.getQuestionText().replaceFirst("^\\s*\\[(?:Test|Đề)\\s*\\d+\\s*-\\s*Q\\d+\\]\\s*", "").trim();
        return PlacementQuickTestResponse.QuickTestQuestion.builder()
                .questionKey("DB:" + q.getId())
                .partNo(partNo)
                .skillArea(labelForPart(partNo))
                .questionText(cleanedQuestionText)
                .passageText(partNo >= 6 ? q.getPassageText() : null)
                .audioUrl(q.getAudioUrl())
                .imageUrl(q.getImageUrl())
                .options(opts)
                .build();
    }

    private PlacementQuickTestResponse.QuickTestQuestion toSeedQuickQuestion(SeedQuestion s) {
        List<PlacementQuickTestResponse.QuickOption> opts = new ArrayList<>();
        opts.add(PlacementQuickTestResponse.QuickOption.builder().label("A").text(s.optA()).build());
        opts.add(PlacementQuickTestResponse.QuickOption.builder().label("B").text(s.optB()).build());
        opts.add(PlacementQuickTestResponse.QuickOption.builder().label("C").text(s.optC()).build());
        if (s.partNo() != 2) {
            opts.add(PlacementQuickTestResponse.QuickOption.builder().label("D").text(s.optD()).build());
        }
        return PlacementQuickTestResponse.QuickTestQuestion.builder()
                .questionKey(s.key())
                .partNo(s.partNo())
                .skillArea(s.skillArea())
                .questionText(s.questionText())
                .passageText(s.passageText())
                .options(opts)
                .build();
    }

    private String labelForPart(int partNo) {
        return switch (partNo) {
            case 1 -> "Part 1 · Mô tả tranh";
            case 2 -> "Part 2 · Hỏi – Đáp";
            case 3 -> "Part 3 · Hội thoại ngắn";
            case 4 -> "Part 4 · Bài nói ngắn";
            case 5 -> "Part 5 · Ngữ pháp & Từ vựng";
            case 6 -> "Part 6 · Hoàn thành đoạn văn";
            case 7 -> "Part 7 · Đọc hiểu";
            default -> "Part " + partNo;
        };
    }
}
