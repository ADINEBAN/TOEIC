import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton } from "@/src/components/ui/LiquidGlass";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { getUserRoadmap } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { UserRoadmap } from "@/src/types/user-api";
import { isNoActiveLearningPathError } from "@/src/utils/api-errors";
import { pushRoute } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

const CONFETTI_COLORS = ["#F5B942", "#47C4B4", "#5B8CFF", "#FF8B6A", "#8DDC6F", "#C99CFF"];
const CONFETTI_X = [-100, -64, -22, 22, 64, 100];
const CONFETTI_DELAY = [0, 180, 320, 480, 620, 760];

export default function PathCompleteScreen() {
  const { auth, isHydrated } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const params = useLocalSearchParams<{ completed?: string; moduleId?: string; pathTitle?: string }>();
  const [loading, setLoading] = useState(false);
  const [roadmap, setRoadmap] = useState<UserRoadmap | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [trophyScale] = useState(() => new Animated.Value(0.92));
  const [trophyGlow] = useState(() => new Animated.Value(0.55));
  const [confettiValues] = useState(() => CONFETTI_COLORS.map(() => new Animated.Value(0)));
  const isCompletedFallback = params.completed === "true";
  const fallbackPathTitle = params.pathTitle ? decodeURIComponent(params.pathTitle) : "Chúc mừng bạn đã về đích";

  const loadRoadmap = useCallback(async () => {
    if (!auth.accessToken) return;

    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await getUserRoadmap(auth.accessToken);
      setRoadmap(response.data ?? null);
    } catch (error) {
      setRoadmap(null);
      if (isNoActiveLearningPathError(error)) {
        if (isCompletedFallback) {
          setErrorMessage(null);
          return;
        }
        setErrorMessage("Tài khoản này chưa có roadmap để hoàn thành.");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải thông tin lộ trình.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, isCompletedFallback]);

  useEffect(() => {
    const trophyLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(trophyScale, {
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            toValue: 1.02,
            useNativeDriver: true,
          }),
          Animated.timing(trophyGlow, {
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(trophyScale, {
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            toValue: 0.96,
            useNativeDriver: true,
          }),
          Animated.timing(trophyGlow, {
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            toValue: 0.55,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    trophyLoop.start();

    const confettiLoops = confettiValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(CONFETTI_DELAY[index]),
          Animated.timing(value, {
            duration: 2400,
            easing: Easing.out(Easing.quad),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            duration: 0,
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    confettiLoops.forEach((loop) => loop.start());
    return () => {
      trophyLoop.stop();
      confettiLoops.forEach((loop) => loop.stop());
    };
  }, [confettiValues, trophyGlow, trophyScale]);

  useFocusEffect(
    useCallback(() => {
      if (!isHydrated || !auth.accessToken) return;
      void loadRoadmap();
    }, [auth.accessToken, isHydrated, loadRoadmap]),
  );

  const moduleCount = (roadmap?.milestones ?? []).reduce(
    (sum, item) => sum + (item?.modules?.length ?? 0),
    0,
  );
  const completedAt = roadmap?.completedAt;
  const completedAtLabel = useMemo(() => {
    if (!completedAt) return "Ngày hôm nay";
    const date = new Date(completedAt);
    if (Number.isNaN(date.getTime())) return "Ngày hôm nay";
    return date.toLocaleDateString("vi-VN");
  }, [completedAt]);
  const displayTitle = roadmap?.learningPathTitle ?? fallbackPathTitle;
  const displayStatus = roadmap?.status ?? (isCompletedFallback ? "COMPLETED" : null);

  const badgeW = gridItemWidth(3, 8, true);

  return (
    <UserScreen contentStyle={styles.content} hasTabDock={false}>
      <SurfaceCard style={styles.heroCard}>
        <View pointerEvents="none" style={styles.confettiLayer}>
          {confettiValues.map((value, index) => {
            const translateY = value.interpolate({
              inputRange: [0, 1],
              outputRange: [-40, 300],
            });
            const rotate = value.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", index % 2 === 0 ? "240deg" : "-240deg"],
            });
            const opacity = value.interpolate({
              inputRange: [0, 0.12, 0.9, 1],
              outputRange: [0, 1, 0.7, 0],
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.confettiPiece,
                  {
                    backgroundColor: CONFETTI_COLORS[index],
                    opacity,
                    transform: [{ translateX: CONFETTI_X[index] }, { translateY }, { rotate }],
                  },
                ]}
              />
            );
          })}
        </View>

        <Animated.View
          style={[
            styles.glowRing,
            {
              opacity: trophyGlow,
              transform: [{ scale: trophyScale }],
            },
          ]}
        />
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: trophyScale }] }]}>
          <Ionicons color={colors.onPrimary} name="trophy" size={36} />
        </Animated.View>

        <Text style={styles.eyebrow}>KHÓA HỌC ĐÃ HOÀN THÀNH</Text>
        <Text style={[styles.title, { fontSize: rf(24) }]}>{displayTitle}</Text>
        <Text style={styles.subtitle}>
          {displayStatus === "COMPLETED"
            ? "Bạn đã hoàn thành toàn bộ module trong lộ trình này!"
            : "Lộ trình đã được hoàn tất. Bạn có thể chọn mục tiêu mới để tiếp tục nâng điểm."}
        </Text>

        {loading ? (
          <View style={styles.feedbackRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.feedbackText}>Đang đồng bộ thành tích...</Text>
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.badgeRow}>
          <View style={[styles.badge, { width: badgeW }]}>
            <Text style={styles.badgeValue}>100%</Text>
            <Text style={styles.badgeLabel}>Tiến độ</Text>
          </View>
          <View style={[styles.badge, { width: badgeW }]}>
            <Text style={styles.badgeValue}>{moduleCount}</Text>
            <Text style={styles.badgeLabel}>Module</Text>
          </View>
          <View style={[styles.badge, { width: badgeW }]}>
            <Text style={styles.badgeValue}>{roadmap?.targetScore ?? "--"}+</Text>
            <Text style={styles.badgeLabel}>Mục tiêu</Text>
          </View>
        </View>

        <View style={styles.quoteCard}>
          <Text style={styles.quoteEyebrow}>{roadmap?.learningPathCode ?? "ROADMAP"}</Text>
          <Text style={styles.quoteText}>
            {roadmap?.learningPathDescription ?? "Một hành trình tốt là hành trình được đi đến tận cùng."}
          </Text>
          <Text style={styles.quoteMeta}>Đánh dấu hoàn thành: {completedAtLabel}</Text>
        </View>

        <View style={styles.actionCol}>
          <LiquidButton
            label="Xem roadmap đã hoàn thành"
            onPress={() => pushRoute("/user/practice")}
            variant="primary"
          />
          <LiquidButton
            label="Chọn lộ trình mới"
            onPress={() => pushRoute("/user/home")}
            variant="glass"
          />
        </View>
      </SurfaceCard>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    content: {
      justifyContent: "center",
    },
    heroCard: {
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      overflow: "hidden",
    },
    confettiLayer: {
      alignItems: "center",
      height: 300,
      left: "50%",
      marginLeft: -12,
      position: "absolute",
      top: 0,
      width: 24,
    },
    confettiPiece: {
      borderRadius: 6,
      height: 12,
      position: "absolute",
      top: 14,
      width: 9,
    },
    glowRing: {
      backgroundColor: colors.orbAccent,
      borderRadius: 999,
      height: 112,
      position: "absolute",
      top: 26,
      width: 112,
    },
    iconWrap: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      height: 76,
      justifyContent: "center",
      marginBottom: 10,
      marginTop: 18,
      width: 76,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 11.5,
      fontWeight: "900",
      letterSpacing: 1.2,
      marginBottom: 6,
    },
    title: {
      color: colors.primaryDark,
      fontWeight: "900",
      lineHeight: 30,
      marginBottom: 6,
      textAlign: "center",
    },
    subtitle: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
    },
    feedbackRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 10,
    },
    feedbackText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    errorText: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.16)" : "rgba(249,112,102,0.1)",
      borderColor: colors.isDark ? "rgba(248,113,113,0.34)" : "rgba(249,112,102,0.24)",
      borderRadius: 12,
      borderWidth: 1,
      color: colors.danger,
      marginTop: 10,
      padding: 10,
      width: "100%",
    },
    badgeRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
      width: "100%",
    },
    badge: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 10,
    },
    badgeValue: {
      color: colors.primaryDark,
      fontSize: 18,
      fontWeight: "900",
    },
    badgeLabel: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    quoteCard: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 14,
      padding: 14,
      width: "100%",
    },
    quoteEyebrow: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1,
      marginBottom: 4,
      textTransform: "uppercase",
    },
    quoteText: {
      color: colors.primaryDark,
      fontSize: 14,
      fontWeight: "700",
      lineHeight: 20,
    },
    quoteMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 6,
    },
    actionCol: {
      gap: 10,
      marginTop: 16,
      width: "100%",
    },
  });
