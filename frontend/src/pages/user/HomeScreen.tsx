import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import VerifiedBadge from "@/src/components/common/VerifiedBadge";
import { LiquidCard } from "@/src/components/ui/LiquidGlass";
import AppHeader from "@/src/components/user/AppHeader";
import ClayIcon3D from "@/src/components/user/ClayIcon3D";
import { useFloatingChat } from "@/src/components/user/FloatingChatOverlay";
import ProgressBar from "@/src/components/user/ProgressBar";
import PublicProfileModal from "@/src/components/user/PublicProfileModal";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  assignRecommendedPath,
  getAdaptiveRecommendations,
  getMyProfile,
  getMyStreak,
  getUserLearningPathCatalog,
  getUserRoadmap,
  getWeeklyLeaderboard,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import {
  AdaptiveRecommendationData,
  UserLearningPathCatalogItem,
  UserRoadmap,
  WeeklyLeaderboardEntry,
} from "@/src/types/user-api";
import { isNoActiveLearningPathError } from "@/src/utils/api-errors";
import { pushRoute } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function formatName(fullName?: string | null) {
  if (!fullName?.trim()) return "bạn";
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

export default function HomeScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { openDirectChat } = useFloatingChat();
  const { theme } = useAppTheme();
  const { gridItemWidth, rf, isNarrow, isDesktopWeb } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [assigningPath, setAssigningPath] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [learningPaths, setLearningPaths] = useState<UserLearningPathCatalogItem[]>([]);
  const [roadmap, setRoadmap] = useState<UserRoadmap | null>(null);
  const [weeklyLeaders, setWeeklyLeaders] = useState<WeeklyLeaderboardEntry[]>([]);
  const [recommendations, setRecommendations] = useState<AdaptiveRecommendationData | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [inspectUserId, setInspectUserId] = useState<number | null>(null);
  const [enterAnim] = useState(() => new Animated.Value(0));
  const [mascotFloat] = useState(() => new Animated.Value(0));

  const hasLoadedRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const useNative = Platform.OS !== "web";
    Animated.timing(enterAnim, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: useNative,
    }).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(mascotFloat, {
          duration: 1850,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: useNative,
        }),
        Animated.timing(mascotFloat, {
          duration: 1850,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: useNative,
        }),
      ]),
    );
    floatLoop.start();
    return () => {
      floatLoop.stop();
    };
  }, [enterAnim, mascotFloat]);

  const fullName = auth.user?.fullName ?? "";
  const targetScore = auth.user?.targetScore ?? 0;
  const greetingName = formatName(fullName);

  const loadHomeData = useCallback(() => {
    if (!auth.accessToken) {
      setLoading(false);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    setErrorMessage(null);

    Promise.allSettled([
      getUserLearningPathCatalog(auth.accessToken),
      getUserRoadmap(auth.accessToken),
      getWeeklyLeaderboard(auth.accessToken, 0),
      getMyStreak(auth.accessToken),
      getMyProfile(auth.accessToken),
      getAdaptiveRecommendations(auth.accessToken),
    ])
      .then(([pathsResult, roadmapResult, leaderboardResult, streakResult, profileResult, recResult]) => {
        if (pathsResult.status !== "fulfilled") {
          throw pathsResult.reason;
        }

        if (profileResult.status === "fulfilled" && profileResult.value?.data) {
          updateUserProfile(profileResult.value.data);
        }

        const nextPaths = pathsResult.value.data ?? [];
        const nextRoadmap =
          roadmapResult.status === "fulfilled"
            ? roadmapResult.value.data ?? null
            : isNoActiveLearningPathError(roadmapResult.reason)
              ? null
              : (() => {
                throw roadmapResult.reason;
              })();
        const nextWeekly = (
          leaderboardResult.status === "fulfilled"
            ? leaderboardResult.value?.data?.entries ?? []
            : []
        ).slice(0, 5);
        const nextStreak =
          streakResult.status === "fulfilled" ? streakResult.value.data?.currentLoginStreak ?? 0 : 0;
        const nextRec = recResult.status === "fulfilled" ? recResult.value?.data ?? null : null;

        setLearningPaths(nextPaths);
        setRoadmap(nextRoadmap);
        setWeeklyLeaders(nextWeekly);
        setStreakDays(nextStreak);
        setRecommendations(nextRec);
        hasLoadedRef.current = true;

        setSelectedPathId((prev) => {
          if (nextRoadmap?.learningPathId) return nextRoadmap.learningPathId;
          if (prev && nextPaths.some((p) => p.id === prev)) return prev;
          const recommended = nextPaths.find((p) => p.recommended) ?? nextPaths[0];
          return recommended?.id ?? null;
        });
      })
      .catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Không thể tải dữ liệu trang chủ.",
        );
      })
      .finally(() => {
        inFlightRef.current = false;
        setLoading(false);
      });
  }, [auth.accessToken, updateUserProfile]);

  useFocusEffect(
    useCallback(() => {
      loadHomeData();
    }, [loadHomeData]),
  );

  const selectedPath = useMemo(
    () => learningPaths.find((item) => item.id === selectedPathId) ?? null,
    [learningPaths, selectedPathId],
  );

  const recommendedPathId = useMemo(
    () => learningPaths.find((item) => item.recommended)?.id ?? null,
    [learningPaths],
  );

  const roadmapModules = (roadmap?.milestones ?? []).flatMap((milestone) => milestone?.modules ?? []);
  const hasNoAssignedPath = !roadmap;
  const latestModule =
    roadmapModules.find((module) => module.moduleId === roadmap?.currentModuleId) ??
    roadmapModules.find((module) => module.progressStatus === "IN_PROGRESS") ??
    roadmapModules[0] ??
    null;
  const completedModules = roadmapModules.filter((module) => module.progressStatus === "COMPLETED").length;
  const progressValue = Math.round(roadmap?.progressPercent ?? 0);

  const featureGap = isNarrow ? 10 : 12;
  const featureCardW = gridItemWidth(isDesktopWeb ? 4 : 2, featureGap);

  const handleChoosePath = async () => {
    if (!auth.accessToken || !selectedPath) return;

    try {
      setAssigningPath(true);
      const response = await assignRecommendedPath(auth.accessToken, {
        learningPathId: selectedPath.id,
        targetScore: selectedPath.targetScore,
      });
      setSelectedPathId(response.data.learningPathId);
      const [roadmapResponse, profileResponse] = await Promise.all([
        getUserRoadmap(auth.accessToken),
        getMyProfile(auth.accessToken),
      ]);
      setRoadmap(roadmapResponse.data ?? null);
      if (profileResponse.data) {
        updateUserProfile(profileResponse.data);
      }
      Alert.alert("Lộ trình", `Đã kích hoạt ${selectedPath.title} (${selectedPath.targetScore}+).`);
      pushRoute("/user/practice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể chọn lộ trình.";
      Alert.alert("Lỗi", message);
    } finally {
      setAssigningPath(false);
    }
  };

  const quickCategories = [
    {
      label: "Lộ trình",
      icon: "map" as const,
      clayColors: ["#9D8FFF", "#6E5CEB"] as const,
      route: hasNoAssignedPath ? "/user/onboarding" : "/user/practice",
    },
    {
      label: "Từ vựng",
      icon: "albums" as const,
      clayColors: ["#FF89C4", "#EC4899"] as const,
      route: "/user/cards?mode=sm2",
    },
    {
      label: "Thi thử",
      icon: "document-text" as const,
      clayColors: ["#5BE5D5", "#14B8A6"] as const,
      route: "/user/test",
    },
    {
      label: "Ngữ pháp",
      icon: "library" as const,
      clayColors: ["#FFD066", "#F59E0B"] as const,
      route: "/user/grammar",
    },
  ];

  const exploreCards = [
    {
      title: "Thư viện Video",
      image: require("@/assets/images/cards/card-video.jpg"),
      accent: "#E53935",
      route: "/user/youtube-studio",
    },
    {
      title: "Đấu trường 1v1",
      image: require("@/assets/images/cards/card-arena.jpg"),
      accent: "#5948DB",
      route: "/user/arena",
    },
    {
      title: "Ngân hàng câu sai",
      image: require("@/assets/images/cards/card-mistakes.jpg"),
      accent: "#EB5440",
      route: "/user/mistakes",
    },
    {
      title: "Đề từ Tài liệu",
      image: require("@/assets/images/cards/card-document.jpg"),
      accent: "#20A698",
      route: "/user/document-exam",
    },
    {
      title: "Tra từ Ngữ nghĩa",
      image: require("@/assets/images/cards/card-dictionary.jpg"),
      accent: "#2563EB",
      route: "/user/dictionary?mode=lookup",
    },
    {
      title: "Bảng Xếp Hạng",
      image: require("@/assets/images/cards/card-leaderboard.jpg"),
      accent: "#D97706",
      route: "/user/leaderboard",
    },
    {
      title: "Cửa hàng Avatar",
      image: require("@/assets/images/cards/card-shop.jpg"),
      accent: "#0284C7",
      route: "/user/shop",
    },
    {
      title: "Chụp ảnh đồ vật",
      image: require("@/assets/images/cards/card-camera.jpg"),
      accent: "#EA580C",
      route: "/user/dictionary?mode=camera",
    },
  ];

  const mascotSize = isNarrow ? 98 : 112;
  const mascotTranslateY = mascotFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7],
  });
  const sectionTranslateY = enterAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  const goalPickerSection = (
    <>
      <SectionTitle
        actionLabel="Đổi mục tiêu"
        onActionPress={() => pushRoute("/user/onboarding")}
        title="Mục tiêu điểm TOEIC"
      />

      {loading && learningPaths.length === 0 ? (
        <SurfaceCard style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.feedbackText}>Đang đồng bộ lộ trình...</Text>
        </SurfaceCard>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {learningPaths.length > 0 ? (
        <View style={styles.pathSection}>
          <ScrollView
            contentContainerStyle={styles.pathTabsRow}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
          >
            {learningPaths.map((path) => {
              const active = path.id === selectedPathId;
              const isCurrent = roadmap?.learningPathId === path.id;
              return (
                <Pressable
                  key={path.id}
                  onPress={() => path.active && setSelectedPathId(path.id)}
                  style={[
                    styles.scoreTabPill,
                    active ? styles.scoreTabPillActive : null,
                    !path.active ? { opacity: 0.45 } : null,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.scoreTabText, active ? styles.scoreTabTextActive : null]}
                  >
                    {path.targetScore}+
                  </Text>
                  {isCurrent ? (
                    <View
                      style={[
                        styles.activeDot,
                        { backgroundColor: active ? colors.onPrimary : colors.success },
                      ]}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {selectedPath ? (
            <SurfaceCard style={styles.selectedPathCard}>
              <View style={styles.selectedPathTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {(recommendedPathId === selectedPath.id || roadmap?.learningPathId === selectedPath.id) ? (
                    <View style={styles.tagRow}>
                      {recommendedPathId === selectedPath.id ? (
                        <Text style={styles.tagRecommend}>Đề xuất</Text>
                      ) : null}
                      {roadmap?.learningPathId === selectedPath.id ? (
                        <Text style={styles.tagCurrent}>Đang học</Text>
                      ) : null}
                    </View>
                  ) : null}
                  <Text numberOfLines={1} style={[styles.pathTitle, { fontSize: rf(16) }]}>
                    {selectedPath.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.pathHint}>
                    {selectedPath.milestoneCount} chặng • {selectedPath.moduleCount} bài học
                  </Text>
                </View>

                <Pressable
                  disabled={assigningPath || !selectedPath.active}
                  onPress={() =>
                    roadmap?.learningPathId === selectedPath.id
                      ? pushRoute("/user/practice")
                      : void handleChoosePath()
                  }
                  style={[styles.chevronCircle, { backgroundColor: colors.primary }]}
                >
                  {assigningPath ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Ionicons color="#FFFFFF" name="chevron-forward" size={18} />
                  )}
                </Pressable>
              </View>
            </SurfaceCard>
          ) : null}
        </View>
      ) : null}
    </>
  );

  return (
    <UserScreen>
      <AppHeader
        rightSlot={
          <View style={styles.headerRightCluster}>
            <Pressable onPress={() => pushRoute("/user/shop")} style={styles.headerDiamondChip}>
              <Text style={styles.headerDiamondText}>💎 {auth.user?.diamonds ?? 50}</Text>
            </Pressable>
            <Pressable onPress={() => pushRoute("/user/profile")}>
              <UserAvatarWithFrame
                avatarUrl={auth.user?.avatarUrl}
                frameId={auth.user?.equippedFrameId}
                fullName={fullName || greetingName}
                level={auth.user?.level ?? 1}
                showCornerBadge={false}
                size={38}
              />
            </Pressable>
          </View>
        }
        title=""
        titleSlot={
          <View style={styles.headerGreetingRow}>
            <Text numberOfLines={1} style={[styles.headerGreetingText, { fontSize: rf(17.5) }]}>
              Chào, {greetingName}!
            </Text>
            <VerifiedBadge size={16} verified={auth.user?.verified} />
            <Text style={{ fontSize: rf(16) }}>👋</Text>
          </View>
        }
      />

      <Animated.View
        style={[
          isDesktopWeb
            ? { alignItems: "flex-start", flexDirection: "row", gap: 20, marginBottom: 8 }
            : undefined,
          { opacity: enterAnim, transform: [{ translateY: sectionTranslateY }] },
        ]}
      >
        <View style={isDesktopWeb ? { flex: 1.12, minWidth: 0 } : undefined}>
          <View style={[styles.welcomeRow, isDesktopWeb ? styles.welcomeDesktopCard : null]}>
            <View style={styles.welcomeTextCol}>
              {isDesktopWeb ? (
                <View style={styles.heroBrandEyebrow}>
                  <View style={[styles.heroBrandDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.heroBrandEyebrowText}>MỤC TIÊU TOEIC CÁ NHÂN</Text>
                </View>
              ) : null}
              <Text style={[styles.welcomeHeadline, { fontSize: rf(isNarrow ? 19 : 21) }]}>
                Sẵn sàng chinh phục TOEIC hôm nay!
              </Text>
              <View style={styles.welcomeChipsRow}>
                <View style={styles.welcomeStatChip}>
                  <Ionicons color={colors.primary} name="flag" size={12} />
                  <Text style={styles.welcomeStatText}>Mục tiêu {targetScore || "---"}+</Text>
                </View>
                <View style={styles.welcomeStatChip}>
                  <Ionicons color="#F59E0B" name="flame" size={12} />
                  <Text style={styles.welcomeStatText}>{streakDays} ngày</Text>
                </View>
              </View>
            </View>
            <Animated.Image
              resizeMode="contain"
              source={require("@/assets/images/mascot-home.png")}
              style={{
                height: mascotSize,
                marginBottom: isDesktopWeb ? -4 : -12,
                transform: [{ translateY: mascotTranslateY }],
                width: mascotSize,
              }}
            />
          </View>

          <SurfaceCard padding="sm" style={styles.categoryDock}>
            <View style={styles.categoryRow}>
              {quickCategories.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => pushRoute(item.route)}
                  style={({ pressed }) => [styles.catTile, pressed ? { opacity: 0.85, transform: [{ scale: 0.96 }] } : null]}
                >
                  <ClayIcon3D colors={item.clayColors} icon={item.icon} size={50} />
                  <Text numberOfLines={1} style={[styles.catLabel, { fontSize: rf(11.5) }]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SurfaceCard>

          <Pressable
            onPress={() => pushRoute(hasNoAssignedPath ? "/user/onboarding" : "/user/practice")}
            style={({ pressed }) => [pressed ? { opacity: 0.95 } : null]}
          >
            <LiquidCard hero style={styles.dailyGoalCard}>
              <View style={styles.dailyGoalRow}>
                <View style={styles.dailyGoalCopy}>
                  <Text style={[styles.dailyGoalTitle, { fontSize: rf(16) }]}>
                    Mục tiêu {targetScore || "---"}+
                  </Text>
                  <Text numberOfLines={1} style={styles.dailyGoalSub}>
                    {hasNoAssignedPath
                      ? "Chưa chọn lộ trình"
                      : roadmap?.learningPathTitle ?? "Lộ trình TOEIC"}
                  </Text>

                  <View style={styles.goalProgressRow}>
                    <View style={styles.goalTrack}>
                      <View
                        style={[
                          styles.goalFill,
                          { width: `${Math.max(6, Math.min(100, progressValue))}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.goalFraction}>
                      {completedModules}/{roadmapModules.length} bài
                    </Text>
                  </View>
                </View>

                <View style={styles.starBadgeWrap}>
                  <LinearGradient
                    colors={["#FFD66B", "#FFA82E"]}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={styles.starBadge}
                  >
                    <Ionicons color="#FFFFFF" name="star" size={26} />
                  </LinearGradient>
                  <Text style={styles.streakPillText}>{streakDays} ngày</Text>
                </View>
              </View>
            </LiquidCard>
          </Pressable>

          <SectionTitle
            actionLabel="Xem tất cả"
            onActionPress={() => pushRoute(hasNoAssignedPath ? "/user/onboarding" : "/user/practice")}
            title="Tiếp tục học"
          />
          <Pressable
            onPress={() =>
              pushRoute(
                latestModule
                  ? `/user/roadmap?moduleId=${latestModule.moduleId}`
                  : hasNoAssignedPath
                    ? "/user/onboarding"
                    : "/user/practice",
              )
            }
            style={({ pressed }) => [pressed ? { opacity: 0.92 } : null]}
          >
            <SurfaceCard padding="sm" style={styles.continueCard}>
              <View style={styles.continueRow}>
                <ClayIcon3D
                  colors={[colors.accentGradient[0], colors.accentGradient[1]]}
                  icon="book"
                  size={54}
                />

                <View style={styles.continueCopy}>
                  <Text numberOfLines={1} style={[styles.continueTitle, { fontSize: rf(15.5) }]}>
                    {latestModule?.title ?? roadmap?.learningPathTitle ?? "Chọn lộ trình đầu tiên"}
                  </Text>
                  <View style={styles.continueProgressWrap}>
                    <View style={{ flex: 1 }}>
                      <ProgressBar accentColor={colors.primary} value={progressValue} />
                    </View>
                    <Text style={styles.continuePct}>{progressValue}%</Text>
                  </View>
                </View>

                <View style={[styles.playCircleBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
                  <Ionicons color="#FFFFFF" name="play" size={18} style={{ marginLeft: 2 }} />
                </View>
              </View>
            </SurfaceCard>
          </Pressable>

          {isDesktopWeb ? <View style={{ marginTop: 14 }}>{goalPickerSection}</View> : null}
        </View>

        <View style={isDesktopWeb ? { flex: 0.96, gap: 14, minWidth: 0 } : undefined}>
          {recommendations &&
          (recommendations.dailyPlan.length > 0 ||
            recommendations.weakestPartNo !== null ||
            recommendations.dueVocabCount > 0 ||
            recommendations.mistakeCount > 0) ? (
            <SurfaceCard style={styles.adaptiveCard}>
              <View style={styles.adaptiveHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.adaptiveTitle, { fontSize: rf(15.5) }]}>
                    Kế hoạch học hôm nay
                  </Text>
                </View>
                <Pressable hitSlop={8} onPress={() => pushRoute("/user/onboarding")}>
                  <Text style={styles.adaptiveTestLink}>Test trình độ →</Text>
                </Pressable>
              </View>

              <View style={styles.adaptiveChipsRow}>
                {recommendations.weakestPartNo ? (
                  <View style={styles.adaptiveChipWarn}>
                    <Text style={styles.adaptiveChipWarnText}>
                      Cần cải thiện: Part {recommendations.weakestPartNo} (
                      {Math.round(recommendations.weakestPartAccuracy ?? 0)}%)
                    </Text>
                  </View>
                ) : null}
                {recommendations.dueVocabCount > 0 ? (
                  <View style={styles.adaptiveChipInfo}>
                    <Text style={styles.adaptiveChipInfoText}>
                      {recommendations.dueVocabCount} từ đến hạn ôn
                    </Text>
                  </View>
                ) : null}
                {recommendations.mistakeCount > 0 ? (
                  <View style={styles.adaptiveChipInfo}>
                    <Text style={styles.adaptiveChipInfoText}>
                      {recommendations.mistakeCount} lỗi sai cần sửa
                    </Text>
                  </View>
                ) : null}
              </View>

              {recommendations.dailyPlan.length > 0 ? (
                <View style={styles.adaptivePlanList}>
                  {recommendations.dailyPlan.slice(0, 3).map((task) => (
                    <Pressable
                      key={task.id}
                      onPress={() => pushRoute(task.route as never)}
                      style={({ pressed }) => [styles.adaptiveTaskRow, pressed ? { opacity: 0.88 } : null]}
                    >
                      <View style={styles.adaptiveTaskCopy}>
                        <Text numberOfLines={1} style={styles.adaptiveTaskTitle}>
                          {task.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.adaptiveTaskSub}>
                          {task.subtitle}
                        </Text>
                      </View>
                      <View style={styles.adaptiveTaskBadge}>
                        <Text style={styles.adaptiveTaskBadgeText}>{task.badge}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </SurfaceCard>
          ) : null}

          <Pressable
            onPress={() => pushRoute("/user/subscription")}
            style={({ pressed }) => [pressed ? { opacity: 0.92 } : null]}
          >
            <SurfaceCard style={{ borderColor: "#8B5CF6", borderWidth: 1.5, marginBottom: 4 }}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
                <ClayIcon3D colors={["#A855F7", "#6D28D9"]} icon="sparkles" size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontSize: rf(14), fontWeight: "900" }}>
                    Gói {(auth.user?.planTier ?? (auth.user?.premium ? "PRO" : "FREE")).toUpperCase()} • Nâng cấp PLUS & PRO
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: rf(12), fontWeight: "600" }}>
                    PLUS 10.000đ (10.000 💎) • PRO 30.000đ (20.000 💎) / 30 ngày
                  </Text>
                </View>
                <Ionicons color="#7C3AED" name="chevron-forward" size={18} />
              </View>
            </SurfaceCard>
          </Pressable>

          {isDesktopWeb ? (
            <>
              <SectionTitle
                actionLabel="Xem tất cả"
                onActionPress={() => pushRoute("/user/leaderboard")}
                title="Bảng xếp hạng tuần"
              />
              <SurfaceCard>
                {weeklyLeaders.length > 0 ? (
                  weeklyLeaders.slice(0, 3).map((entry, idx) => (
                    <Pressable
                      key={entry.userId}
                      onPress={() => setInspectUserId(entry.userId)}
                      style={[styles.rankRow, idx === 0 ? styles.rankRowFirst : null]}
                    >
                      <Text style={styles.rankIndex}>#{entry.rank}</Text>
                      <UserAvatarWithFrame
                        avatarUrl={entry.avatarUrl}
                        frameId={entry.equippedFrameId}
                        fullName={entry.fullName}
                        level={entry.level}
                        showCornerBadge={false}
                        size={36}
                      />
                      <View style={styles.rankInfo}>
                        <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
                          <Text numberOfLines={1} style={[styles.rankName, { flexShrink: 1, fontSize: rf(13.5) }]}>
                            {entry.fullName} <Text style={styles.rankHandle}>@{entry.username}</Text>
                          </Text>
                          <VerifiedBadge size={14} verified={entry.verified} />
                        </View>
                        <Text numberOfLines={1} style={styles.rankMeta}>
                          {entry.activitiesCount} bài học • 🔥 {entry.currentStreak} ngày
                        </Text>
                      </View>
                      <View style={styles.rankScoreChip}>
                        <Text style={styles.rankScoreText}>+{entry.weeklyStudyDiamonds} 💎</Text>
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.emptyRankWrap}>
                    <Text style={styles.feedbackText}>Hoàn thành bài học đầu tiên để lên bảng xếp hạng tuần!</Text>
                  </View>
                )}
              </SurfaceCard>
            </>
          ) : null}
        </View>
      </Animated.View>

      <SectionTitle
        actionLabel="Xem tất cả"
        onActionPress={() => pushRoute("/user/profile")}
        title="Dành riêng cho bạn"
      />
      <View style={[styles.exploreGrid, { gap: featureGap }]}>
        {exploreCards.map((card) => (
          <Pressable
            key={card.title}
            onPress={() => pushRoute(card.route)}
            style={({ pressed }) => [
              { width: featureCardW },
              pressed ? { opacity: 0.92, transform: [{ scale: 0.97 }] } : null,
            ]}
          >
            <SurfaceCard
              padding="none"
              style={[
                styles.exploreCard,
                { shadowColor: card.accent },
              ]}
            >
              <Image resizeMode="cover" source={card.image} style={styles.exploreArtImg} />
              <View style={styles.exploreBody}>
                <Text numberOfLines={1} style={[styles.exploreTitle, { fontSize: rf(13.5) }]}>
                  {card.title}
                </Text>
              </View>
            </SurfaceCard>
          </Pressable>
        ))}
      </View>

      {!isDesktopWeb ? goalPickerSection : null}

      {!isDesktopWeb ? (
        <>
          <SectionTitle
            actionLabel="Xem tất cả"
            onActionPress={() => pushRoute("/user/leaderboard")}
            title="Bảng xếp hạng tuần"
          />
          <SurfaceCard>
            {weeklyLeaders.length > 0 ? (
              weeklyLeaders.map((entry, idx) => (
                <Pressable
                  key={entry.userId}
                  onPress={() => setInspectUserId(entry.userId)}
                  style={[styles.rankRow, idx === 0 ? styles.rankRowFirst : null]}
                >
                  <Text style={styles.rankIndex}>#{entry.rank}</Text>
                  <UserAvatarWithFrame
                    avatarUrl={entry.avatarUrl}
                    frameId={entry.equippedFrameId}
                    fullName={entry.fullName}
                    level={entry.level}
                    showCornerBadge={false}
                    size={36}
                  />
                  <View style={styles.rankInfo}>
                    <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
                      <Text numberOfLines={1} style={[styles.rankName, { flexShrink: 1, fontSize: rf(13.5) }]}>
                        {entry.fullName} <Text style={styles.rankHandle}>@{entry.username}</Text>
                      </Text>
                      <VerifiedBadge size={14} verified={entry.verified} />
                    </View>
                    <Text numberOfLines={1} style={styles.rankMeta}>
                      {entry.activitiesCount} bài học • 🔥 {entry.currentStreak} ngày
                    </Text>
                  </View>
                  <View style={styles.rankScoreChip}>
                    <Text style={styles.rankScoreText}>+{entry.weeklyStudyDiamonds} 💎</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyRankWrap}>
                <Text style={styles.feedbackText}>Hoàn thành bài học đầu tiên để lên bảng xếp hạng tuần!</Text>
                <Pressable onPress={() => pushRoute("/user/leaderboard")} style={styles.emptyRankBtn}>
                  <Text style={styles.emptyRankBtnText}>Mở Bảng Xếp Hạng ›</Text>
                </Pressable>
              </View>
            )}
          </SurfaceCard>
        </>
      ) : null}

      <PublicProfileModal
        onClose={() => setInspectUserId(null)}
        onStartDirectChat={(peer) => openDirectChat(peer)}
        userId={inspectUserId}
        visible={inspectUserId !== null}
      />
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    headerGreetingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    headerGreetingText: {
      color: colors.text,
      fontWeight: "900",
    },
    welcomeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      marginBottom: 8,
    },
    welcomeDesktopCard: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 22,
      borderWidth: 1,
      marginBottom: 14,
      paddingHorizontal: 20,
      paddingVertical: 14,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 22,
    },
    heroBrandEyebrow: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    heroBrandDot: {
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    heroBrandEyebrowText: {
      color: colors.primary,
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    welcomeTextCol: {
      flex: 1,
      gap: 8,
      minWidth: 0,
      paddingVertical: 4,
    },
    welcomeHeadline: {
      color: colors.text,
      fontWeight: "900",
      lineHeight: 26,
    },
    welcomeChipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    welcomeStatChip: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    welcomeStatText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
    },
    categoryDock: {
      marginBottom: 14,
    },
    categoryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    catTile: {
      alignItems: "center",
      flex: 1,
      gap: 6,
    },
    catIconBox: {
      alignItems: "center",
      borderRadius: 16,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    catLabel: {
      color: colors.text,
      fontWeight: "800",
      textAlign: "center",
    },
    dailyGoalCard: {
      marginBottom: 18,
    },
    dailyGoalRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    dailyGoalCopy: {
      flex: 1,
      minWidth: 0,
    },
    dailyGoalTitle: {
      color: colors.heroText,
      fontWeight: "900",
    },
    dailyGoalSub: {
      color: colors.heroTextMuted,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 4,
    },
    goalProgressRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
    },
    goalTrack: {
      backgroundColor: "rgba(255,255,255,0.28)",
      borderRadius: radius.pill,
      flex: 1,
      height: 8,
      overflow: "hidden",
    },
    goalFill: {
      backgroundColor: "#FFFFFF",
      borderRadius: radius.pill,
      height: "100%",
    },
    goalFraction: {
      color: "#FFFFFF",
      fontSize: 11.5,
      fontWeight: "800",
    },
    starBadgeWrap: {
      alignItems: "center",
      gap: 5,
    },
    starBadge: {
      alignItems: "center",
      borderRadius: 22,
      elevation: Platform.OS === "android" ? 4 : 0,
      height: 54,
      justifyContent: "center",
      shadowColor: "rgba(245, 158, 11, 0.35)",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      width: 54,
    },
    streakPillText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },
    continueCard: {
      marginBottom: 18,
    },
    continueRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    continueThumb: {
      alignItems: "center",
      borderRadius: 16,
      height: 56,
      justifyContent: "center",
      width: 56,
    },
    continueCopy: {
      flex: 1,
      minWidth: 0,
    },
    continueTitle: {
      color: colors.text,
      fontWeight: "900",
    },
    continueSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    continueProgressWrap: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    continuePct: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
    },
    playCircleBtn: {
      alignItems: "center",
      borderRadius: 999,
      elevation: Platform.OS === "android" ? 5 : 0,
      height: 42,
      justifyContent: "center",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      width: 42,
    },
    exploreGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 18,
    },
    exploreCard: {
      borderRadius: 22,
      overflow: "hidden",
    },
    exploreArtImg: {
      height: 100,
      width: "100%",
    },
    exploreBody: {
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 11,
    },
    exploreTitle: {
      color: colors.text,
      fontWeight: "900",
      textAlign: "center",
    },
    loadingCard: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
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
      marginBottom: 12,
      padding: 12,
    },
    pathSection: {
      marginBottom: 18,
    },
    pathTabsRow: {
      flexDirection: "row",
      gap: 8,
      paddingBottom: 10,
    },
    scoreTabPill: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      elevation: Platform.OS === "android" ? 2 : 0,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 9,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
    },
    scoreTabPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    scoreTabText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "900",
    },
    scoreTabTextActive: {
      color: colors.onPrimary,
    },
    activeDot: {
      borderRadius: 99,
      height: 7,
      width: 7,
    },
    selectedPathCard: {
      gap: 4,
    },
    selectedPathTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
    },
    tagRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 4,
    },
    pathCodeBadge: {
      color: colors.textMuted,
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    tagRecommend: {
      backgroundColor: colors.accentSoft,
      borderRadius: radius.pill,
      color: colors.accent,
      fontSize: 10.5,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagCurrent: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      color: colors.primary,
      fontSize: 10.5,
      fontWeight: "900",
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pathTitle: {
      color: colors.text,
      fontWeight: "900",
    },
    pathHint: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    chevronCircle: {
      alignItems: "center",
      borderRadius: 999,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    rankRow: {
      alignItems: "center",
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 10,
      paddingVertical: 9,
    },
    rankRowFirst: {
      borderTopWidth: 0,
      paddingTop: 2,
    },
    rankIndex: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: "900",
      width: 24,
    },
    rankAvatar: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    rankAvatarText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "900",
    },
    rankInfo: {
      flex: 1,
      minWidth: 0,
    },
    rankName: {
      color: colors.text,
      fontWeight: "800",
    },
    rankMeta: {
      color: colors.textMuted,
      fontSize: 11.5,
      marginTop: 1,
    },
    rankScoreChip: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    rankScoreText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "900",
    },
    headerRightCluster: { alignItems: "center", flexDirection: "row", gap: 8 },
    headerDiamondChip: {
      backgroundColor: colors.isDark ? "rgba(14,165,233,0.22)" : "#E0F2FE",
      borderColor: "#38BDF8",
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    headerDiamondText: { color: "#0284C7", fontSize: 12, fontWeight: "900" },
    rankHandle: { color: colors.primary, fontSize: 11.5, fontWeight: "700" },
    emptyRankWrap: { alignItems: "center", gap: 8, paddingVertical: 10 },
    emptyRankBtn: { paddingVertical: 4 },
    emptyRankBtnText: { color: colors.primary, fontSize: 12.5, fontWeight: "900" },
    adaptiveCard: {
      gap: 10,
      marginBottom: 18,
    },
    adaptiveHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
    },
    adaptiveEyebrow: {
      color: colors.primary,
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    adaptiveTitle: {
      color: colors.text,
      fontWeight: "900",
      marginTop: 2,
    },
    adaptiveTestLink: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: "800",
    },
    adaptiveChipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    adaptiveChipWarn: {
      backgroundColor: "#FEF3C7",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    adaptiveChipWarnText: {
      color: "#B45309",
      fontSize: 11.5,
      fontWeight: "800",
    },
    adaptiveChipInfo: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    adaptiveChipInfoText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
    },
    adaptivePlanList: {
      gap: 8,
    },
    adaptiveTaskRow: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    adaptiveTaskCopy: {
      flex: 1,
      minWidth: 0,
    },
    adaptiveTaskTitle: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: "800",
    },
    adaptiveTaskSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    adaptiveTaskBadge: {
      backgroundColor: colors.accentSoft,
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    adaptiveTaskBadgeText: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: "900",
    },
  });
