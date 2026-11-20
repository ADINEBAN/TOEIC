import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidCard } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  assignRecommendedPath,
  getMyProfile,
  getUserLearningPathCatalog,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { UserLearningPathCatalogItem } from "@/src/types/user-api";
import { pushRoute, replaceRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function resolvePathAccent(score: number) {
  if (score < 500) return "#CFE0FF";
  if (score < 700) return "#D8F6D9";
  if (score < 850) return "#E2E5FF";
  return "#FEF3C7";
}

export default function OnboardingScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { isNarrow, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [catalog, setCatalog] = useState<UserLearningPathCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setSelectedPathId((prev) => {
        if (prev && items.some((p) => p.id === prev)) return prev;
        const enrolled = items.find((p) => p.enrolled);
        const recommended = items.find((p) => p.recommended);
        return enrolled?.id ?? recommended?.id ?? items[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải danh sách lộ trình.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useFocusEffect(
    useCallback(() => {
      void loadCatalog();
    }, [loadCatalog]),
  );

  const selectedPath = useMemo(
    () => catalog.find((item) => item.id === selectedPathId) ?? catalog[0] ?? null,
    [catalog, selectedPathId],
  );

  const handleAssignPath = async () => {
    if (!auth.accessToken) {
      replaceRoute("/");
      return;
    }
    if (!selectedPath) {
      Alert.alert("Lộ trình", "Hiện chưa có lộ trình khả dụng. Vui lòng thử lại sau.");
      return;
    }

    try {
      setSubmitting(true);
      await assignRecommendedPath(auth.accessToken, {
        learningPathId: selectedPath.id,
        targetScore: selectedPath.targetScore,
      });
      try {
        const profileRes = await getMyProfile(auth.accessToken);
        if (profileRes.data) {
          updateUserProfile(profileRes.data);
        }
      } catch {
        // Backend already synced targetScore; best-effort client refresh.
      }
      replaceRoute("/user/practice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể kích hoạt lộ trình.";
      Alert.alert("Lộ trình TOEIC", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UserScreen contentStyle={styles.outerWrap} hasTabDock={false} scrollable={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/home")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0]?.toUpperCase() || "A"} />}
        subtitle="Thiết lập lộ trình"
        title="Mục tiêu TOEIC"
      />

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        style={styles.scrollArea}
      >
        <LiquidCard hero style={styles.heroBanner}>
          <Text style={styles.heroEyebrow}>CÁ NHÂN HÓA LỘ TRÌNH</Text>
          <Text style={[styles.heroTitle, { fontSize: rf(isNarrow ? 19 : 21) }]}>
            Chọn lộ trình khớp mục tiêu điểm TOEIC của bạn
          </Text>
          <Text style={styles.heroSubtitle}>
            Danh sách lộ trình được cập nhật trực tiếp theo từng chặng bài học, từ vựng và đề luyện thi.
            {auth.user?.targetScore ? ` Mục tiêu hiện tại của bạn: ${auth.user.targetScore}+.` : ""}
          </Text>
          <Pressable hitSlop={8} onPress={() => pushRoute("/user/home")} style={styles.skipLink}>
            <Text style={styles.skipLinkText}>Để sau, quay lại Trang chủ →</Text>
          </Pressable>
        </LiquidCard>

        {loading ? (
          <SurfaceCard style={styles.emptyCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.goalDesc}>Đang tải các lộ trình theo mục tiêu điểm...</Text>
          </SurfaceCard>
        ) : errorMessage ? (
          <SurfaceCard style={styles.emptyCard}>
            <Text style={styles.goalDesc}>{errorMessage}</Text>
            <LiquidButton compact label="Thử lại" onPress={() => void loadCatalog()} variant="glass" />
          </SurfaceCard>
        ) : catalog.length === 0 ? (
          <SurfaceCard style={styles.emptyCard}>
            <Ionicons color={colors.primary} name="map-outline" size={30} />
            <Text style={[styles.goalTitle, { textAlign: "center" }]}>
              Chưa có lộ trình đang mở
            </Text>
            <Text style={[styles.goalDesc, { textAlign: "center" }]}>
              Quản trị viên chưa kích hoạt lộ trình học nào. Vui lòng quay lại sau.
            </Text>
          </SurfaceCard>
        ) : (
          <View style={styles.goalList}>
            {catalog.map((path) => {
              const selected = selectedPath?.id === path.id;

              return (
                <Pressable
                  key={path.id}
                  onPress={() => setSelectedPathId(path.id)}
                  style={({ pressed }) => [pressed ? { opacity: 0.92 } : null]}
                >
                  <SurfaceCard
                    style={[
                      styles.goalCard,
                      selected ? styles.goalCardSelected : null,
                    ]}
                  >
                    <View style={styles.goalHeaderRow}>
                      <View
                        style={[
                          styles.goalIcon,
                          { backgroundColor: resolvePathAccent(path.targetScore) },
                        ]}
                      >
                        <Text style={styles.scoreBadgeLabel}>{path.targetScore}+</Text>
                      </View>

                      <View style={styles.goalHeaderCopy}>
                        <View style={styles.goalTitleRow}>
                          <Text numberOfLines={1} style={[styles.goalTitle, { fontSize: rf(16.5) }]}>
                            {path.title}
                          </Text>
                          {path.enrolled ? (
                            <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                              <Text style={styles.popularBadgeText}>Đang học</Text>
                            </View>
                          ) : path.recommended ? (
                            <View style={styles.popularBadge}>
                              <Text style={styles.popularBadgeText}>Đề xuất</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.goalLevel}>
                          {path.code} • Mục tiêu {path.targetScore}+ • {path.milestoneCount} chặng •{" "}
                          {path.moduleCount} bài học
                        </Text>
                      </View>

                      <Ionicons
                        color={selected ? colors.primary : colors.textMuted}
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                      />
                    </View>

                    {path.description ? (
                      <Text style={[styles.goalDesc, { fontSize: rf(13) }]}>{path.description}</Text>
                    ) : null}

                    {path.milestoneTitles && path.milestoneTitles.length > 0 ? (
                      <Text numberOfLines={2} style={styles.milestonePreview}>
                        Chặng học: {path.milestoneTitles.join(" → ")}
                      </Text>
                    ) : null}

                    {path.moduleCount === 0 ? (
                      <Text style={styles.pendingNote}>
                        Nội dung chi tiết đang được cập nhật thêm bài học.
                      </Text>
                    ) : (
                      <Text style={styles.resourceFoot}>
                        Gồm {path.flashcardCount} từ vựng • {path.videoLessonCount} video •{" "}
                        {path.practiceSetCount} bộ đề • ~{path.estimatedTotalMinutes} phút
                      </Text>
                    )}
                  </SurfaceCard>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <SurfaceCard padding="sm" style={styles.bottomDock}>
        <View style={styles.dockInfo}>
          <Text style={styles.dockLabel}>Lộ trình đã chọn</Text>
          <Text numberOfLines={1} style={[styles.dockValue, { fontSize: rf(15.5) }]}>
            {selectedPath ? `${selectedPath.targetScore}+ • ${selectedPath.title}` : "Chưa chọn"}
          </Text>
        </View>
        <LiquidButton
          compact
          disabled={submitting || !selectedPath}
          label={submitting ? "Đang tạo..." : "Kích hoạt lộ trình"}
          loading={submitting}
          onPress={handleAssignPath}
          style={{ minWidth: isNarrow ? 142 : 166 }}
          variant="primary"
        />
      </SurfaceCard>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    outerWrap: {
      flex: 1,
      paddingBottom: 14,
    },
    scrollArea: {
      flex: 1,
    },
    scrollBody: {
      gap: 14,
      paddingBottom: 14,
    },
    heroBanner: {
      gap: 6,
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
      lineHeight: 27,
    },
    heroSubtitle: {
      color: colors.heroTextMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    skipLink: {
      alignSelf: "flex-start",
      marginTop: 4,
    },
    skipLinkText: {
      color: colors.accentGradient[0],
      fontSize: 12.5,
      fontWeight: "800",
    },
    goalList: {
      gap: 10,
    },
    goalCard: {
      gap: 8,
    },
    goalCardSelected: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 1.75,
    },
    goalHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    goalIcon: {
      alignItems: "center",
      borderRadius: 14,
      height: 44,
      justifyContent: "center",
      minWidth: 50,
      paddingHorizontal: 6,
    },
    scoreBadgeLabel: {
      color: "#1E293B",
      fontSize: 13,
      fontWeight: "900",
    },
    emptyCard: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 24,
    },
    milestonePreview: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 17,
    },
    resourceFoot: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "700",
    },
    pendingNote: {
      color: "#D97706",
      fontSize: 11.5,
      fontWeight: "700",
    },
    goalHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    goalTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    goalTitle: {
      color: colors.text,
      flexShrink: 1,
      fontWeight: "900",
    },
    popularBadge: {
      backgroundColor: colors.success,
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    popularBadgeText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },
    goalLevel: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "700",
      marginTop: 2,
    },
    goalDesc: {
      color: colors.textMuted,
      lineHeight: 19,
    },
    bottomDock: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      marginTop: 10,
    },
    dockInfo: {
      flex: 1,
      minWidth: 0,
    },
    dockLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    dockValue: {
      color: colors.primary,
      fontWeight: "900",
      marginTop: 1,
    },
  });
