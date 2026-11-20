import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import QuestionMediaBlock from "@/src/components/user/QuestionMediaBlock";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { explainMistakeQuestion, getMyMistakes } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { MistakeItem, QuestionExplainResponse } from "@/src/types/user-api";
import { safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

export default function MistakeBankScreen() {
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [retryChoices, setRetryChoices] = useState<Record<number, string>>({});
  const [aiExpandedId, setAiExpandedId] = useState<number | null>(null);
  const [aiLoadingId, setAiLoadingId] = useState<number | null>(null);
  const [aiMap, setAiMap] = useState<Record<number, QuestionExplainResponse>>({});

  const loadMistakes = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await getMyMistakes(auth.accessToken);
      setMistakes(res.data ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không tải được sổ tay câu sai.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMistakes();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadMistakes]);

  const handleExplain = async (item: MistakeItem) => {
    if (!auth.accessToken) return;
    if (aiExpandedId === item.questionId) {
      setAiExpandedId(null);
      return;
    }
    setAiExpandedId(item.questionId);
    if (aiMap[item.questionId] || aiLoadingId === item.questionId) return;

    try {
      setAiLoadingId(item.questionId);
      const res = await explainMistakeQuestion(auth.accessToken, {
        questionId: item.questionId,
        selectedAnswer: retryChoices[item.questionId] ?? item.lastSelectedLabel ?? "NONE",
        type: "BOTH",
      });
      if (res.data) {
        setAiMap((prev) => ({ ...prev, [item.questionId]: res.data }));
      }
    } finally {
      setAiLoadingId(null);
    }
  };

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/home")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
        subtitle="Tổng hợp tự động"
        title="Sổ tay câu hay sai"
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : errorMessage ? (
        <SurfaceCard>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </SurfaceCard>
      ) : mistakes.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <Ionicons color={colors.success} name="checkmark-done-circle-outline" size={38} />
          <Text style={styles.emptyTitle}>Tuyệt vời! Chưa có câu sai nào</Text>
          <Text style={styles.emptySub}>
            Các câu bạn làm sai trong đề thi thử hoặc bài luyện tập sẽ tự động lưu tại đây.
          </Text>
        </SurfaceCard>
      ) : (
        <View style={styles.listCol}>
          {mistakes.map((item, idx) => {
            const picked = retryChoices[item.questionId];
            const aiExpanded = aiExpandedId === item.questionId;
            const aiData = aiMap[item.questionId];

            return (
              <SurfaceCard key={item.questionId} style={styles.card}>
                <View style={styles.topRow}>
                  <View style={styles.partPill}>
                    <Text style={styles.partPillText}>
                      #{idx + 1} • Part {item.partNo ?? "?"}
                    </Text>
                  </View>
                  <View style={styles.wrongPill}>
                    <Text style={styles.wrongPillText}>Sai {item.wrongCount} lần</Text>
                  </View>
                </View>

                <Text numberOfLines={1} style={styles.sourceLabel}>
                  Nguồn: {item.sourceTitle}
                </Text>

                <QuestionMediaBlock
                  audioUrl={item.audioUrl}
                  imageUrl={item.imageUrl}
                  passageText={item.passageText}
                  questionGroupCode={item.questionGroupCode}
                  showTranscript
                  transcript={item.transcript}
                />

                <Text style={[styles.questionText, { fontSize: rf(14.5) }]}>
                  {item.questionText}
                </Text>

                <View style={styles.optionList}>
                  {(item.options ?? []).map((opt) => {
                    const isPicked = picked === opt.optionLabel;
                    const isCorrect = opt.optionLabel === item.correctLabel || opt.correct === true;
                    const showFeedback = Boolean(picked);
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() =>
                          setRetryChoices((prev) => ({
                            ...prev,
                            [item.questionId]: opt.optionLabel,
                          }))
                        }
                        style={[
                          styles.optionRow,
                          isPicked ? styles.optionPicked : null,
                          showFeedback && isCorrect ? styles.optionCorrect : null,
                          showFeedback && isPicked && !isCorrect ? styles.optionWrong : null,
                        ]}
                      >
                        <Text style={styles.optionLabel}>{opt.optionLabel}</Text>
                        <Text style={styles.optionText}>{opt.optionText}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.footerRow}>
                  <Text style={styles.prevWrongText}>
                    Trước chọn: {item.lastSelectedLabel ?? "Bỏ trống"}
                  </Text>
                  <Pressable onPress={() => void handleExplain(item)} style={styles.aiBtn}>
                    <Ionicons color={colors.success} name="sparkles-outline" size={14} />
                    <Text style={styles.aiBtnText}>
                      {aiExpanded ? "Ẩn AI" : "Giải thích AI"}
                    </Text>
                  </Pressable>
                </View>

                {aiExpanded ? (
                  <View style={styles.aiBox}>
                    {aiLoadingId === item.questionId ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : aiData ? (
                      <Text style={styles.aiText}>{aiData.explanation}</Text>
                    ) : (
                      <Text style={styles.aiText}>
                        {item.explanation || "Chưa có phản hồi AI cho câu hỏi này."}
                      </Text>
                    )}
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })}
        </View>
      )}
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    centerBox: {
      alignItems: "center",
      paddingVertical: 32,
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
    },
    emptyCard: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 28,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
      textAlign: "center",
    },
    emptySub: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    listCol: {
      gap: 12,
    },
    card: {
      gap: 8,
    },
    topRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    partPill: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    partPillText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
    },
    wrongPill: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.22)" : "#FFE4E1",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    wrongPillText: {
      color: colors.danger,
      fontSize: 11.5,
      fontWeight: "900",
    },
    sourceLabel: {
      color: colors.textMuted,
      fontSize: 12,
    },
    questionText: {
      color: colors.text,
      fontWeight: "800",
      lineHeight: 21,
    },
    optionList: {
      gap: 6,
      marginTop: 2,
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
      paddingVertical: 10,
    },
    optionPicked: {
      borderColor: colors.primary,
      borderWidth: 1.75,
    },
    optionCorrect: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#E7F8EA",
      borderColor: colors.success,
    },
    optionWrong: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.20)" : "#FEF3F2",
      borderColor: colors.danger,
    },
    optionLabel: {
      color: colors.primaryDark,
      fontSize: 12.5,
      fontWeight: "900",
      width: 20,
    },
    optionText: {
      color: colors.text,
      flex: 1,
      fontSize: 13.5,
    },
    footerRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
      marginTop: 4,
    },
    prevWrongText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    aiBtn: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#DFF7F1",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    aiBtnText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "800",
    },
    aiBox: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.16)" : "#EEFBF7",
      borderColor: colors.isDark ? "rgba(31,157,108,0.34)" : "#C5EADF",
      borderRadius: 12,
      borderWidth: 1,
      marginTop: 4,
      padding: 12,
    },
    aiText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 20,
    },
  });
