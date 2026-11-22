import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import QuestionMediaBlock from "@/src/components/user/QuestionMediaBlock";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  assignRecommendedPath,
  evaluatePlacementQuickTest,
  getMyProfile,
  getPlacementQuickTest,
  getUserLearningPathCatalog,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import {
  PlacementEvaluationData,
  PlacementQuickQuestion,
  UserLearningPathCatalogItem,
} from "@/src/types/user-api";
import { replaceRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";
import { alertCrossPlatform, confirmCrossPlatform } from "@/src/utils/web-dialog";

function resolvePathAccent(score: number) {
  if (score <= 350) return "#CFE0FF";
  if (score <= 650) return "#D8F6D9";
  return "#EDE9FE";
}

function resolveInitialUnlockedScore(
  currentLevel?: string | null,
  enrolledTargetScore?: number | null,
): number {
  let base = 300;
  const lvl = (currentLevel ?? "").toUpperCase();
  if (lvl === "ADVANCED") {
    base = 990;
  } else if (lvl === "INTERMEDIATE") {
    base = 600;
  }
  if (typeof enrolledTargetScore === "number" && enrolledTargetScore > base) {
    base = enrolledTargetScore;
  }
  return base;
}

function requiredCorrectTextForPath(targetScore: number): string {
  if (targetScore <= 350) return "Mở mặc định (0–3 câu hoặc Bỏ qua test)";
  if (targetScore <= 650) return "Cần đạt 4–7 câu đúng trong bài test 10 câu";
  return "Cần đạt > 7 câu đúng (8–10/10 câu) trong bài test";
}

export default function OnboardingScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [catalog, setCatalog] = useState<UserLearningPathCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<"catalog" | "quiz" | "result">("catalog");
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<PlacementQuickQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [evalResult, setEvalResult] = useState<PlacementEvaluationData | null>(null);
  const [targetPathForQuiz, setTargetPathForQuiz] =
    useState<UserLearningPathCatalogItem | null>(null);
  const [unlockedMaxScore, setUnlockedMaxScore] = useState<number>(() =>
    resolveInitialUnlockedScore(auth.user?.currentLevel, null),
  );
  const [didAutoPromptTest, setDidAutoPromptTest] = useState(false);

  const loadCatalog = useCallback(async () => {
    if (!auth.accessToken) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await getUserLearningPathCatalog(auth.accessToken);
      const items = res.data ?? [];
      setCatalog(items);
      const enrolled = items.find((p) => p.enrolled);
      const basePath =
        items.find((p) => p.targetScore <= 350) ?? items[0] ?? null;

      setUnlockedMaxScore((prev) =>
        Math.max(
          prev,
          resolveInitialUnlockedScore(null, enrolled?.targetScore),
        ),
      );
      setSelectedPathId((prev) => {
        if (prev && items.some((p) => p.id === prev)) return prev;
        return enrolled?.id ?? basePath?.id ?? null;
      });

      if (!enrolled && !didAutoPromptTest) {
        setDidAutoPromptTest(true);
        try {
          setQuizLoading(true);
          const quizRes = await getPlacementQuickTest(auth.accessToken);
          const qList = quizRes.data?.questions ?? [];
          if (qList.length > 0) {
            setQuizQuestions(qList);
            setQuizAnswers({});
            setQuizIndex(0);
            setEvalResult(null);
            setStep("quiz");
          }
        } catch {
          // Stay on catalog if quick test fetch fails
        } finally {
          setQuizLoading(false);
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Không thể tải danh sách lộ trình.",
      );
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, didAutoPromptTest]);

  useFocusEffect(
    useCallback(() => {
      void loadCatalog();
    }, [loadCatalog]),
  );

  const isPathUnlocked = useCallback(
    (path: UserLearningPathCatalogItem) => {
      if (path.enrolled || path.targetScore <= 350) return true;
      return path.targetScore <= unlockedMaxScore;
    },
    [unlockedMaxScore],
  );

  const selectedPath = useMemo(
    () => catalog.find((item) => item.id === selectedPathId) ?? catalog[0] ?? null,
    [catalog, selectedPathId],
  );

  const path300 = useMemo(
    () => catalog.find((item) => item.targetScore <= 350) ?? catalog[0] ?? null,
    [catalog],
  );

  const handleAssignPath = async (
    overridePathId?: number | null,
    overrideTargetScore?: number,
  ) => {
    if (!auth.accessToken) {
      replaceRoute("/");
      return;
    }
    const chosenPath =
      typeof overridePathId === "number"
        ? catalog.find((item) => item.id === overridePathId) ?? selectedPath
        : selectedPath;

    if (chosenPath && !isPathUnlocked(chosenPath)) {
      handlePromptTestForLockedPath(chosenPath);
      return;
    }

    try {
      setSubmitting(true);
      await assignRecommendedPath(auth.accessToken, {
        learningPathId: chosenPath?.id,
        targetScore: chosenPath?.targetScore ?? overrideTargetScore ?? 300,
      });
      try {
        const profileRes = await getMyProfile(auth.accessToken);
        if (profileRes.data) {
          updateUserProfile(profileRes.data);
        }
      } catch {
        // Best-effort profile refresh
      }
      replaceRoute("/user/practice");
    } catch (error) {
      alertCrossPlatform(
        "Lộ trình TOEIC",
        error instanceof Error ? error.message : "Không thể kích hoạt lộ trình.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartQuickTest = async (forPath?: UserLearningPathCatalogItem | null) => {
    if (!auth.accessToken) {
      replaceRoute("/");
      return;
    }
    try {
      setQuizLoading(true);
      setTargetPathForQuiz(forPath ?? null);
      const res = await getPlacementQuickTest(auth.accessToken);
      const questions = res.data?.questions ?? [];
      if (questions.length === 0) {
        alertCrossPlatform("Bài test 10 câu", "Chưa tải được câu hỏi. Vui lòng thử lại.");
        return;
      }
      setQuizQuestions(questions);
      setQuizAnswers({});
      setQuizIndex(0);
      setEvalResult(null);
      setStep("quiz");
    } catch (error) {
      alertCrossPlatform(
        "Bài test 10 câu",
        error instanceof Error ? error.message : "Không thể tải bài kiểm tra trình độ.",
      );
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSkipQuickTestTo300 = () => {
    setUnlockedMaxScore((prev) => Math.max(300, prev));
    if (path300) {
      setSelectedPathId(path300.id);
      void handleAssignPath(path300.id, path300.targetScore);
    } else {
      setStep("catalog");
    }
  };

  const handlePromptTestForLockedPath = (path: UserLearningPathCatalogItem) => {
    const needCorrect = path.targetScore <= 650 ? "từ 4 đến 7 câu đúng (≥ 4/10)" : "trên 7 câu đúng (8–10/10)";
    confirmCrossPlatform(
      `Mở khóa ${path.title} (${path.targetScore}+)`,
      `Để mở khóa lộ trình ${path.targetScore}+, bạn cần làm bài test 10 câu (gồm 1 câu Part 1, 1 câu Part 2, 1 câu Part 3 và 7 câu Part 5) và đạt ${needCorrect}.\n\nBắt đầu làm bài test ngay?`,
      () => {
        void handleStartQuickTest(path);
      },
      "Làm bài test 10 câu",
      "Để sau",
    );
  };

  const handleSelectPathCard = (path: UserLearningPathCatalogItem) => {
    if (isPathUnlocked(path)) {
      setSelectedPathId(path.id);
      return;
    }
    handlePromptTestForLockedPath(path);
  };

  const handleSelectQuizOption = (questionKey: string, label: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionKey]: label,
    }));
  };

  const handleSubmitQuickTest = async () => {
    if (!auth.accessToken) {
      replaceRoute("/");
      return;
    }
    try {
      setQuizSubmitting(true);
      const answers = quizQuestions.map((question) => ({
        questionKey: question.questionKey,
        selectedLabel: quizAnswers[question.questionKey] ?? "",
      }));
      const res = await evaluatePlacementQuickTest(auth.accessToken, {
        answers,
        targetScore: targetPathForQuiz?.targetScore,
      });
      const evaluation = res.data ?? null;
      if (!evaluation) {
        alertCrossPlatform("Kết quả", "Không nhận được kết quả đánh giá.");
        return;
      }

      const correct = evaluation.correctCount ?? 0;
      const newMaxUnlock =
        evaluation.maxUnlockedTargetScore ??
        (correct <= 3 ? 300 : correct <= 7 ? 600 : 990);

      setUnlockedMaxScore(newMaxUnlock);
      setEvalResult(evaluation);

      // Pick the highest unlocked path or the target path if unlocked
      if (targetPathForQuiz && targetPathForQuiz.targetScore <= newMaxUnlock) {
        setSelectedPathId(targetPathForQuiz.id);
      } else {
        const bestUnlocked =
          [...catalog]
            .filter((p) => p.targetScore <= newMaxUnlock)
            .sort((a, b) => b.targetScore - a.targetScore)[0] ?? path300;
        if (bestUnlocked) {
          setSelectedPathId(bestUnlocked.id);
        }
      }
      setStep("result");
    } catch (error) {
      alertCrossPlatform(
        "Chấm điểm",
        error instanceof Error ? error.message : "Không thể chấm điểm bài test.",
      );
    } finally {
      setQuizSubmitting(false);
    }
  };

  const currentQuestion = quizQuestions[quizIndex] ?? null;

  return (
    <UserScreen contentStyle={styles.outerWrap} hasTabDock={false} scrollable={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/home")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0]?.toUpperCase() || "A"} />}
        title="Lộ trình TOEIC"
      />

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        style={styles.scrollArea}
      >
        {step === "catalog" ? (
          <>
            <SurfaceCard style={styles.testGateCard}>
              <View style={styles.testGateHeader}>
                <View style={styles.placementBadge}>
                  <Ionicons color={colors.primary} name="sparkles" size={14} />
                  <Text style={styles.placementBadgeText}>BÀI TEST MỞ KHÓA LỘ TRÌNH</Text>
                </View>
                <Text style={styles.placementMeta}>10 câu (Part 1, 2, 3 & 5)</Text>
              </View>

              <View style={styles.ruleBoxesWrap}>
                <View style={styles.ruleChip}>
                  <Text style={styles.ruleScoreText}>0–3 câu / Skip</Text>
                  <Text style={styles.ruleTargetText}>Mở 300+</Text>
                </View>
                <View style={[styles.ruleChip, unlockedMaxScore >= 600 && styles.ruleChipUnlocked]}>
                  <Text style={styles.ruleScoreText}>4–7 câu đúng</Text>
                  <Text style={styles.ruleTargetText}>Mở 300+ & 600+</Text>
                </View>
                <View style={[styles.ruleChip, unlockedMaxScore > 650 && styles.ruleChipUnlocked]}>
                  <Text style={styles.ruleScoreText}>&gt; 7 câu (8–10)</Text>
                  <Text style={styles.ruleTargetText}>Mở Full (800+)</Text>
                </View>
              </View>

              <View style={styles.placementActionRow}>
                <LiquidButton
                  compact
                  disabled={quizLoading}
                  label={quizLoading ? "Đang tải..." : "Làm bài test 10 câu"}
                  loading={quizLoading}
                  onPress={() => void handleStartQuickTest(null)}
                  style={{ flex: 1.2 }}
                  variant="primary"
                />
                <Pressable
                  disabled={submitting}
                  onPress={handleSkipQuickTestTo300}
                  style={styles.skipInlineBtn}
                >
                  <Text style={styles.skipInlineText}>Bỏ qua → Học 300+</Text>
                </Pressable>
              </View>
            </SurfaceCard>

            {loading ? (
              <SurfaceCard style={styles.emptyCard}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.goalDesc}>Đang tải lộ trình...</Text>
              </SurfaceCard>
            ) : errorMessage ? (
              <SurfaceCard style={styles.emptyCard}>
                <Text style={styles.goalDesc}>{errorMessage}</Text>
                <LiquidButton compact label="Thử lại" onPress={() => void loadCatalog()} variant="glass" />
              </SurfaceCard>
            ) : (
              <View style={styles.goalList}>
                {catalog.map((path) => {
                  const unlocked = isPathUnlocked(path);
                  const selected = selectedPath?.id === path.id && unlocked;

                  return (
                    <Pressable
                      key={path.id}
                      onPress={() => handleSelectPathCard(path)}
                      style={({ pressed }) => [pressed ? { opacity: 0.92 } : null]}
                    >
                      <SurfaceCard
                        style={[
                          styles.goalCard,
                          selected ? styles.goalCardSelected : null,
                          !unlocked ? styles.goalCardLocked : null,
                        ]}
                      >
                        <View style={styles.goalHeaderRow}>
                          <View
                            style={[
                              styles.goalIcon,
                              {
                                backgroundColor: unlocked
                                  ? resolvePathAccent(path.targetScore)
                                  : colors.surfaceMuted,
                              },
                            ]}
                          >
                            <Text style={styles.scoreBadgeLabel}>{path.targetScore}+</Text>
                          </View>

                          <View style={styles.goalHeaderCopy}>
                            <View style={styles.goalTitleRow}>
                              <Text numberOfLines={1} style={[styles.goalTitle, { fontSize: rf(15.5) }]}>
                                {path.title}
                              </Text>
                              {path.enrolled ? (
                                <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                                  <Text style={styles.popularBadgeText}>Đang học</Text>
                                </View>
                              ) : unlocked ? (
                                <View style={styles.unlockedBadge}>
                                  <Text style={styles.unlockedBadgeText}>Đã mở ✓</Text>
                                </View>
                              ) : (
                                <View style={styles.lockedBadge}>
                                  <Ionicons color="#B45309" name="lock-closed" size={11} />
                                  <Text style={styles.lockedBadgeText}>Khóa</Text>
                                </View>
                              )}
                            </View>

                            <Text style={styles.goalLevel}>
                              {unlocked
                                ? `${path.milestoneCount} chặng • ${path.moduleCount} bài học • ${path.videoLessonCount} video`
                                : requiredCorrectTextForPath(path.targetScore)}
                            </Text>
                          </View>

                          <Ionicons
                            color={
                              !unlocked
                                ? "#D97706"
                                : selected
                                  ? colors.primary
                                  : colors.textMuted
                            }
                            name={
                              !unlocked
                                ? "lock-closed"
                                : selected
                                  ? "checkmark-circle"
                                  : "ellipse-outline"
                            }
                            size={21}
                          />
                        </View>

                        {!unlocked ? (
                          <View style={styles.lockedActionStrip}>
                            <Ionicons color={colors.primaryDark} name="play-circle" size={15} />
                            <Text style={styles.lockedActionText}>
                              Bấm vào đây để làm bài test 10 câu mở khóa lộ trình {path.targetScore}+
                            </Text>
                          </View>
                        ) : null}
                      </SurfaceCard>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        ) : step === "quiz" && currentQuestion ? (
          <View style={styles.quizWrap}>
            <SurfaceCard style={styles.quizTopBar}>
              <View style={styles.quizProgressHeader}>
                <Text style={styles.quizCounter}>
                  Câu {quizIndex + 1}/{quizQuestions.length} · Part {currentQuestion.partNo}
                  {targetPathForQuiz ? ` · Mở lộ trình ${targetPathForQuiz.targetScore}+` : ""}
                </Text>
                <Pressable hitSlop={8} onPress={handleSkipQuickTestTo300} style={styles.skipQuizPill}>
                  <Text style={styles.skipQuizPillText}>Bỏ qua → Học 300+</Text>
                </Pressable>
              </View>
              <View style={styles.quizProgressTrack}>
                <View
                  style={[
                    styles.quizProgressFill,
                    {
                      width: `${Math.round(((quizIndex + 1) / Math.max(1, quizQuestions.length)) * 100)}%`,
                    },
                  ]}
                />
              </View>
            </SurfaceCard>

            <QuestionMediaBlock
              audioUrl={currentQuestion.audioUrl}
              imageUrl={currentQuestion.imageUrl}
              passageText={
                currentQuestion.partNo >= 3 && !currentQuestion.audioUrl
                  ? currentQuestion.passageText
                  : null
              }
              questionGroupCode={null}
            />

            <SurfaceCard style={styles.quizQuestionCard}>
              <View style={styles.quizMetaRow}>
                <View style={styles.partPill}>
                  <Text style={styles.partPillText}>Part {currentQuestion.partNo}</Text>
                </View>
                <Text style={styles.skillAreaText}>{currentQuestion.skillArea}</Text>
              </View>

              {(currentQuestion.partNo !== 1 && currentQuestion.partNo !== 2) ||
              (!currentQuestion.audioUrl && !currentQuestion.imageUrl) ? (
                <Text style={[styles.quizQuestionText, { fontSize: rf(15.5) }]}>
                  {currentQuestion.questionText}
                </Text>
              ) : null}

              <View style={styles.optionList}>
                {currentQuestion.options
                  .filter((opt) =>
                    currentQuestion.partNo === 2 ? opt.label.toUpperCase() !== "D" : true,
                  )
                  .map((opt) => {
                    const chosen = quizAnswers[currentQuestion.questionKey] === opt.label;
                    const hideOptionText =
                      (currentQuestion.partNo === 1 || currentQuestion.partNo === 2) &&
                      Boolean(currentQuestion.audioUrl);
                    return (
                      <Pressable
                        key={opt.label}
                        onPress={() => handleSelectQuizOption(currentQuestion.questionKey, opt.label)}
                        style={[styles.optionRow, chosen ? styles.optionRowSelected : null]}
                      >
                        <View
                          style={[
                            styles.optionLabelCircle,
                            chosen ? styles.optionLabelCircleSelected : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionLabelText,
                              chosen ? styles.optionLabelTextSelected : null,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.optionBodyText,
                            chosen ? styles.optionBodyTextSelected : null,
                          ]}
                        >
                          {hideOptionText ? `Đáp án (${opt.label})` : opt.text}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>

              <View style={styles.quizNavRow}>
                <LiquidButton
                  compact
                  disabled={quizIndex === 0 || quizSubmitting}
                  label="Trước"
                  onPress={() => setQuizIndex((prev) => Math.max(0, prev - 1))}
                  variant="glass"
                />
                {quizIndex < quizQuestions.length - 1 ? (
                  <LiquidButton
                    compact
                    label="Câu tiếp →"
                    onPress={() =>
                      setQuizIndex((prev) => Math.min(quizQuestions.length - 1, prev + 1))
                    }
                    style={{ flex: 1 }}
                    variant="primary"
                  />
                ) : (
                  <LiquidButton
                    compact
                    disabled={quizSubmitting}
                    label={quizSubmitting ? "Đang chấm..." : "Nộp bài & Mở lộ trình"}
                    loading={quizSubmitting}
                    onPress={() => void handleSubmitQuickTest()}
                    style={{ flex: 1 }}
                    variant="primary"
                  />
                )}
              </View>
            </SurfaceCard>
          </View>
        ) : step === "result" && evalResult ? (
          <View style={styles.quizWrap}>
            <SurfaceCard style={styles.quizQuestionCard}>
              <View style={styles.resultBadgeRow}>
                <Ionicons color={colors.primary} name="checkmark-circle" size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.goalTitle, { fontSize: rf(17) }]}>
                    Kết quả: Đúng {evalResult.correctCount}/{evalResult.totalQuestions} câu
                  </Text>
                  <Text style={styles.goalLevel}>
                    {evalResult.unlockSummary ??
                      (evalResult.correctCount <= 3
                        ? "Đúng ≤ 3 câu: Mở khóa Lộ trình 300+"
                        : evalResult.correctCount <= 7
                          ? "Đúng 4–7 câu: Mở khóa Lộ trình 300+ & 600+"
                          : "Đúng > 7 câu: Mở khóa Full Lộ trình (300+, 600+, 800+)")}
                  </Text>
                </View>
              </View>

              {targetPathForQuiz && targetPathForQuiz.targetScore > unlockedMaxScore ? (
                <View style={styles.notEnoughBox}>
                  <Text style={styles.notEnoughText}>
                    Bạn cần đạt{" "}
                    {targetPathForQuiz.targetScore <= 650 ? "từ 4/10 câu đúng" : "trên 7/10 câu đúng"}{" "}
                    để mở {targetPathForQuiz.title}. Hiện tại bạn có thể học lộ trình đã mở hoặc làm lại bài test.
                  </Text>
                </View>
              ) : null}

              <View style={styles.recommendedBox}>
                <Text style={styles.recommendedLabel}>Lộ trình sẵn sàng cho bạn</Text>
                <Text style={[styles.goalTitle, { fontSize: rf(16) }]}>
                  {selectedPath?.title ?? evalResult.recommendedPathTitle ?? "Lộ trình 300+"}
                </Text>
              </View>

              <LiquidButton
                disabled={submitting}
                label={
                  submitting
                    ? "Đang kích hoạt..."
                    : `Bắt đầu học ${selectedPath?.title ?? "Lộ trình đã mở"}`
                }
                loading={submitting}
                onPress={() =>
                  void handleAssignPath(
                    selectedPath?.id ?? evalResult.recommendedPathId,
                    selectedPath?.targetScore ?? evalResult.recommendedTargetScore,
                  )
                }
                variant="primary"
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => void handleStartQuickTest(targetPathForQuiz)}
                  style={[styles.reselectBtn, { flex: 1 }]}
                >
                  <Text style={styles.reselectBtnText}>Làm lại test 10 câu</Text>
                </Pressable>
                <Pressable
                  onPress={() => setStep("catalog")}
                  style={[styles.reselectBtn, { flex: 1 }]}
                >
                  <Text style={styles.reselectBtnText}>Xem danh sách lộ trình</Text>
                </Pressable>
              </View>
            </SurfaceCard>
          </View>
        ) : null}
      </ScrollView>

      {step === "catalog" && selectedPath && isPathUnlocked(selectedPath) ? (
        <View style={styles.bottomBar}>
          <View style={styles.bottomInfo}>
            <Text style={styles.bottomLabel}>Lộ trình đang chọn</Text>
            <Text numberOfLines={1} style={styles.bottomValue}>
              {selectedPath.targetScore}+ • {selectedPath.title}
            </Text>
          </View>
          <LiquidButton
            compact
            disabled={submitting}
            label={submitting ? "Đang mở..." : "Kích hoạt lộ trình"}
            loading={submitting}
            onPress={() => void handleAssignPath(selectedPath.id, selectedPath.targetScore)}
            variant="primary"
          />
        </View>
      ) : null}
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    outerWrap: {
      flex: 1,
    },
    scrollArea: {
      flex: 1,
    },
    scrollBody: {
      gap: 12,
      paddingBottom: 110,
      paddingTop: 6,
    },
    testGateCard: {
      gap: 10,
    },
    testGateHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 6,
    },
    placementBadge: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    placementBadgeText: {
      color: colors.primaryDark,
      fontSize: 11,
      fontWeight: "900",
    },
    placementMeta: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    ruleBoxesWrap: {
      flexDirection: "row",
      gap: 6,
    },
    ruleChip: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      flex: 1,
      gap: 2,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    ruleChipUnlocked: {
      backgroundColor: "#F0FDF4",
      borderColor: "#86EFAC",
    },
    ruleScoreText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    ruleTargetText: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "900",
    },
    placementActionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    skipInlineBtn: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    skipInlineText: {
      color: colors.primaryDark,
      fontSize: 12.5,
      fontWeight: "800",
    },
    emptyCard: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 20,
    },
    goalList: {
      gap: 10,
    },
    goalCard: {
      borderColor: colors.border,
      borderWidth: 1.5,
      gap: 8,
    },
    goalCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    goalCardLocked: {
      opacity: 0.88,
    },
    goalHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    goalIcon: {
      alignItems: "center",
      borderRadius: 14,
      height: 48,
      justifyContent: "center",
      width: 54,
    },
    scoreBadgeLabel: {
      color: "#0F172A",
      fontSize: 15,
      fontWeight: "900",
    },
    goalHeaderCopy: {
      flex: 1,
      gap: 3,
    },
    goalTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    goalTitle: {
      color: colors.text,
      fontWeight: "900",
    },
    goalLevel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    goalDesc: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    popularBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    popularBadgeText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "800",
    },
    unlockedBadge: {
      backgroundColor: "#DCFCE7",
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    unlockedBadgeText: {
      color: "#15803D",
      fontSize: 10.5,
      fontWeight: "800",
    },
    lockedBadge: {
      alignItems: "center",
      backgroundColor: "#FEF3C7",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    lockedBadgeText: {
      color: "#B45309",
      fontSize: 10.5,
      fontWeight: "800",
    },
    lockedActionStrip: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    lockedActionText: {
      color: colors.primaryDark,
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
    },
    quizWrap: {
      gap: 10,
    },
    quizTopBar: {
      gap: 8,
    },
    quizProgressHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    quizCounter: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    skipQuizPill: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    skipQuizPillText: {
      color: colors.primaryDark,
      fontSize: 11.5,
      fontWeight: "800",
    },
    quizProgressTrack: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 99,
      height: 6,
      overflow: "hidden",
    },
    quizProgressFill: {
      backgroundColor: colors.primary,
      borderRadius: 99,
      height: "100%",
    },
    quizQuestionCard: {
      gap: 12,
    },
    quizMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    partPill: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    partPillText: {
      color: colors.primaryDark,
      fontSize: 11.5,
      fontWeight: "900",
    },
    skillAreaText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    quizQuestionText: {
      color: colors.text,
      fontWeight: "800",
      lineHeight: 22,
    },
    optionList: {
      gap: 8,
    },
    optionRow: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    optionRowSelected: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    optionLabelCircle: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 999,
      borderWidth: 1,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    optionLabelCircleSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionLabelText: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "900",
    },
    optionLabelTextSelected: {
      color: "#FFFFFF",
    },
    optionBodyText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
    },
    optionBodyTextSelected: {
      color: colors.primaryDark,
      fontWeight: "800",
    },
    quizNavRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
    },
    resultBadgeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    notEnoughBox: {
      backgroundColor: "#FEF3C7",
      borderColor: "#F59E0B",
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 10,
    },
    notEnoughText: {
      color: "#B45309",
      fontSize: 12.5,
      fontWeight: "700",
      lineHeight: 18,
    },
    recommendedBox: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.md,
      gap: 4,
      padding: 12,
    },
    recommendedLabel: {
      color: colors.primaryDark,
      fontSize: 11.5,
      fontWeight: "800",
    },
    reselectBtn: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      paddingVertical: 10,
    },
    reselectBtnText: {
      color: colors.primaryDark,
      fontSize: 12.5,
      fontWeight: "800",
    },
    bottomBar: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      bottom: 0,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      left: 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
      position: "absolute",
      right: 0,
    },
    bottomInfo: {
      flex: 1,
    },
    bottomLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    bottomValue: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "900",
    },
  });
