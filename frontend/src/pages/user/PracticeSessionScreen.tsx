import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidIconButton } from "@/src/components/ui/LiquidGlass";
import ProgressBar from "@/src/components/user/ProgressBar";
import QuestionMediaBlock from "@/src/components/user/QuestionMediaBlock";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { getPracticeSetDetail, startPractice, submitPractice } from "@/src/services/user-practice.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import {
  UserPracticeAttemptResponse,
  UserPracticeQuestionResponse,
  UserPracticeSetDetailResponseData,
} from "@/src/types/user-api";
import { replaceRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

export default function PracticeSessionScreen() {
  const { practiceSetId, moduleId } = useLocalSearchParams<{ practiceSetId?: string; moduleId?: string }>();
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [practiceSet, setPracticeSet] = useState<UserPracticeSetDetailResponseData | null>(null);
  const [attempt, setAttempt] = useState<UserPracticeAttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);

  const parsedPracticeSetId = useMemo(() => {
    if (!practiceSetId) return null;
    const parsed = Number(practiceSetId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [practiceSetId]);

  const parsedModuleId = useMemo(() => {
    if (!moduleId) return null;
    const parsed = Number(moduleId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [moduleId]);

  const questions = practiceSet?.questions ?? [];
  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (!auth.accessToken || !parsedPracticeSetId) return;
    const accessToken = auth.accessToken;

    const initPractice = async () => {
      try {
        setLoading(true);
        const [detailResp, attemptResp] = await Promise.all([
          getPracticeSetDetail(accessToken, parsedPracticeSetId),
          startPractice(accessToken, parsedPracticeSetId),
        ]);
        setPracticeSet(detailResp.data ?? null);
        setAttempt(attemptResp.data ?? null);
        setTimeLeft((detailResp.data?.durationMinutes ?? 0) * 60);
      } catch (error) {
        Alert.alert("Practice", error instanceof Error ? error.message : "Không thể bắt đầu bài tập.");
        safeBack(parsedModuleId ? `/user/practice-module?moduleId=${parsedModuleId}` : "/user/practice");
      } finally {
        setLoading(false);
      }
    };

    void initPractice();
  }, [auth.accessToken, parsedModuleId, parsedPracticeSetId]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleSelectOption = (question: UserPracticeQuestionResponse, label: string) => {
    const questionKey = question.practiceSetQuestionId ?? question.id;
    setUserAnswers((prev) => ({
      ...prev,
      [questionKey]: label,
    }));
  };

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!auth.accessToken || !attempt) return;
      const accessToken = auth.accessToken;

      try {
        setLoading(true);
        const answers = Object.entries(userAnswers).map(([id, selectedLabel]) => ({
          practiceSetQuestionId: Number(id),
          selectedLabel,
        }));
        const response = await submitPractice(accessToken, attempt.id, { answers });
        const earned = response.data?.diamondsEarned ?? 0;
        if (auth.user && typeof response.data?.currentDiamonds === "number") {
          updateUserProfile({ ...auth.user, diamonds: response.data.currentDiamonds });
        }

        if (!auto) {
          Alert.alert(
            "Hoàn thành luyện tập",
            earned > 0
              ? `Đã nộp bài thành công (+${earned} 💎)!`
              : "Đã nộp bài thành công.",
          );
        }

        replaceRoute(
          `/user/practice-attempt-review?attemptId=${response.data?.attemptId ?? attempt.id}&moduleId=${parsedModuleId ?? ""}`,
        );
      } catch (error) {
        Alert.alert("Practice", error instanceof Error ? error.message : "Không thể nộp bài.");
      } finally {
        setLoading(false);
      }
    },
    [attempt, auth.accessToken, auth.user, parsedModuleId, updateUserProfile, userAnswers],
  );

  useEffect(() => {
    if (timeLeft <= 0 || loading || !attempt) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt, handleSubmit, loading, timeLeft]);

  const confirmSubmit = () => {
    Alert.alert("Nộp bài", "Bạn có chắc muốn nộp bài ngay bây giờ?", [
      { text: "Hủy", style: "cancel" },
      { text: "Nộp bài", onPress: () => void handleSubmit(false) },
    ]);
  };

  if (loading || !practiceSet || !currentQuestion) {
    return (
      <UserScreen hasTabDock={false} scrollable={false}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </UserScreen>
    );
  }

  const selectedOption = userAnswers[currentQuestion.practiceSetQuestionId ?? currentQuestion.id];
  const progressPct = questions.length ? ((currentIndex + 1) / questions.length) * 100 : 0;

  return (
    <UserScreen hasTabDock={false}>
      <View style={styles.topBar}>
        <LiquidIconButton
          accessibilityLabel="Đóng"
          onPress={() => safeBack(parsedModuleId ? `/user/practice-module?moduleId=${parsedModuleId}` : "/user/practice")}
        >
          <Ionicons color={colors.primaryDark} name="close" size={20} />
        </LiquidIconButton>

        <View style={styles.titleCenter}>
          <Text numberOfLines={1} style={[styles.title, { fontSize: rf(16) }]}>
            {practiceSet.title}
          </Text>
          <Text numberOfLines={1} style={styles.partSubText}>
            Part {practiceSet.partNo ?? "--"}
          </Text>
        </View>

        <View style={styles.timerPill}>
          <Ionicons color={colors.danger} name="timer-outline" size={14} />
          <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <ProgressBar
          accentColor={colors.primary}
          label={`Câu ${currentIndex + 1} / ${questions.length}`}
          rightLabel={`Đã chọn ${Object.keys(userAnswers).length}`}
          value={progressPct}
        />
      </View>

      <QuestionMediaBlock
        audioUrl={currentQuestion.audioUrl}
        imageUrl={currentQuestion.imageUrl}
        passageText={currentQuestion.passageText}
        questionGroupCode={currentQuestion.questionGroupCode}
      />

      <SurfaceCard style={styles.promptCard}>
        <Text style={[styles.prompt, { fontSize: rf(17), lineHeight: rf(25) }]}>
          {currentQuestion.questionText}
        </Text>
      </SurfaceCard>

      <View style={styles.optionsList}>
        {(currentQuestion.options ?? []).map((option) => {
          const selected = selectedOption === option.optionLabel;
          return (
            <Pressable
              key={option.id}
              onPress={() => handleSelectOption(currentQuestion, option.optionLabel)}
              style={[styles.optionCard, selected ? styles.optionSelected : null]}
            >
              <View style={[styles.optionBadge, selected ? styles.optionBadgeSelected : null]}>
                <Text style={[styles.optionBadgeText, selected ? styles.optionBadgeTextSelected : null]}>
                  {option.optionLabel}
                </Text>
              </View>
              <Text style={[styles.optionText, { fontSize: rf(15) }]}>{option.optionText}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bottomActions}>
        <LiquidButton
          compact
          disabled={currentIndex === 0}
          label="Trước"
          onPress={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          style={{ flex: 1 }}
          variant="glass"
        />
        <LiquidButton
          compact
          disabled={currentIndex === questions.length - 1}
          label="Câu tiếp"
          onPress={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
          style={{ flex: 1.2 }}
          variant="primary"
        />
        <LiquidButton
          compact
          label="Nộp bài"
          onPress={confirmSubmit}
          style={{ flex: 0.9 }}
          variant="accent"
        />
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
    topBar: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    titleCenter: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: colors.text,
      fontWeight: "900",
    },
    partSubText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
      marginTop: 1,
    },
    timerPill: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.18)" : "#FFE3DF",
      borderColor: colors.isDark ? "rgba(248,113,113,0.34)" : "#F8C3BB",
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    timerText: {
      color: colors.danger,
      fontSize: 13.5,
      fontWeight: "900",
    },
    progressWrap: {
      marginBottom: 14,
    },
    promptCard: {
      marginBottom: 12,
    },
    prompt: {
      color: colors.text,
      fontWeight: "700",
    },
    optionsList: {
      gap: 10,
      marginBottom: 16,
    },
    optionCard: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1.25,
      flexDirection: "row",
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    optionSelected: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 1.75,
    },
    optionBadge: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    optionBadgeSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionBadgeText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "900",
    },
    optionBadgeTextSelected: {
      color: colors.onPrimary,
    },
    optionText: {
      color: colors.text,
      flex: 1,
      fontWeight: "600",
      lineHeight: 21,
    },
    bottomActions: {
      flexDirection: "row",
      gap: 8,
    },
  });
