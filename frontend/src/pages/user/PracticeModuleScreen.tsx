import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  getMyPracticeAttempts,
  getPracticeSetDetail,
  getPracticeSetsByModule,
} from "@/src/services/user-practice.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import {
  PracticeSetApiItem,
  UserPracticeAttemptResponse,
  UserPracticeSetDetailResponseData,
} from "@/src/types/user-api";
import { pushRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

export default function PracticeModuleScreen() {
  const params = useLocalSearchParams<{ moduleId?: string }>();
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [practiceSets, setPracticeSets] = useState<PracticeSetApiItem[]>([]);
  const [attempts, setAttempts] = useState<UserPracticeAttemptResponse[]>([]);
  const [selectedSet, setSelectedSet] = useState<UserPracticeSetDetailResponseData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const moduleId = useMemo(() => {
    if (!params.moduleId) return null;
    const parsed = Number(params.moduleId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [params.moduleId]);

  const loadData = useCallback(async () => {
    if (!auth.accessToken || !moduleId) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      let nextSets: PracticeSetApiItem[] = [];

      const [setsResp, attemptsResp] = await Promise.allSettled([
        getPracticeSetsByModule(auth.accessToken, moduleId),
        getMyPracticeAttempts(auth.accessToken),
      ]);

      if (setsResp.status === "fulfilled") {
        nextSets = setsResp.value.data ?? [];
        setPracticeSets(nextSets);

        if (nextSets[0]?.id) {
          setDetailLoading(true);
          try {
            const detail = await getPracticeSetDetail(auth.accessToken, nextSets[0].id);
            setSelectedSet(detail.data ?? null);
          } finally {
            setDetailLoading(false);
          }
        } else {
          setSelectedSet(null);
        }
      } else {
        setPracticeSets([]);
        setSelectedSet(null);
        setErrorMessage(
          setsResp.reason instanceof Error ? setsResp.reason.message : "Không thể tải practice sets.",
        );
      }

      if (attemptsResp.status === "fulfilled") {
        const ownAttempts = (attemptsResp.value.data ?? []).filter((item) =>
          nextSets.some((set) => set.id === item.practiceSetId),
        );
        setAttempts(ownAttempts);
      } else {
        setAttempts([]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải luyện đề.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, moduleId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleSelectSet = async (practiceSetId: number) => {
    if (!auth.accessToken) return;
    try {
      setDetailLoading(true);
      const response = await getPracticeSetDetail(auth.accessToken, practiceSetId);
      setSelectedSet(response.data ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải chi tiết bộ bài tập.");
    } finally {
      setDetailLoading(false);
    }
  };

  const currentAttempts = useMemo(() => {
    if (!selectedSet) return [];
    return attempts.filter((item) => item.practiceSetId === selectedSet.id).slice(0, 3);
  }, [attempts, selectedSet]);

  if (loading) {
    return (
      <UserScreen hasTabDock={false} scrollable={false}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </UserScreen>
    );
  }

  const statW = gridItemWidth(3, 8, true);

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack(moduleId ? `/user/roadmap?moduleId=${moduleId}` : "/user/practice")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
        subtitle="Bài tập theo module"
        title="Bộ Practice"
      />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <SectionTitle title="Danh sách practice sets" />
      <SurfaceCard padding="sm" style={styles.listCard}>
        {practiceSets.length === 0 ? (
          <Text style={styles.emptyText}>Module này chưa có practice set nào.</Text>
        ) : (
          <View style={styles.setList}>
            {practiceSets.map((set) => {
              const active = selectedSet?.id === set.id;
              return (
                <Pressable
                  key={set.id}
                  onPress={() => void handleSelectSet(set.id)}
                  style={[styles.setRow, active ? styles.setRowActive : null]}
                >
                  <View style={[styles.setIcon, active ? styles.setIconActive : null]}>
                    <Ionicons
                      color={active ? colors.onPrimary : colors.primaryDark}
                      name="document-text-outline"
                      size={17}
                    />
                  </View>
                  <View style={styles.setBody}>
                    <Text numberOfLines={1} style={[styles.setTitle, { fontSize: rf(14) }]}>
                      {set.title}
                    </Text>
                    <Text style={styles.setMeta}>
                      {set.durationMinutes ?? "--"} phút • Part {set.partNo ?? "--"}
                    </Text>
                  </View>
                  <Ionicons color={colors.textMuted} name="chevron-forward" size={17} />
                </Pressable>
              );
            })}
          </View>
        )}
      </SurfaceCard>

      <SectionTitle title="Chi tiết bộ bài tập" />
      <SurfaceCard style={styles.detailCard}>
        {detailLoading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.inlineLoadingText}>Đang tải chi tiết practice set...</Text>
          </View>
        ) : selectedSet ? (
          <>
            <Text style={[styles.detailTitle, { fontSize: rf(19) }]}>{selectedSet.title}</Text>
            <Text style={styles.detailText}>
              {selectedSet.description || "Củng cố kiến thức vừa học trong module này."}
            </Text>

            <View style={styles.statsRow}>
              <View style={[styles.statBadge, { width: statW }]}>
                <Text style={styles.statValue}>{selectedSet.durationMinutes ?? "--"}</Text>
                <Text style={styles.statLabel}>Phút</Text>
              </View>
              <View style={[styles.statBadge, { width: statW }]}>
                <Text style={styles.statValue}>
                  {selectedSet.questions?.length ?? selectedSet.questionCount ?? "--"}
                </Text>
                <Text style={styles.statLabel}>Câu hỏi</Text>
              </View>
              <View style={[styles.statBadge, { width: statW }]}>
                <Text style={styles.statValue}>{selectedSet.targetScore ?? "--"}</Text>
                <Text style={styles.statLabel}>Mục tiêu</Text>
              </View>
            </View>

            <LiquidButton
              label="Bắt đầu bài tập"
              leftIcon={<Ionicons color={colors.onPrimary} name="play" size={16} />}
              onPress={() => pushRoute(`/user/practice-session?practiceSetId=${selectedSet.id}&moduleId=${moduleId}`)}
              style={{ marginTop: 14 }}
              variant="primary"
            />

            {currentAttempts.length > 0 ? (
              <View style={styles.attemptList}>
                <Text style={styles.attemptTitle}>Lần làm gần đây</Text>
                {currentAttempts.map((attempt) => (
                  <Pressable
                    key={attempt.id}
                    onPress={() => pushRoute(`/user/practice-attempt-review?attemptId=${attempt.id}`)}
                    style={styles.attemptRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attemptMain}>
                        {new Date(attempt.startedAt).toLocaleDateString()} • {attempt.correctCount ?? 0}/{attempt.totalQuestions}
                      </Text>
                      <Text style={styles.attemptSub}>Chạm để xem kết quả & AI giải thích</Text>
                    </View>
                    <View style={styles.scorePill}>
                      <Text style={styles.scorePillText}>{Math.round(attempt.score ?? 0)}%</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.emptyText}>Chọn một practice set phía trên để xem chi tiết.</Text>
        )}
      </SurfaceCard>
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
    errorText: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.16)" : "rgba(249,112,102,0.1)",
      borderColor: colors.isDark ? "rgba(248,113,113,0.34)" : "rgba(249,112,102,0.24)",
      borderRadius: 12,
      borderWidth: 1,
      color: colors.danger,
      fontSize: 13,
      marginBottom: 14,
      padding: 12,
    },
    listCard: {
      marginBottom: 16,
    },
    setList: {
      gap: 8,
    },
    setRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 12,
    },
    setRowActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    setIcon: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    setIconActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    setBody: {
      flex: 1,
      minWidth: 0,
    },
    setTitle: {
      color: colors.text,
      fontWeight: "800",
    },
    setMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    detailCard: {
      gap: 8,
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
    detailTitle: {
      color: colors.text,
      fontWeight: "900",
    },
    detailText: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 20,
    },
    statsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    statBadge: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 10,
    },
    statValue: {
      color: colors.primaryDark,
      fontSize: 19,
      fontWeight: "900",
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      marginTop: 2,
    },
    attemptList: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      marginTop: 14,
      paddingTop: 12,
    },
    attemptTitle: {
      color: colors.primaryDark,
      fontSize: 14,
      fontWeight: "900",
      marginBottom: 8,
    },
    attemptRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
      padding: 10,
    },
    attemptMain: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: "800",
    },
    attemptSub: {
      color: colors.textMuted,
      fontSize: 11.5,
      marginTop: 2,
    },
    scorePill: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#E3FFDE",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    scorePillText: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "900",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13.5,
      textAlign: "center",
    },
  });
