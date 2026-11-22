import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidCard } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import QuestionMediaBlock from "@/src/components/user/QuestionMediaBlock";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { UserTestService } from "@/src/services/user-test.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { QuestionAnswerResult, QuestionExplainResponse, TestAttemptResponse } from "@/src/types/user-api";
import { pushRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa nộp bài";
  return new Date(value).toLocaleString();
}

function normalizeExplainText(text?: string | null) {
  if (!text) return "";
  return text.replace(/\*\*/g, "").trim();
}

export default function AttemptReviewScreen() {
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [attempt, setAttempt] = useState<TestAttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);
  const [explainLoadingId, setExplainLoadingId] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<number, QuestionExplainResponse>>({});
  const [explainErrors, setExplainErrors] = useState<Record<number, string>>({});

  const service = useMemo(() => {
    return auth.accessToken ? new UserTestService(auth.accessToken) : null;
  }, [auth.accessToken]);

  const attemptId = useMemo(() => {
    if (!params.attemptId) return null;
    const parsed = Number(params.attemptId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.attemptId]);

  useEffect(() => {
    if (!service || !attemptId) return;

    const loadAttempt = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const response = await service.getAttemptDetails(attemptId);
        setAttempt(response.data);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Không thể tải chi tiết bài làm.");
      } finally {
        setLoading(false);
      }
    };

    void loadAttempt();
  }, [attemptId, service]);

  const scorePercent = Math.round(attempt?.score ?? 0);
  const answers = attempt?.answers ?? [];
  const incorrectCount = answers.filter((item) => !item.correct).length;
  const totalQ = attempt?.totalQuestions ?? answers.length;
  const skippedCount = Math.max(0, totalQ - answers.length);

  const handleExplain = async (answer: QuestionAnswerResult) => {
    if (!service) return;

    const questionId = answer.testPartQuestionId;
    if (expandedQuestionId === questionId) {
      setExpandedQuestionId(null);
      return;
    }

    setExpandedQuestionId(questionId);
    if (explanations[questionId] || explainLoadingId === questionId) return;

    try {
      setExplainLoadingId(questionId);
      setExplainErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });

      const response = await service.explainQuestion({
        testPartQuestionId: questionId,
        selectedAnswer: answer.selectedLabel,
        type: "BOTH",
      });

      setExplanations((prev) => ({
        ...prev,
        [questionId]: response.data,
      }));
    } catch (error) {
      setExplainErrors((prev) => ({
        ...prev,
        [questionId]: error instanceof Error ? error.message : "Không thể tải giải thích AI.",
      }));
    } finally {
      setExplainLoadingId(null);
    }
  };

  if (loading) {
    return (
      <UserScreen hasTabDock={false} scrollable={false}>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </UserScreen>
    );
  }

  if (!attempt || errorMessage) {
    return (
      <UserScreen hasTabDock={false}>
        <AppHeader
          leftIcon="chevron-back-outline"
          onLeftPress={() => safeBack("/user/test")}
          rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
          title="Xem lại bài làm"
        />
        <SurfaceCard>
          <Text style={styles.errorTitle}>Không tải được bài làm</Text>
          <Text style={styles.errorText}>{errorMessage ?? "Dữ liệu attempt không hợp lệ."}</Text>
        </SurfaceCard>
      </UserScreen>
    );
  }

  const statW = gridItemWidth(3, 8, true);

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/test")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
        title="Xem lại bài thi"
      />

      <LiquidCard hero style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroCopy}>
            <Text numberOfLines={2} style={[styles.heroTitle, { fontSize: rf(19) }]}>
              {attempt.testTitle}
            </Text>
            <Text style={styles.heroMeta}>Nộp bài: {formatDateTime(attempt.submittedAt)}</Text>
          </View>
          <View style={styles.scoreRing}>
            <Text style={styles.scoreRingValue}>{scorePercent}%</Text>
            <Text style={styles.scoreRingLabel}>Điểm</Text>
          </View>
        </View>

        <View style={styles.statGrid}>
          <View style={[styles.statCard, styles.statCardSuccess, { width: statW }]}>
            <Text style={styles.statValue}>{attempt.correctCount ?? 0}</Text>
            <Text style={styles.statLabel}>Câu đúng</Text>
          </View>
          <View style={[styles.statCard, styles.statCardDanger, { width: statW }]}>
            <Text style={styles.statValue}>{incorrectCount}</Text>
            <Text style={styles.statLabel}>Câu sai</Text>
          </View>
          <View style={[styles.statCard, { width: statW }]}>
            <Text style={styles.statValue}>{attempt.toeicScore ?? attempt.totalQuestions}</Text>
            <Text style={styles.statLabel}>{attempt.toeicScore ? "TOEIC" : "Tổng"}</Text>
          </View>
        </View>

        {attempt.toeicScore != null ? (
          <View style={styles.toeicBandRow}>
            <View style={styles.toeicBandPill}>
              <Text style={styles.toeicBandText}>Listening: {attempt.listeningScore ?? 5}/495</Text>
            </View>
            <View style={styles.toeicBandPill}>
              <Text style={styles.toeicBandText}>Reading: {attempt.readingScore ?? 5}/495</Text>
            </View>
            {skippedCount > 0 ? (
              <View style={styles.toeicBandPill}>
                <Text style={styles.toeicBandText}>Bỏ trống: {skippedCount} câu</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {attempt.testId ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {incorrectCount > 0 ? (
              <Pressable
                onPress={() => {
                  const wrongIds = answers.filter((a) => !a.correct).map((a) => a.testPartQuestionId);
                  pushRoute(`/user/exam?testId=${attempt.testId}&retryIds=${wrongIds.join(",")}`);
                }}
                style={{
                  backgroundColor: "rgba(255,255,255,0.22)",
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" }}>
                  ↺ Làm lại {incorrectCount} câu sai
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => pushRoute(`/user/exam?testId=${attempt.testId}`)}
              style={{
                backgroundColor: "rgba(255,255,255,0.14)",
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" }}>
                Làm lại toàn đề
              </Text>
            </Pressable>
          </View>
        ) : null}
      </LiquidCard>

      {attempt.partBreakdown?.length ? (
        <>
          <SectionTitle title="Phân tích theo Part" />
          <SurfaceCard style={styles.partBreakdownCard}>
            {attempt.partBreakdown.map((part) => {
              const weak = part.accuracy < 60;
              return (
                <View key={`part-${part.partNo}`} style={styles.partRow}>
                  <View style={styles.partHeaderRow}>
                    <Text style={styles.partNameText}>
                      Part {part.partNo || "?"} ({part.partSection})
                    </Text>
                    <Text style={[styles.partStatText, weak ? styles.partWeakText : null]}>
                      {part.correctCount}/{part.totalCount} ({Math.round(part.accuracy)}%)
                    </Text>
                  </View>
                  <View style={styles.partTrack}>
                    <View
                      style={[
                        styles.partFill,
                        weak ? styles.partFillWeak : null,
                        { width: `${Math.max(4, Math.min(100, part.accuracy))}%` },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </SurfaceCard>
        </>
      ) : null}

      <SectionTitle title="Chi tiết từng câu hỏi" />
      <View style={styles.answersCol}>
        {answers.map((answer, index) => {
          const explainData = explanations[answer.testPartQuestionId];
          const explainError = explainErrors[answer.testPartQuestionId];
          const isExpanded = expandedQuestionId === answer.testPartQuestionId;
          const isLoadingExplain = explainLoadingId === answer.testPartQuestionId;
          const normalizedExplanation = normalizeExplainText(explainData?.explanation);
          const normalizedTips = normalizeExplainText(explainData?.tips);
          const shouldRenderTips = normalizedTips.length > 0 && normalizedTips !== normalizedExplanation;

          return (
            <SurfaceCard
              key={answer.testPartQuestionId}
              style={[
                styles.answerCard,
                answer.correct ? styles.answerCardCorrect : styles.answerCardWrong,
              ]}
            >
              <View style={styles.answerTopRow}>
                <View style={styles.answerIndexWrap}>
                  <Text style={styles.answerIndex}>Q{index + 1}</Text>
                </View>
                <View style={styles.answerContent}>
                  <Text style={[styles.answerQuestion, { fontSize: rf(14.5) }]}>
                    {(answer.questionText ?? "")
                      .replace(/^\s*\[(?:Test|Đề)\s*\d+\s*-\s*Q\d+\]\s*/i, "")
                      .trim()}
                  </Text>
                </View>
                <View style={[styles.stateIcon, answer.correct ? styles.stateIconSuccess : styles.stateIconDanger]}>
                  <Ionicons
                    color={answer.correct ? colors.success : colors.danger}
                    name={answer.correct ? "checkmark" : "close"}
                    size={16}
                  />
                </View>
              </View>

              <QuestionMediaBlock
                audioUrl={answer.audioUrl}
                imageUrl={answer.imageUrl}
                passageText={answer.passageText}
                questionGroupCode={null}
                showTranscript
                transcript={answer.transcript}
              />

              {answer.options?.length ? (
                <View style={styles.optionsList}>
                  {answer.options.map((option) => {
                    const isSelected = option.optionLabel === answer.selectedLabel;
                    const isCorrect = option.optionLabel === answer.correctLabel || option.correct === true;
                    return (
                      <View
                        key={`${answer.testPartQuestionId}-${option.optionLabel}`}
                        style={[
                          styles.optionRow,
                          isCorrect ? styles.optionRowCorrect : null,
                          isSelected && !isCorrect ? styles.optionRowSelectedWrong : null,
                        ]}
                      >
                        <Text style={styles.optionLabel}>{option.optionLabel}</Text>
                        <Text style={styles.optionText}>{option.optionText}</Text>
                        {isCorrect ? (
                          <Ionicons color={colors.success} name="checkmark-circle" size={16} />
                        ) : isSelected ? (
                          <Ionicons color={colors.danger} name="close-circle" size={16} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Pressable
                onPress={() => void handleExplain(answer)}
                style={[styles.explainButton, isExpanded ? styles.explainButtonActive : null]}
              >
                <Ionicons color={isExpanded ? colors.onPrimary : colors.success} name="sparkles-outline" size={15} />
                <Text style={[styles.explainButtonText, isExpanded ? styles.explainButtonTextActive : null]}>
                  {isExpanded ? "Ẩn giải thích AI" : explainData ? "Xem lại giải thích AI" : "Giải thích AI"}
                </Text>
              </Pressable>

              {isExpanded ? (
                <View style={styles.explainPanel}>
                  {isLoadingExplain ? (
                    <View style={styles.inlineLoading}>
                      <ActivityIndicator color={colors.primary} />
                      <Text style={styles.inlineLoadingText}>AI đang phân tích câu hỏi này...</Text>
                    </View>
                  ) : null}

                  {explainError ? <Text style={styles.explainError}>{explainError}</Text> : null}

                  {explainData ? (
                    <>
                      <View style={styles.explainBadgeRow}>
                        <View style={styles.explainBadge}>
                          <Text style={styles.explainBadgeText}>
                            Đúng: {normalizeExplainText(explainData.correctAnswer)}
                          </Text>
                        </View>
                        <View style={[styles.explainBadge, styles.explainBadgeMuted]}>
                          <Text style={styles.explainBadgeText}>Chọn: {explainData.userAnswer}</Text>
                        </View>
                      </View>

                      {normalizedExplanation ? (
                        <Text style={styles.explainBody}>{normalizedExplanation}</Text>
                      ) : null}

                      {shouldRenderTips ? (
                        <View style={styles.tipCard}>
                          <Ionicons color={colors.primaryDark} name="bulb-outline" size={16} />
                          <Text style={styles.tipText}>{normalizedTips}</Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}
            </SurfaceCard>
          );
        })}
      </View>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    centerState: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    errorTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "900",
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 13.5,
      marginTop: 4,
    },
    heroCard: {
      gap: 12,
      marginBottom: 18,
    },
    heroTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
    },
    heroEyebrow: {
      color: "rgba(255,255,255,0.88)",
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 1,
    },
    heroTitle: {
      color: colors.heroText,
      fontWeight: "900",
      marginTop: 2,
    },
    heroMeta: {
      color: colors.heroTextMuted,
      fontSize: 12,
      marginTop: 4,
    },
    scoreRing: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.94)",
      borderRadius: 22,
      height: 76,
      justifyContent: "center",
      width: 76,
    },
    scoreRingValue: {
      color: colors.primary,
      fontSize: 20,
      fontWeight: "900",
    },
    scoreRingLabel: {
      color: "#4F5D75",
      fontSize: 10.5,
      fontWeight: "800",
    },
    statGrid: {
      flexDirection: "row",
      gap: 8,
    },
    statCard: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderColor: "rgba(255,255,255,0.18)",
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 10,
    },
    statCardSuccess: {
      backgroundColor: "rgba(47,166,110,0.24)",
    },
    statCardDanger: {
      backgroundColor: "rgba(217,91,91,0.24)",
    },
    statValue: {
      color: colors.heroText,
      fontSize: 19,
      fontWeight: "900",
    },
    statLabel: {
      color: colors.heroTextMuted,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },
    toeicBandRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    toeicBandPill: {
      backgroundColor: "rgba(255,255,255,0.16)",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    toeicBandText: {
      color: colors.heroText,
      fontSize: 12,
      fontWeight: "800",
    },
    partBreakdownCard: {
      gap: 10,
      marginBottom: 18,
    },
    partRow: {
      gap: 4,
    },
    partHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    partNameText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    partStatText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "800",
    },
    partWeakText: {
      color: colors.accent,
    },
    partTrack: {
      backgroundColor: colors.glassFill,
      borderRadius: radius.pill,
      height: 8,
      overflow: "hidden",
      width: "100%",
    },
    partFill: {
      backgroundColor: colors.success,
      borderRadius: radius.pill,
      height: "100%",
    },
    partFillWeak: {
      backgroundColor: colors.accent,
    },
    answersCol: {
      gap: 12,
    },
    answerCard: {
      gap: 10,
    },
    answerCardCorrect: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.12)" : "#F6FCF8",
      borderColor: colors.isDark ? "rgba(31,157,108,0.34)" : "#CBEAD8",
    },
    answerCardWrong: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.12)" : "#FFF9F7",
      borderColor: colors.isDark ? "rgba(248,113,113,0.34)" : "#F1D4CF",
    },
    answerTopRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 10,
    },
    answerIndexWrap: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    answerIndex: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "900",
    },
    answerContent: {
      flex: 1,
      minWidth: 0,
    },
    answerQuestion: {
      color: colors.text,
      fontWeight: "800",
      lineHeight: 21,
    },
    stateIcon: {
      alignItems: "center",
      borderRadius: radius.pill,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    stateIconSuccess: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#E4F8E6",
    },
    stateIconDanger: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.22)" : "#FDE7E3",
    },
    optionsList: {
      gap: 6,
    },
    optionRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    optionRowCorrect: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#E7F8EA",
      borderColor: colors.success,
    },
    optionRowSelectedWrong: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.20)" : "#FDECEC",
      borderColor: colors.danger,
    },
    optionLabel: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "900",
      width: 20,
    },
    optionText: {
      color: colors.text,
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    explainButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#DFF7F1",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    explainButtonActive: {
      backgroundColor: colors.success,
    },
    explainButtonText: {
      color: colors.success,
      fontSize: 12.5,
      fontWeight: "900",
    },
    explainButtonTextActive: {
      color: colors.onPrimary,
    },
    explainPanel: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      gap: 8,
      padding: 12,
    },
    inlineLoading: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    inlineLoadingText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    explainError: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
    },
    explainBadgeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    explainBadge: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#DFF7F1",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    explainBadgeMuted: {
      backgroundColor: colors.glassFillStrong,
    },
    explainBadgeText: {
      color: colors.text,
      fontSize: 11.5,
      fontWeight: "800",
    },
    explainBody: {
      color: colors.text,
      fontSize: 13.5,
      lineHeight: 20,
    },
    tipCard: {
      alignItems: "flex-start",
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      flexDirection: "row",
      gap: 8,
      padding: 10,
    },
    tipText: {
      color: colors.primaryDark,
      flex: 1,
      fontSize: 12.5,
      fontWeight: "700",
      lineHeight: 19,
    },
  });
