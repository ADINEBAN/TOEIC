import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import ClayIcon3D from "@/src/components/user/ClayIcon3D";
import ProgressBar from "@/src/components/user/ProgressBar";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { getAdaptiveRecommendations, getUserRoadmap } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { AdaptiveRecommendationData, UserRoadmap, UserRoadmapModuleItem } from "@/src/types/user-api";
import { isNoActiveLearningPathError } from "@/src/utils/api-errors";
import { pushRoute } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

type ModuleNode = {
  ctaLabel?: string;
  isCelebration?: boolean;
  isCompleted: boolean;
  isCurrent: boolean;
  milestoneTitle: string;
  module: UserRoadmapModuleItem;
};

type FilterMode = "all" | "active" | "done" | "pending";

const TILE_PALETTES = [
  { clayColors: ["#FF8AC4", "#EC4899"] as const, icon: "book" as const },
  { clayColors: ["#68B2FF", "#2563EB"] as const, icon: "headset" as const },
  { clayColors: ["#FFD066", "#F59E0B"] as const, icon: "bulb" as const },
  { clayColors: ["#5BE5D5", "#14B8A6"] as const, icon: "sparkles" as const },
  { clayColors: ["#9D8FFF", "#6E5CEB"] as const, icon: "rocket" as const },
];

export default function PracticeScreen() {
  const { auth, isHydrated } = useAuth();
  const { theme } = useAppTheme();
  const { rf, isNarrow, isDesktopWeb } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roadmap, setRoadmap] = useState<UserRoadmap | null>(null);
  const [recommendations, setRecommendations] = useState<AdaptiveRecommendationData | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const loadRoadmap = useCallback(async () => {
    if (!auth.accessToken) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      const [roadmapResult, recResult] = await Promise.allSettled([
        getUserRoadmap(auth.accessToken),
        getAdaptiveRecommendations(auth.accessToken),
      ]);
      if (roadmapResult.status === "fulfilled") {
        setRoadmap(roadmapResult.value.data ?? null);
      } else {
        setRoadmap(null);
        if (!isNoActiveLearningPathError(roadmapResult.reason)) {
          throw roadmapResult.reason;
        }
      }
      setRecommendations(
        recResult.status === "fulfilled" ? recResult.value.data ?? null : null,
      );
    } catch (error) {
      setRoadmap(null);
      if (isNoActiveLearningPathError(error)) {
        setErrorMessage(null);
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải roadmap practice.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useFocusEffect(
    useCallback(() => {
      if (!isHydrated || !auth.accessToken) return;
      void loadRoadmap();
    }, [auth.accessToken, isHydrated, loadRoadmap]),
  );

  const moduleNodes = useMemo<ModuleNode[]>(() => {
    if (!roadmap) return [];

    const items = (roadmap.milestones ?? [])
      .flatMap((milestone) =>
        (milestone?.modules ?? [])
          .filter((module): module is UserRoadmapModuleItem => Boolean(module && typeof module.moduleId === "number"))
          .map((module) => ({
            milestoneTitle: milestone?.title ?? "Chặng học",
            module,
          })),
      )
      .sort((a, b) => (a.module.sortOrder ?? 0) - (b.module.sortOrder ?? 0))
      .map(({ milestoneTitle, module }) => ({
        isCompleted: module.progressStatus === "COMPLETED",
        isCurrent:
          module.moduleId === roadmap.currentModuleId || module.progressStatus === "IN_PROGRESS",
        milestoneTitle,
        module,
      }));

    if (roadmap.status !== "COMPLETED" || items.length === 0) return items;

    const lastSortOrder = items[items.length - 1]?.module.sortOrder ?? items.length;
    return [
      ...items,
      {
        ctaLabel: "Mở tổng kết khóa học",
        isCelebration: true,
        isCompleted: true,
        isCurrent: false,
        milestoneTitle: "Tổng kết khóa học",
        module: {
          description: "Toàn bộ module trong lộ trình đã hoàn tất.",
          difficultyLevel: null,
          estimatedMinutes: null,
          flashcardCount: items.reduce((sum, item) => sum + (item.module.flashcardCount ?? 0), 0),
          moduleId: -1,
          moduleType: "MILESTONE",
          practiceSetCount: items.reduce((sum, item) => sum + (item.module.practiceSetCount ?? 0), 0),
          progressPercent: 100,
          progressStatus: "COMPLETED",
          required: true,
          sortOrder: lastSortOrder + 1,
          title: "Hoàn thành khóa học",
          unlockCondition: null,
          videoLessonCount: items.reduce((sum, item) => sum + (item.module.videoLessonCount ?? 0), 0),
        },
      },
    ];
  }, [roadmap]);

  const filteredNodes = useMemo(() => {
    if (filterMode === "all") return moduleNodes;
    if (filterMode === "done") return moduleNodes.filter((n) => n.isCompleted);
    if (filterMode === "active") return moduleNodes.filter((n) => n.isCurrent && !n.isCompleted);
    return moduleNodes.filter((n) => !n.isCompleted && !n.isCurrent);
  }, [filterMode, moduleNodes]);

  const openModule = (moduleId: number) => {
    if (moduleId === -1) {
      pushRoute("/user/path-complete");
      return;
    }
    pushRoute(`/user/roadmap?moduleId=${moduleId}`);
  };

  const coreNodes = useMemo(() => moduleNodes.filter((n) => !n.isCelebration), [moduleNodes]);
  const progressPercent = Math.round(roadmap?.progressPercent ?? 0);
  const totalCount = coreNodes.length;
  const completedCount = coreNodes.filter((n) => n.isCompleted).length;
  const activeCount = coreNodes.filter((n) => n.isCurrent && !n.isCompleted).length;
  const pendingCount = Math.max(0, totalCount - completedCount - activeCount);
  const totalVideos = coreNodes.reduce((sum, n) => sum + (n.module.videoLessonCount ?? 0), 0);
  const totalVocab = coreNodes.reduce((sum, n) => sum + (n.module.flashcardCount ?? 0), 0);
  const totalPractice = coreNodes.reduce((sum, n) => sum + (n.module.practiceSetCount ?? 0), 0);

  return (
    <UserScreen>
      <AppHeader
        rightSlot={<AvatarBadge label={(auth.user?.fullName ?? "A").charAt(0).toUpperCase()} />}
        title="Lộ trình TOEIC"
      />

      <SurfaceCard padding="none" style={styles.heroBanner}>
        <Image
          resizeMode="cover"
          source={require("@/assets/images/banner-study.jpg")}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroOverlay}>
          <View style={styles.heroTopRow}>
            <View style={styles.goalBadge}>
              <Ionicons color="#6EE7B7" name="flag" size={12} />
              <Text style={styles.goalBadgeText}>
                {roadmap?.learningPathCode ?? "LỘ TRÌNH"}
                {roadmap?.targetScore ? ` • Mục tiêu ${roadmap.targetScore}+` : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => pushRoute("/user/onboarding")}
              style={({ pressed }) => [styles.switchPathBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons color="#FFFFFF" name="swap-horizontal" size={13} />
              <Text style={styles.switchPathText}>Đổi lộ trình</Text>
            </Pressable>
          </View>

          <Text numberOfLines={2} style={[styles.heroHeadline, { fontSize: rf(isNarrow ? 19 : 21) }]}>
            {roadmap?.learningPathTitle ?? "Học TOEIC thật vui!"}
          </Text>
          <Text numberOfLines={1} style={styles.heroSubtitle}>
            {roadmap
              ? `Hoàn thành ${completedCount}/${totalCount} module trọng tâm`
              : "Chọn lộ trình phù hợp để mở khóa bài học từng bước"}
          </Text>

          <View style={styles.heroProgressRow}>
            <View style={styles.heroProgressTrack}>
              <View style={[styles.heroProgressFill, { width: `${Math.max(0, Math.min(100, progressPercent))}%` }]} />
            </View>
            <View style={styles.heroPctBadge}>
              <Text style={styles.heroPctText}>{progressPercent}%</Text>
            </View>
          </View>
        </View>
      </SurfaceCard>

      {roadmap && totalCount > 0 ? (
        <View style={styles.summaryStatsRow}>
          <SurfaceCard padding="sm" style={styles.summaryStatCard}>
            <ClayIcon3D colors={["#FF8AC4", "#EC4899"]} icon="videocam" size={38} />
            <Text style={styles.summaryStatValue}>{totalVideos}</Text>
            <Text style={styles.summaryStatLabel}>Video</Text>
          </SurfaceCard>

          <SurfaceCard padding="sm" style={styles.summaryStatCard}>
            <ClayIcon3D colors={["#9D8FFF", "#6E5CEB"]} icon="albums" size={38} />
            <Text style={styles.summaryStatValue}>{totalVocab}</Text>
            <Text style={styles.summaryStatLabel}>Từ vựng</Text>
          </SurfaceCard>

          <SurfaceCard padding="sm" style={styles.summaryStatCard}>
            <ClayIcon3D colors={["#4FE3CE", "#10B981"]} icon="document-text" size={38} />
            <Text style={styles.summaryStatValue}>{totalPractice}</Text>
            <Text style={styles.summaryStatLabel}>Bộ đề</Text>
          </SurfaceCard>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.filterRow}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
      >
        {(
          [
            { key: "all", label: `Tất cả (${totalCount})` },
            { key: "active", label: `Đang học (${activeCount})` },
            { key: "done", label: `Đã xong (${completedCount})` },
            { key: "pending", label: `Chưa mở (${pendingCount})` },
          ] as { key: FilterMode; label: string }[]
        ).map((item) => {
          const active = filterMode === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilterMode(item.key)}
              style={[
                styles.filterPill,
                active ? styles.filterPillActive : null,
              ]}
            >
              <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.feedbackRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.feedbackText}>Đang tải danh sách bài học...</Text>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {!loading && !errorMessage && (!roadmap || moduleNodes.length === 0) ? (
        <SurfaceCard style={styles.emptyStateCard}>
          <Ionicons color={colors.primary} name="compass-outline" size={34} />
          <Text style={styles.emptyStateTitle}>
            {roadmap ? "Lộ trình này chưa có module" : "Bạn chưa chọn lộ trình học"}
          </Text>
          <Text style={styles.emptyText}>
            Chạm nút bên dưới để khảo sát mục tiêu hoặc đổi sang lộ trình khác có bài học.
          </Text>
          <LiquidButton
            compact
            label="Chọn / Đổi lộ trình"
            onPress={() => pushRoute("/user/onboarding")}
            style={{ marginTop: 12 }}
            variant="primary"
          />
        </SurfaceCard>
      ) : null}

      {moduleNodes.length > 0 ? (
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Bài học theo chặng</Text>
          <Text style={styles.sectionMeta}>{filteredNodes.length} module</Text>
        </View>
      ) : null}

      {!loading && moduleNodes.length > 0 && filteredNodes.length === 0 ? (
        <SurfaceCard style={styles.emptyFilterCard}>
          <Ionicons color={colors.textMuted} name="filter-outline" size={24} />
          <Text style={styles.emptyText}>Chưa có module nào khớp bộ lọc đang chọn.</Text>
          <Pressable onPress={() => setFilterMode("all")} style={styles.resetFilterBtn}>
            <Text style={styles.resetFilterText}>Xem tất cả ({totalCount})</Text>
          </Pressable>
        </SurfaceCard>
      ) : null}

      <View
        style={[
          styles.moduleList,
          isDesktopWeb ? { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" } : null,
        ]}
      >
        {filteredNodes.map((item, idx) => {
          const palette = TILE_PALETTES[idx % TILE_PALETTES.length];
          const isPrioritized =
            !item.isCompleted &&
            Boolean(recommendations?.prioritizedModuleIds?.includes(item.module.moduleId));
          const modPct = Number.isFinite(item.module.progressPercent)
            ? Math.round(item.module.progressPercent)
            : 0;
          const statusMeta = item.isCompleted
            ? {
                bg: colors.isDark ? "rgba(16,185,129,0.22)" : "#DCFCE7",
                fg: "#059669",
                label: "Đã xong",
              }
            : item.isCurrent
              ? {
                  bg: colors.primarySoft,
                  fg: colors.primary,
                  label: "Đang học",
                }
              : {
                  bg: colors.isDark ? "rgba(148,163,184,0.18)" : "#F1F5F9",
                  fg: colors.textMuted,
                  label: "Sẵn sàng",
                };

          const metaSummary = [
            item.module.videoLessonCount ? `${item.module.videoLessonCount} video` : null,
            item.module.flashcardCount ? `${item.module.flashcardCount} từ` : null,
            item.module.practiceSetCount ? `${item.module.practiceSetCount} đề` : null,
          ]
            .filter(Boolean)
            .join(" • ") || `${item.module.estimatedMinutes ?? 15} phút`;

          return (
            <Pressable
              key={`${item.module.moduleId}-${idx}`}
              onPress={() => openModule(item.module.moduleId)}
              style={({ pressed }) => [
                isDesktopWeb ? { width: "49%" } : null,
                pressed ? { opacity: 0.92, transform: [{ scale: 0.985 }] } : null,
              ]}
            >
              <SurfaceCard padding="sm" style={styles.moduleCard}>
                <View style={styles.moduleRow}>
                  <ClayIcon3D
                    colors={item.isCelebration ? ["#FFD066", "#F59E0B"] : palette.clayColors}
                    icon={item.isCelebration ? "trophy" : palette.icon}
                    size={54}
                  />

                  <View style={styles.moduleBody}>
                    <View style={styles.moduleTopMetaRow}>
                      <Text numberOfLines={1} style={styles.milestoneEyebrow}>
                        {item.milestoneTitle}
                      </Text>
                      <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
                        {isPrioritized ? (
                          <View style={[styles.moduleStatusPill, { backgroundColor: "#FEF3C7" }]}>
                            <Text style={[styles.moduleStatusText, { color: "#B45309" }]}>
                              Ưu tiên
                            </Text>
                          </View>
                        ) : null}
                        <View style={[styles.moduleStatusPill, { backgroundColor: statusMeta.bg }]}>
                          <Text style={[styles.moduleStatusText, { color: statusMeta.fg }]}>
                            {statusMeta.label}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text numberOfLines={1} style={[styles.moduleTitle, { fontSize: rf(16) }]}>
                      {item.module.title}
                    </Text>

                    <Text numberOfLines={1} style={styles.moduleMetaCompact}>
                      {metaSummary}
                    </Text>

                    <View style={styles.progressLine}>
                      <View style={{ flex: 1 }}>
                        <ProgressBar accentColor={item.isCompleted ? colors.success : colors.primary} value={modPct} />
                      </View>
                      <Text style={styles.pctText}>{modPct}%</Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.chevronCircle,
                      {
                        backgroundColor: item.isCompleted ? colors.success : colors.primary,
                        shadowColor: item.isCompleted ? colors.success : colors.primary,
                      },
                    ]}
                  >
                    <Ionicons
                      color="#FFFFFF"
                      name={item.isCompleted ? "checkmark" : "chevron-forward"}
                      size={18}
                    />
                  </View>
                </View>
              </SurfaceCard>
            </Pressable>
          );
        })}
      </View>

      {/* Compact 3D Clay Tools Grid (4 Clean Cards) */}
      <View style={styles.toolsSection}>
        <SectionTitle title="Công cụ bổ trợ" />

        <View style={styles.toolsRow}>
          <Pressable
            onPress={() => pushRoute("/user/youtube-studio")}
            style={({ pressed }) => [styles.toolCardWrap, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
          >
            <SurfaceCard padding="sm" style={styles.toolCard}>
              <ClayIcon3D colors={["#60B6FF", "#0284C7"]} icon="videocam" size={48} />
              <Text numberOfLines={1} style={styles.toolTitle}>
                Video AI
              </Text>
            </SurfaceCard>
          </Pressable>

          <Pressable
            onPress={() => pushRoute("/user/grammar")}
            style={({ pressed }) => [styles.toolCardWrap, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
          >
            <SurfaceCard padding="sm" style={styles.toolCard}>
              <ClayIcon3D colors={["#A78BFA", "#7C3AED"]} icon="library" size={48} />
              <Text numberOfLines={1} style={styles.toolTitle}>
                Ngữ pháp TOEIC
              </Text>
            </SurfaceCard>
          </Pressable>
        </View>

        <View style={styles.toolsRow}>
          <Pressable
            onPress={() => pushRoute("/user/document-exam")}
            style={({ pressed }) => [styles.toolCardWrap, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
          >
            <SurfaceCard padding="sm" style={styles.toolCard}>
              <ClayIcon3D colors={["#4ADE80", "#16A34A"]} icon="document-text" size={48} />
              <Text numberOfLines={1} style={styles.toolTitle}>
                Luyện đề PDF
              </Text>
            </SurfaceCard>
          </Pressable>

          <Pressable
            onPress={() => pushRoute("/user/mistakes")}
            style={({ pressed }) => [styles.toolCardWrap, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
          >
            <SurfaceCard padding="sm" style={styles.toolCard}>
              <ClayIcon3D colors={["#FBBF24", "#D97706"]} icon="alert-circle" size={48} />
              <Text numberOfLines={1} style={styles.toolTitle}>
                Sổ tay Lỗi sai
              </Text>
            </SurfaceCard>
          </Pressable>
        </View>
      </View>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    heroBanner: {
      borderRadius: 26,
      marginBottom: 14,
      minHeight: 162,
      overflow: "hidden",
      position: "relative",
    },
    heroOverlay: {
      backgroundColor: "rgba(15, 23, 42, 0.56)",
      flex: 1,
      gap: 6,
      justifyContent: "space-between",
      padding: 18,
    },
    heroTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    goalBadge: {
      alignItems: "center",
      backgroundColor: "rgba(16, 185, 129, 0.28)",
      borderColor: "rgba(167, 243, 208, 0.45)",
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    goalBadgeText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    switchPathBtn: {
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.22)",
      borderColor: "rgba(255, 255, 255, 0.35)",
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    switchPathText: {
      color: "#FFFFFF",
      fontSize: 11.5,
      fontWeight: "800",
    },
    heroHeadline: {
      color: "#FFFFFF",
      fontWeight: "900",
      lineHeight: 26,
      marginTop: 4,
      textShadowColor: "rgba(0,0,0,0.22)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    heroSubtitle: {
      color: "rgba(255, 255, 255, 0.9)",
      fontSize: 12.5,
      fontWeight: "700",
    },
    heroProgressRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    heroProgressTrack: {
      backgroundColor: "rgba(255, 255, 255, 0.26)",
      borderRadius: radius.pill,
      flex: 1,
      height: 8,
      overflow: "hidden",
    },
    heroProgressFill: {
      backgroundColor: "#34D399",
      borderRadius: radius.pill,
      height: "100%",
    },
    heroPctBadge: {
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    heroPctText: {
      color: "#FFFFFF",
      fontSize: 11.5,
      fontWeight: "900",
    },
    summaryStatsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    summaryStatCard: {
      alignItems: "center",
      borderRadius: 20,
      flex: 1,
      gap: 4,
      paddingVertical: 12,
    },
    summaryStatIcon: {
      alignItems: "center",
      borderRadius: 12,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    summaryStatValue: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "900",
    },
    summaryStatLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
    },
    filterScroll: {
      flexGrow: 0,
      flexShrink: 0,
      marginBottom: 14,
    },
    filterRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      paddingVertical: 2,
    },
    filterPill: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      elevation: Platform.OS === "android" ? 2 : 0,
      height: 38,
      justifyContent: "center",
      paddingHorizontal: 15,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: "800",
    },
    filterTextActive: {
      color: colors.onPrimary,
    },
    feedbackRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    feedbackText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    errorText: {
      backgroundColor: "rgba(234,67,89,0.12)",
      borderColor: "rgba(234,67,89,0.28)",
      borderRadius: radius.md,
      borderWidth: 1,
      color: colors.danger,
      marginBottom: 14,
      padding: 12,
    },
    emptyStateCard: {
      alignItems: "center",
      gap: 6,
      marginBottom: 16,
      paddingVertical: 24,
    },
    emptyFilterCard: {
      alignItems: "center",
      borderRadius: 22,
      gap: 8,
      marginBottom: 14,
      paddingVertical: 22,
    },
    resetFilterBtn: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      marginTop: 4,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    resetFilterText: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: "800",
    },
    emptyStateTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
      textAlign: "center",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    sectionHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      marginBottom: 10,
    },
    sectionHeading: {
      color: colors.text,
      flex: 1,
      fontSize: 16,
      fontWeight: "900",
    },
    sectionMeta: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    moduleList: {
      gap: 12,
    },
    moduleCard: {
      borderRadius: 22,
    },
    moduleTopMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      marginBottom: 2,
    },
    milestoneEyebrow: {
      color: colors.textMuted,
      flex: 1,
      fontSize: 10.5,
      fontWeight: "800",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    moduleStatusPill: {
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    moduleStatusText: {
      fontSize: 10,
      fontWeight: "900",
    },
    moduleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 13,
    },
    moduleBody: {
      flex: 1,
      minWidth: 0,
    },
    moduleTitle: {
      color: colors.text,
      fontWeight: "900",
    },
    moduleMetaCompact: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 2,
    },
    progressLine: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    pctText: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "800",
      minWidth: 30,
      textAlign: "right",
    },
    chevronCircle: {
      alignItems: "center",
      borderRadius: 999,
      elevation: Platform.OS === "android" ? 5 : 0,
      height: 36,
      justifyContent: "center",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      width: 36,
    },
    toolsSection: {
      gap: 10,
      marginTop: 20,
    },
    toolsRow: {
      flexDirection: "row",
      gap: 12,
    },
    toolCardWrap: {
      flex: 1,
    },
    toolCard: {
      alignItems: "center",
      borderRadius: 22,
      gap: 10,
      justifyContent: "center",
      paddingVertical: 16,
    },
    toolTitle: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: "900",
      textAlign: "center",
    },
  });
