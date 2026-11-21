import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidCard } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { getMyGeneratedDocumentExams } from "@/src/services/user.service";
import { UserTestService } from "@/src/services/user-test.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { TestAttemptResponse, UserTestResponse } from "@/src/types/user-api";
import { pushRoute } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function formatTestTypeLabel(testType?: string | null): string {
  switch (testType) {
    case "MINI_TEST":
      return "Mini Test";
    case "FULL_TEST":
      return "Full Test";
    case "PLACEMENT":
      return "Kiểm tra trình độ";
    case "DOCUMENT_EXAM":
      return "Đề từ tài liệu";
    default:
      return "Đề thi TOEIC";
  }
}

export default function TestHubScreen() {
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, rf, isNarrow } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [tests, setTests] = useState<UserTestResponse[]>([]);
  const [docExams, setDocExams] = useState<UserTestResponse[]>([]);
  const [attempts, setAttempts] = useState<TestAttemptResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const service = useMemo(() => {
    return auth.accessToken ? new UserTestService(auth.accessToken) : null;
  }, [auth.accessToken]);

  useEffect(() => {
    if (!service || !auth.accessToken) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [testsResp, docExamsResp, attemptsResp] = await Promise.allSettled([
          service.getPublishedTests(),
          getMyGeneratedDocumentExams(auth.accessToken!),
          service.getMyAttempts(),
        ]);

        if (testsResp.status === "fulfilled") {
          setTests(testsResp.value.data || []);
        } else {
          setTests([]);
        }

        if (docExamsResp.status === "fulfilled") {
          setDocExams(docExamsResp.value.data || []);
        } else {
          setDocExams([]);
        }

        if (attemptsResp.status === "fulfilled") {
          setAttempts(attemptsResp.value.data || []);
        } else {
          setAttempts([]);
        }
      } catch (error) {
        console.error("Failed to load test hub data", error);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [auth.accessToken, service]);

  const tileGap = isNarrow ? 10 : 12;
  const quickTileW = gridItemWidth(2, tileGap);

  if (loading) {
    return (
      <UserScreen>
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </UserScreen>
    );
  }

  return (
    <UserScreen>
      <AppHeader
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
        title="Trung tâm thi"
      />

      {tests.length > 0 ? (
        <LiquidCard hero style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{formatTestTypeLabel(tests[0].testType)}</Text>
            </View>
            <View style={styles.timerChip}>
              <Ionicons color="#FFE082" name="timer-outline" size={14} />
              <Text style={styles.timerChipText}>{tests[0].totalDurationMinutes} phút</Text>
            </View>
          </View>

          <Text numberOfLines={2} style={[styles.heroTitle, { fontSize: rf(isNarrow ? 19 : 21) }]}>
            {tests[0].title}
          </Text>
          <Text numberOfLines={2} style={[styles.heroDesc, { fontSize: rf(13) }]}>
            {tests[0].description || "Làm bài bấm giờ chuẩn, lưu nháp tự động và xem giải thích chi tiết."}
          </Text>

          <LiquidButton
            label="Bắt đầu làm bài"
            leftIcon={<Ionicons color={colors.primary} name="play" size={16} />}
            onPress={() => pushRoute(`/user/exam?testId=${tests[0].id}`)}
            style={{ marginTop: 14 }}
            variant="glass"
          />
        </LiquidCard>
      ) : (
        <LiquidCard hero style={styles.heroCard}>
          <Text numberOfLines={1} style={[styles.heroTitle, { fontSize: rf(isNarrow ? 19 : 21) }]}>
            Phòng thi & Đấu trường TOEIC
          </Text>
          <Text numberOfLines={2} style={[styles.heroDesc, { fontSize: rf(13) }]}>
            Bạn có thể thử Đấu trường 1v1, ôn lại câu hay sai hoặc tải tài liệu lên để tạo đề thi.
          </Text>
        </LiquidCard>
      )}

      <View style={[styles.bentoRow, { gap: tileGap }]}>
        <Pressable
          onPress={() => pushRoute("/user/arena")}
          style={({ pressed }) => [
            { width: quickTileW },
            pressed ? { opacity: 0.9, transform: [{ scale: 0.98 }] } : null,
          ]}
        >
          <LiquidCard hero padding="sm" style={styles.bentoTile}>
            <View style={styles.bentoIconArena}>
              <Ionicons color={colors.accentGradient[0]} name="flash" size={18} />
            </View>
            <Text numberOfLines={1} style={[styles.arenaTitle, { fontSize: rf(14) }]}>
              Đấu trường 1v1
            </Text>
            <Text numberOfLines={1} style={styles.arenaSub}>
              So tài trực tiếp
            </Text>
          </LiquidCard>
        </Pressable>

        <Pressable
          onPress={() => pushRoute("/user/mistakes")}
          style={({ pressed }) => [
            { width: quickTileW },
            pressed ? { opacity: 0.9, transform: [{ scale: 0.98 }] } : null,
          ]}
        >
          <SurfaceCard padding="sm" style={styles.bentoTile}>
            <View style={styles.bentoIconMistake}>
              <Ionicons color={colors.danger} name="alert-circle-outline" size={18} />
            </View>
            <Text numberOfLines={1} style={[styles.mistakeTitle, { fontSize: rf(14) }]}>
              Sổ tay câu sai
            </Text>
            <Text numberOfLines={1} style={styles.mistakeSub}>
              Làm lại câu hay sai
            </Text>
          </SurfaceCard>
        </Pressable>
      </View>

      <Pressable
        onPress={() => pushRoute("/user/document-exam")}
        style={({ pressed }) => [{ marginBottom: 14 }, pressed ? { opacity: 0.92 } : null]}
      >
        <SurfaceCard padding="sm" style={styles.itemCard}>
          <View style={styles.itemRow}>
            <View style={styles.bentoIconArena}>
              <Ionicons color={colors.primary} name="document-text-outline" size={20} />
            </View>
            <View style={styles.itemMain}>
              <Text numberOfLines={1} style={[styles.itemTitle, { fontSize: rf(14.5) }]}>
                Tạo đề thi từ Tài liệu
              </Text>
              <Text numberOfLines={1} style={styles.itemMeta}>
                Tải file Word, PDF hoặc ảnh chụp đề thi lên để luyện tập
              </Text>
            </View>
            <Ionicons color={colors.primary} name="chevron-forward" size={18} />
          </View>
        </SurfaceCard>
      </Pressable>

      {docExams.length > 0 ? (
        <>
          <SectionTitle title="Đề tạo từ tài liệu của bạn" />
          <View style={styles.listCol}>
            {docExams.map((exam) => (
              <Pressable
                key={`doc-exam-${exam.id}`}
                onPress={() => pushRoute(`/user/exam?testId=${exam.id}`)}
                style={({ pressed }) => [pressed ? { opacity: 0.9 } : null]}
              >
                <SurfaceCard padding="sm" style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemMain}>
                      <Text numberOfLines={1} style={[styles.itemTitle, { fontSize: rf(14.5) }]}>
                        {exam.title}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {exam.questionCount ?? 0} câu • {formatTestTypeLabel(exam.testType)} • {exam.totalDurationMinutes} phút
                      </Text>
                    </View>
                    <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
                  </View>
                </SurfaceCard>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {tests.slice(1).length > 0 ? (
        <>
          <SectionTitle title="Đề thi khác" />
          <View style={styles.listCol}>
            {tests.slice(1).map((test) => (
              <Pressable
                key={test.id}
                onPress={() => pushRoute(`/user/exam?testId=${test.id}`)}
                style={({ pressed }) => [pressed ? { opacity: 0.9 } : null]}
              >
                <SurfaceCard padding="sm" style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemMain}>
                      <Text numberOfLines={1} style={[styles.itemTitle, { fontSize: rf(14.5) }]}>
                        {test.title}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {formatTestTypeLabel(test.testType)} • {test.totalDurationMinutes} phút
                      </Text>
                    </View>
                    <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
                  </View>
                </SurfaceCard>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle title="Kết quả gần đây" />
      {attempts.length > 0 ? (
        <View style={styles.listCol}>
          {attempts.map((attempt) => (
            <Pressable
              key={attempt.attemptId}
              onPress={() => pushRoute(`/user/attempt-review?attemptId=${attempt.attemptId}`)}
              style={({ pressed }) => [pressed ? { opacity: 0.9 } : null]}
            >
              <SurfaceCard padding="sm" style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={styles.itemMain}>
                    <Text numberOfLines={1} style={[styles.itemTitle, { fontSize: rf(14.5) }]}>
                      {attempt.testTitle}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {new Date(attempt.startedAt).toLocaleDateString()} • {attempt.correctCount}/{attempt.totalQuestions} đúng
                    </Text>
                    <View style={styles.aiTag}>
                      <Ionicons color={colors.success} name="sparkles-outline" size={13} />
                      <Text style={styles.aiTagText}>Xem bài & giải thích AI</Text>
                    </View>
                  </View>

                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreText}>
                      {attempt.toeicScore ? `${attempt.toeicScore} TOEIC` : `${Math.round(attempt.score || 0)}%`}
                    </Text>
                  </View>
                </View>
              </SurfaceCard>
            </Pressable>
          ))}
        </View>
      ) : (
        <SurfaceCard>
          <Text style={styles.emptyText}>Chưa có lượt thi thử nào. Bắt đầu ngay hôm nay!</Text>
        </SurfaceCard>
      )}
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    loadingState: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    heroCard: {
      marginBottom: 14,
    },
    heroTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    typePill: {
      backgroundColor: "rgba(255,255,255,0.14)",
      borderColor: "rgba(255,255,255,0.22)",
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    typePillText: {
      color: colors.heroText,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    timerChip: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    timerChipText: {
      color: colors.heroText,
      fontSize: 12,
      fontWeight: "800",
    },
    heroTitle: {
      color: colors.heroText,
      fontWeight: "900",
      lineHeight: 26,
    },
    heroDesc: {
      color: colors.heroTextMuted,
      lineHeight: 19,
      marginTop: 5,
    },
    bentoRow: {
      flexDirection: "row",
      marginBottom: 18,
    },
    bentoTile: {
      minHeight: 104,
    },
    bentoIconArena: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderRadius: 12,
      height: 34,
      justifyContent: "center",
      marginBottom: 8,
      width: 34,
    },
    bentoIconMistake: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.2)" : "#FFE5E2",
      borderRadius: 12,
      height: 34,
      justifyContent: "center",
      marginBottom: 8,
      width: 34,
    },
    arenaTitle: {
      color: colors.heroText,
      fontWeight: "900",
    },
    arenaSub: {
      color: colors.heroTextMuted,
      fontSize: 11.5,
      marginTop: 2,
    },
    mistakeTitle: {
      color: colors.text,
      fontWeight: "900",
    },
    mistakeSub: {
      color: colors.textMuted,
      fontSize: 11.5,
      marginTop: 2,
    },
    listCol: {
      gap: 10,
      marginBottom: 18,
    },
    itemCard: {
      width: "100%",
    },
    itemRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
    },
    itemMain: {
      flex: 1,
      minWidth: 0,
    },
    itemTitle: {
      color: colors.text,
      fontWeight: "800",
    },
    itemMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 3,
    },
    aiTag: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.20)" : "#DFF7F1",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      marginTop: 8,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    aiTagText: {
      color: colors.success,
      fontSize: 11.5,
      fontWeight: "800",
    },
    scoreBadge: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#E3FFDE",
      borderRadius: radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    scoreText: {
      color: colors.success,
      fontSize: 12.5,
      fontWeight: "900",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: "center",
    },
  });
