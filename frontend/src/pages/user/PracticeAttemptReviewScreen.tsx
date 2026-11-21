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
import { explainPracticeQuestion, getPracticeAttemptDetail } from "@/src/services/user-practice.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { QuestionExplainResponse, UserPracticeAttemptDetailResponseData } from "@/src/types/user-api";
import { safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa nộp bài";
  return new Date(value).toLocaleString();
}

export default function PracticeAttemptReviewScreen() {
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [attempt, setAttempt] = useState<UserPracticeAttemptDetailResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);
  const [aiExpandedId, setAiExpandedId] = useState<number | null>(null);
  const [aiLoadingId, setAiLoadingId] = useState<number | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<number, QuestionExplainResponse>>({});
  const [aiErrors, setAiErrors] = useState<Record<number, string>>({});

  const attemptId = useMemo(() => {
    if (!params.attemptId) return null;
    const parsed = Number(params.attemptId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.attemptId]);

  useEffect(() => {
    if (!auth.accessToken || !attemptId) return;
    const accessToken = auth.accessToken;

    const loadAttempt = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const response = await getPracticeAttemptDetail(accessToken, attemptId);
        setAttempt(response.data ?? null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Không thể tải kết quả practice.");
      } finally {
        setLoading(false);
      }
    };

    void loadAttempt();
  }, [attemptId, auth.accessToken]);

  if (loading) {
    return (
      <UserScreen hasTabDock={false} scrollable={false}>
        <View style={styles.loadingWrap}>
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
          onLeftPress={() => safeBack("/user/practice")}
          rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
          title="Xem lại practice"
        />
        <SurfaceCard>
          <Text style={styles.errorTitle}>Không tải được kết quả</Text>
          <Text style={styles.errorText}>{errorMessage ?? "Dữ liệu attempt không hợp lệ."}</Text>
        </SurfaceCard>
      </UserScreen>
    );
  }

  const answers = attempt.answers ?? [];
  const scorePercent = Math.round(attempt.score ?? 0);
  const incorrectCount = answers.filter((item) => !item.correct).length;
  const statW = gridItemWidth(3, 8, true);

  const handleExplainAi = async (psqId: number, selectedLabel: string) => {
    if (!auth.accessToken) return;
    if (aiExpandedId === psqId) {
      setAiExpandedId(null);
      return;
    }
    setAiExpandedId(psqId);
    if (aiExplanations[psqId] || aiLoadingId === psqId) return;

    try {
      setAiLoadingId(psqId);
      setAiErrors((prev) => {
        const next = { ...prev };
        delete next[psqId];
        return next;
      });
      const res = await explainPracticeQuestion(auth.accessToken, {
        practiceSetQuestionId: psqId,
        selectedAnswer: selectedLabel || "NONE",
        type: "BOTH",
      });
      if (res.data) {
        setAiExplanations((prev) => ({ ...prev, [psqId]: res.data }));
      }
    } catch (error) {
      setAiErrors((prev) => ({
        ...prev,
        [psqId]: error instanceof Error ? error.message : "Không thể tải giải thích AI.",
      }));
    } finally {
      setAiLoadingId(null);
    }
  };

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/practice")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
        title="Xem lại bài luyện tập"
      />

      <LiquidCard hero style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroCopy}>
            <Text numberOfLines={2} style={[styles.heroTitle, { fontSize: rf(19) }]}>
              {attempt.practiceSetTitle}
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
            <Text style={styles.statValue}>{attempt.totalQuestions}</Text>
            <Text style={styles.statLabel}>Tổng câu</Text>
          </View>
        </View>
      </LiquidCard>

      <SectionTitle title="Chi tiết đáp án" />
      <View style={styles.answersCol}>
        {answers.map((answer, index) => {
          const isExpanded = expandedQuestionId === answer.practiceSetQuestionId;
          return (
            <SurfaceCard
              key={answer.practiceSetQuestionId}
              style={[styles.answerCard, answer.correct ? styles.answerCardCorrect : styles.answerCardWrong]}
            >
              <View style={styles.answerTopRow}>
                <View style={styles.answerIndexWrap}>
                  <Text style={styles.answerIndex}>Q{index + 1}</Text>
                </View>
                <View style={styles.answerContent}>
                  <Text style={[styles.answerQuestion, { fontSize: rf(14.5) }]}>
                    {answer.questionText}
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
                questionGroupCode={answer.questionGroupCode}
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
                        key={`${answer.practiceSetQuestionId}-${option.optionLabel}`}
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

              <View style={styles.explainActionsRow}>
                {answer.explanation ? (
                  <Pressable
                    onPress={() =>
                      setExpandedQuestionId((prev) =>
                        prev === answer.practiceSetQuestionId ? null : answer.practiceSetQuestionId,
                      )
                    }
                    style={[styles.explainButton, isExpanded ? styles.explainButtonActive : null]}
                  >
                    <Ionicons color={isExpanded ? colors.onPrimary : colors.success} name="book-outline" size={15} />
                    <Text style={[styles.explainButtonText, isExpanded ? styles.explainButtonTextActive : null]}>
                      {isExpanded ? "Ẩn giải thích" : "Giải thích"}
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => void handleExplainAi(answer.practiceSetQuestionId, answer.selectedLabel)}
                  style={[
                    styles.explainButton,
                    aiExpandedId === answer.practiceSetQuestionId ? styles.explainButtonActive : null,
                  ]}
                >
                  <Ionicons
                    color={aiExpandedId === answer.practiceSetQuestionId ? colors.onPrimary : colors.success}
                    name="sparkles-outline"
                    size={15}
                  />
                  <Text
                    style={[
                      styles.explainButtonText,
                      aiExpandedId === answer.practiceSetQuestionId ? styles.explainButtonTextActive : null,
                    ]}
                  >
                    {aiExpandedId === answer.practiceSetQuestionId ? "Ẩn AI" : "Giải thích AI"}
                  </Text>
                </Pressable>
              </View>

              {isExpanded && answer.explanation ? (
                <View style={styles.explainPanel}>
                  <Text style={styles.explainTitle}>Giải thích câu hỏi</Text>
                  <Text style={styles.explainBody}>{answer.explanation}</Text>
                </View>
              ) : null}

              {aiExpandedId === answer.practiceSetQuestionId ? (
                <View style={styles.explainPanel}>
                  {aiLoadingId === answer.practiceSetQuestionId ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : aiErrors[answer.practiceSetQuestionId] ? (
                    <Text style={styles.errorText}>{aiErrors[answer.practiceSetQuestionId]}</Text>
                  ) : aiExplanations[answer.practiceSetQuestionId] ? (
                    <Text style={styles.explainBody}>
                      {aiExplanations[answer.practiceSetQuestionId].explanation}
                    </Text>
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
    loadingWrap: {
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
    explainActionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    explainButton: {
      alignItems: "center",
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
      gap: 6,
      padding: 12,
    },
    explainTitle: {
      color: colors.primaryDark,
      fontSize: 14,
      fontWeight: "900",
    },
    explainBody: {
      color: colors.text,
      fontSize: 13.5,
      lineHeight: 20,
    },
  });
