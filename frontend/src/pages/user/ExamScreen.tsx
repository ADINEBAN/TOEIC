import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidIconButton } from "@/src/components/ui/LiquidGlass";
import ProgressBar from "@/src/components/user/ProgressBar";
import QuestionMediaBlock from "@/src/components/user/QuestionMediaBlock";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { UserTestService } from "@/src/services/user-test.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { TestAttemptResponse, UserTestResponse } from "@/src/types/user-api";
import { replaceRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";
import { alertCrossPlatform } from "@/src/utils/web-dialog";

type ExamDraft = {
  answers: Record<number, string>;
  flaggedIds: number[];
};

const examDraftMemoryFallback: Record<string, string> = {};

function readExamDraft(key: string): ExamDraft | null {
  try {
    const raw =
      Platform.OS === "web" && typeof localStorage !== "undefined"
        ? localStorage.getItem(key)
        : examDraftMemoryFallback[key] ?? null;
    if (!raw) return null;
    return JSON.parse(raw) as ExamDraft;
  } catch {
    return null;
  }
}

function saveExamDraft(key: string, draft: ExamDraft) {
  try {
    const serialized = JSON.stringify(draft);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, serialized);
    } else {
      examDraftMemoryFallback[key] = serialized;
    }
  } catch {
    // Ignore storage quota/private mode failures
  }
}

function clearExamDraft(key: string) {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    } else {
      delete examDraftMemoryFallback[key];
    }
  } catch {
    // Ignore cleanup errors
  }
}

export default function ExamScreen() {
  const { testId, partFilter, retryIds } = useLocalSearchParams<{
    testId: string;
    partFilter?: string;
    retryIds?: string;
  }>();
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, isNarrow, isTablet, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [test, setTest] = useState<UserTestResponse | null>(null);
  const [attempt, setAttempt] = useState<TestAttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [flaggedIds, setFlaggedIds] = useState<number[]>([]);
  const [showNavigator, setShowNavigator] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const draftStorageKey = `toeic_exam_draft_${testId ?? "unknown"}`;

  const service = useMemo(() => {
    return auth.accessToken ? new UserTestService(auth.accessToken) : null;
  }, [auth.accessToken]);

  const allQuestions = useMemo(() => {
    if (!test?.parts) return [];
    const targetPart = partFilter ? Number.parseInt(partFilter, 10) : NaN;
    const retrySet = retryIds
      ? new Set(
          retryIds
            .split(",")
            .map((v) => Number.parseInt(v.trim(), 10))
            .filter((n) => Number.isFinite(n)),
        )
      : null;

    const flattened = test.parts.flatMap((part) =>
      (part.questions || []).map((question) => ({
        ...question,
        partName: part.partName,
      })),
    );
    const filtered = flattened.filter((q) => {
      if (Number.isFinite(targetPart) && q.partNo !== targetPart) {
        return false;
      }
      if (retrySet && retrySet.size > 0 && !retrySet.has(q.id)) {
        return false;
      }
      return true;
    });
    return filtered.length > 0 ? filtered : flattened;
  }, [partFilter, retryIds, test]);

  const currentQuestion = allQuestions[currentIndex];

  useEffect(() => {
    if (!service || !testId) return;

    const initTest = async () => {
      try {
        setLoading(true);
        const id = Number.parseInt(testId, 10);
        const [testResp, attemptResp] = await Promise.all([
          service.getTestById(id),
          service.startTest(id),
        ]);
        setTest(testResp.data);
        setAttempt(attemptResp.data);
        setTimeLeft((testResp.data?.totalDurationMinutes ?? 15) * 60);
        const restored = readExamDraft(draftStorageKey);
        if (restored?.answers) {
          setUserAnswers(restored.answers);
          setFlaggedIds(Array.isArray(restored.flaggedIds) ? restored.flaggedIds : []);
        }
      } catch (error) {
        console.error("Failed to start test", error);
        alertCrossPlatform("Lỗi", "Không thể bắt đầu bài thi. Vui lòng thử lại sau.");
        safeBack("/user/test");
      } finally {
        setLoading(false);
      }
    };

    void initTest();
  }, [draftStorageKey, service, testId]);

  const performSubmit = useCallback(async () => {
    if (!service || !attempt) {
      setSubmitError("Không tìm thấy phiên làm bài. Vui lòng tải lại trang và thử lại.");
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);
      const answers = Object.entries(userAnswers).map(([id, label]) => ({
        selectedLabel: label,
        testPartQuestionId: Number.parseInt(id, 10),
      }));
      const res = await service.submitAttempt(attempt.attemptId, { answers });
      clearExamDraft(draftStorageKey);
      setShowSubmitConfirm(false);
      const earned = res.data?.diamondsEarned ?? 0;
      if (auth.user && typeof res.data?.currentDiamonds === "number") {
        updateUserProfile({ ...auth.user, diamonds: res.data.currentDiamonds });
      }
      if (earned > 0 && Platform.OS !== "web") {
        alertCrossPlatform("Thành công", `Bài thi của bạn đã được nộp (+${earned} 💎)!`);
      }
      replaceRoute(`/user/attempt-review?attemptId=${res.data?.attemptId ?? attempt.attemptId}`);
    } catch (error) {
      console.error("Failed to submit test", error);
      const msg = error instanceof Error ? error.message : "Nộp bài thất bại. Vui lòng thử lại.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [attempt, auth.user, draftStorageKey, service, updateUserProfile, userAnswers]);

  useEffect(() => {
    if (timeLeft <= 0 || loading || !attempt) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          alertCrossPlatform("Hết giờ", "Thời gian làm bài đã hết. Hệ thống sẽ tự động nộp bài.");
          void performSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt, loading, performSubmit, timeLeft]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    return `${minutes}:${remainSeconds < 10 ? "0" : ""}${remainSeconds}`;
  };

  const handleSelectOption = (label: string) => {
    if (!currentQuestion) return;
    setUserAnswers((prev) => {
      const nextAnswers = { ...prev, [currentQuestion.id]: label };
      saveExamDraft(draftStorageKey, { answers: nextAnswers, flaggedIds });
      return nextAnswers;
    });
  };

  const handleToggleFlag = () => {
    if (!currentQuestion) return;
    setFlaggedIds((prev) => {
      const nextFlags = prev.includes(currentQuestion.id)
        ? prev.filter((id) => id !== currentQuestion.id)
        : [...prev, currentQuestion.id];
      saveExamDraft(draftStorageKey, { answers: userAnswers, flaggedIds: nextFlags });
      return nextFlags;
    });
  };

  const handleSubmit = () => {
    setSubmitError(null);
    setShowSubmitConfirm(true);
  };

  if (loading || !test || !currentQuestion) {
    return (
      <UserScreen hasTabDock={false}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </UserScreen>
    );
  }

  const selectedOptionLabel = userAnswers[currentQuestion.id];
  const navCols = isNarrow ? 6 : isTablet ? 10 : 7;
  const navCellW = gridItemWidth(navCols, 6, true);
  const progressPct = allQuestions.length ? ((currentIndex + 1) / allQuestions.length) * 100 : 0;

  return (
    <UserScreen hasTabDock={false}>
      <View style={styles.topBar}>
        <LiquidIconButton accessibilityLabel="Thoát" onPress={() => safeBack("/user/test")}>
          <Ionicons color={colors.primaryDark} name="close" size={20} />
        </LiquidIconButton>

        <View style={styles.titleCenter}>
          <Text numberOfLines={1} style={[styles.title, { fontSize: rf(16) }]}>
            {test.title}
          </Text>
          <Text numberOfLines={1} style={styles.partSubText}>
            {(currentQuestion as typeof currentQuestion & { partName?: string }).partName ?? "TOEIC"}
          </Text>
        </View>

        <View style={styles.timerPill}>
          <Ionicons color={colors.danger} name="timer-outline" size={14} />
          <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
        </View>
      </View>

      <View style={styles.metaStrip}>
        <View style={{ flex: 1 }}>
          <ProgressBar
            accentColor={colors.primary}
            label={`Câu ${currentIndex + 1} / ${allQuestions.length}`}
            rightLabel={`Đã làm ${Object.keys(userAnswers).length}`}
            value={progressPct}
          />
        </View>

        <View style={styles.metaBtns}>
          <Pressable
            onPress={handleToggleFlag}
            style={[
              styles.toolChip,
              flaggedIds.includes(currentQuestion.id) ? styles.flagChipActive : null,
            ]}
          >
            <Ionicons
              color={flaggedIds.includes(currentQuestion.id) ? colors.accent : colors.textMuted}
              name={flaggedIds.includes(currentQuestion.id) ? "flag" : "flag-outline"}
              size={15}
            />
          </Pressable>

          <Pressable
            onPress={() => setShowNavigator((prev) => !prev)}
            style={[styles.toolChip, showNavigator ? styles.toolChipActive : null]}
          >
            <Ionicons
              color={showNavigator ? colors.onPrimary : colors.primaryDark}
              name="grid-outline"
              size={15}
            />
          </Pressable>
        </View>
      </View>

      {showNavigator ? (
        <SurfaceCard padding="sm" style={styles.navigatorCard}>
          <View style={styles.navigatorGrid}>
            {allQuestions.map((q, idx) => {
              const answered = Boolean(userAnswers[q.id]);
              const flagged = flaggedIds.includes(q.id);
              const active = idx === currentIndex;
              return (
                <Pressable
                  key={q.id}
                  onPress={() => {
                    setCurrentIndex(idx);
                    setShowNavigator(false);
                  }}
                  style={[
                    styles.navCell,
                    { width: navCellW },
                    answered ? styles.navCellAnswered : null,
                    flagged ? styles.navCellFlagged : null,
                    active ? styles.navCellActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.navCellText,
                      answered && !active ? styles.navCellTextAnswered : null,
                    ]}
                  >
                    {idx + 1}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SurfaceCard>
      ) : null}

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
          const selected = selectedOptionLabel === option.optionLabel;
          return (
            <Pressable
              key={option.id}
              onPress={() => handleSelectOption(option.optionLabel)}
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
          disabled={currentIndex === allQuestions.length - 1}
          label="Câu tiếp"
          onPress={() => setCurrentIndex((prev) => Math.min(allQuestions.length - 1, prev + 1))}
          style={{ flex: 1.2 }}
          variant="primary"
        />
        <LiquidButton
          compact
          disabled={submitting}
          label={submitting ? "Đang nộp..." : "Nộp bài"}
          onPress={handleSubmit}
          style={{ flex: 0.9 }}
          variant="accent"
        />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!submitting) setShowSubmitConfirm(false);
        }}
        transparent
        visible={showSubmitConfirm}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmPanel}>
            <Text style={styles.confirmTitle}>Xác nhận nộp bài</Text>
            <Text style={styles.confirmBody}>
              Bạn đã làm {Object.keys(userAnswers).length} / {allQuestions.length} câu.
              {Object.keys(userAnswers).length < allQuestions.length
                ? ` Còn ${allQuestions.length - Object.keys(userAnswers).length} câu chưa chọn đáp án.`
                : ""}
            </Text>
            {submitError ? <Text style={styles.confirmError}>{submitError}</Text> : null}
            <View style={styles.confirmActions}>
              <LiquidButton
                compact
                disabled={submitting}
                label="Làm tiếp"
                onPress={() => setShowSubmitConfirm(false)}
                style={{ flex: 1 }}
                variant="glass"
              />
              <LiquidButton
                compact
                disabled={submitting}
                label={submitting ? "Đang nộp..." : "Nộp bài ngay"}
                onPress={() => void performSubmit()}
                style={{ flex: 1.2 }}
                variant="accent"
              />
            </View>
          </View>
        </View>
      </Modal>
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
    metaStrip: {
      alignItems: "flex-end",
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    metaBtns: {
      flexDirection: "row",
      gap: 6,
    },
    toolChip: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1.25,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    toolChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    flagChipActive: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    navigatorCard: {
      marginBottom: 14,
    },
    navigatorGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    navCell: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 10,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
    },
    navCellAnswered: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    navCellFlagged: {
      borderColor: colors.accent,
      borderWidth: 2,
    },
    navCellActive: {
      borderColor: colors.text,
      borderWidth: 2,
    },
    navCellText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
    },
    navCellTextAnswered: {
      color: colors.onPrimary,
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
    confirmBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(15, 23, 42, 0.55)",
      flex: 1,
      justifyContent: "center",
      padding: 20,
    },
    confirmPanel: {
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 20,
      borderWidth: 1,
      gap: 12,
      maxWidth: 420,
      padding: 20,
      width: "100%",
    },
    confirmTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "900",
    },
    confirmBody: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    confirmError: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
    },
    confirmActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
    },
  });
