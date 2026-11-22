import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LiquidCard } from "@/src/components/ui/LiquidGlass";
import { useAppTheme } from "@/src/store/theme-store";
import { useResponsiveLayout } from "@/src/utils/responsive";

type AuthLayoutProps = {
  children: ReactNode;
  compact?: boolean;
  scrollable?: boolean;
  mode?: "login" | "register";
};

export default function AuthLayout({
  children,
  compact = false,
  scrollable = true,
  mode = "login",
}: AuthLayoutProps) {
  const { theme } = useAppTheme();
  const { width, screenPadding, isShort, isNarrow, insets } = useResponsiveLayout();
  const c = theme.colors;
  const isWideWeb = Platform.OS === "web" && width >= 920;

  const [enterAnim] = useState(() => new Animated.Value(0));
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [driftAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, {
          toValue: 1,
          duration: 5500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(driftAnim, {
          toValue: 0,
          duration: 5500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );

    floatLoop.start();
    driftLoop.start();
    return () => {
      floatLoop.stop();
      driftLoop.stop();
    };
  }, [driftAnim, enterAnim, floatAnim]);

  const cardOpacity = enterAnim;
  const cardTranslateY = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });
  const cardScale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });

  const mascotBobY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] });
  const pillBobY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [5, -5] });
  const bgScale = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const bgShiftX = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const orbFloat = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] });

  const showcaseFeatures =
    mode === "register"
      ? [
          { icon: "compass" as const, text: "Test nhanh xếp lộ trình 300+ → 900+" },
          { icon: "logo-youtube" as const, text: "Học Video Song ngữ AI & Flashcard SM-2" },
          { icon: "trophy" as const, text: "Đấu trường 1v1 & Đề chuẩn ETS 200 câu" },
        ]
      : [
          { icon: "sparkles" as const, text: "AI Coach giải thích chi tiết từng câu" },
          { icon: "flame" as const, text: "Chuỗi Streak & Thưởng Kim cương mỗi ngày" },
          { icon: "document-text" as const, text: "Chấm điểm TOEIC chuẩn ETS 10–990" },
        ];

  const mobileContent = (
    <Animated.View
      style={[
        styles.centerSlot,
        {
          opacity: cardOpacity,
          transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
        },
      ]}
    >
      <LiquidCard
        padding={compact || isShort ? "sm" : "md"}
        style={[
          styles.card,
          styles.mobileGlassCard,
          {
            backgroundColor: c.isDark ? "rgba(18, 24, 48, 0.88)" : "rgba(255, 255, 255, 0.90)",
            borderColor: c.isDark ? "rgba(148, 163, 184, 0.25)" : "rgba(255, 255, 255, 0.85)",
            borderRadius: isNarrow ? 24 : 28,
            paddingHorizontal: isNarrow ? 16 : 24,
            paddingVertical: isShort ? 18 : 24,
          },
        ]}
      >
        {children}
      </LiquidCard>
    </Animated.View>
  );

  const webWideContent = (
    <Animated.View
      style={[
        styles.splitCardShell,
        {
          backgroundColor: c.isDark ? c.surface : "#FFFFFF",
          borderColor: c.isDark ? c.glassBorder : "rgba(15, 23, 42, 0.08)",
          opacity: cardOpacity,
          transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
        },
      ]}
    >
      {/* Left Form Panel */}
      <View
        style={[
          styles.splitFormCol,
          { backgroundColor: c.isDark ? c.surface : "#FFFFFF" },
        ]}
      >
        <View style={styles.splitFormInner}>{children}</View>
      </View>

      {/* Right Animated Paper-Cut Showcase Panel */}
      <View style={styles.splitShowcaseCol}>
        <Animated.Image
          resizeMode="cover"
          source={require("@/assets/images/auth-papercut-user.jpg")}
          style={[
            StyleSheet.absoluteFill,
            {
              height: "100%",
              transform: [{ scale: bgScale }, { translateX: bgShiftX }],
              width: "100%",
            },
          ]}
        />
        <LinearGradient
          colors={["rgba(6, 78, 59, 0.14)", "rgba(6, 78, 59, 0.72)", "rgba(2, 44, 34, 0.92)"]}
          end={{ x: 0.9, y: 1 }}
          pointerEvents="none"
          start={{ x: 0.1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Animated Soft Glowing Orbs */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowOrbTop,
            { transform: [{ translateY: orbFloat }] },
          ]}
        />

        <View style={styles.showcaseForeground}>
          {/* Top Floating Eyebrow Pill */}
          <Animated.View style={[styles.showcaseBrandPill, { transform: [{ translateY: pillBobY }] }]}>
            <View style={styles.showcaseIconBubble}>
              <Ionicons color="#6EE7B7" name="sparkles" size={16} />
            </View>
            <View>
              <Text style={styles.showcaseBrandTitle}>SMART AI WORKSPACE</Text>
              <Text style={styles.showcaseBrandSub}>Lộ trình TOEIC cá nhân hóa</Text>
            </View>
          </Animated.View>

          {/* Center Floating Mascot + Stat Halo */}
          <View style={styles.mascotStage}>
            <Animated.View
              style={[
                styles.floatingStatChip,
                styles.floatingStatLeft,
                { transform: [{ translateY: pillBobY }] },
              ]}
            >
              <Ionicons color="#34D399" name="checkmark-circle" size={14} />
              <Text style={styles.floatingStatText}>Chuẩn ETS 200 câu</Text>
            </Animated.View>

            <Animated.Image
              resizeMode="contain"
              source={require("@/assets/images/mascot-home.png")}
              style={[
                styles.showcaseMascot,
                { transform: [{ translateY: mascotBobY }] },
              ]}
            />

            <Animated.View
              style={[
                styles.floatingStatChip,
                styles.floatingStatRight,
                { transform: [{ translateY: mascotBobY }] },
              ]}
            >
              <Ionicons color="#FBBF24" name="flame" size={14} />
              <Text style={styles.floatingStatText}>+Kim cương mỗi ngày</Text>
            </Animated.View>
          </View>

          {/* Bottom Frosted Caption & Feature Pills */}
          <View style={styles.showcaseFooterCard}>
            <Text style={styles.showcaseHeadline}>
              {mode === "register"
                ? "Bắt đầu hành trình 990 TOEIC cùng AI"
                : "Chinh phục mục tiêu TOEIC nhanh hơn 3x"}
            </Text>
            <View style={styles.showcaseFeatureList}>
              {showcaseFeatures.map((item) => (
                <View key={item.text} style={styles.showcaseFeatureRow}>
                  <Ionicons color="#6EE7B7" name={item.icon} size={15} />
                  <Text style={styles.showcaseFeatureText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );

  const orbSize = Math.round(Math.min(width * 0.72, 320));

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.background }]}>
      <StatusBar barStyle={c.isDark ? "light-content" : "dark-content"} />

      {/* Living Botanical Paper-Cut Backdrop */}
      <Animated.Image
        blurRadius={Platform.OS === "web" ? 4 : 2}
        resizeMode="cover"
        source={require("@/assets/images/auth-papercut-user.jpg")}
        style={[
          StyleSheet.absoluteFill,
          {
            height: "100%",
            opacity: isWideWeb ? (c.isDark ? 0.16 : 0.24) : c.isDark ? 0.28 : 0.48,
            transform: [{ scale: bgScale }],
            width: "100%",
          },
        ]}
      />
      <LinearGradient
        colors={
          c.isDark
            ? ["rgba(11, 16, 33, 0.85)", "rgba(15, 23, 42, 0.92)"]
            : isWideWeb
              ? ["rgba(241, 247, 245, 0.82)", "rgba(226, 240, 234, 0.88)"]
              : ["rgba(255, 255, 255, 0.35)", "rgba(236, 253, 245, 0.65)"]
        }
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          {
            backgroundColor: c.isDark ? c.orbPrimary : "rgba(16, 185, 129, 0.18)",
            borderRadius: orbSize,
            height: orbSize,
            right: -Math.round(orbSize * 0.26),
            top: 20,
            transform: [{ translateY: orbFloat }],
            width: orbSize,
          },
        ]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        {scrollable ? (
          <ScrollView
            bounces={false}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                paddingHorizontal: isWideWeb ? 24 : screenPadding,
                paddingTop: isWideWeb ? 16 : isShort ? 12 : 24,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isWideWeb ? webWideContent : mobileContent}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                paddingHorizontal: isWideWeb ? 24 : screenPadding,
                paddingTop: isWideWeb ? 16 : isShort ? 12 : 24,
              },
            ]}
          >
            {isWideWeb ? webWideContent : mobileContent}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  centerSlot: {
    alignSelf: "center",
    maxWidth: 440,
    width: "100%",
  },
  card: {
    width: "100%",
  },
  mobileGlassCard: {
    shadowColor: "#064E3B",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
  },
  splitCardShell: {
    alignSelf: "center",
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    maxWidth: 980,
    minHeight: 540,
    overflow: "hidden",
    shadowColor: "#064E3B",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 48,
    width: "100%",
  },
  splitFormCol: {
    flex: 1.02,
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingVertical: 20,
  },
  splitFormInner: {
    alignSelf: "center",
    maxWidth: 380,
    width: "100%",
  },
  splitShowcaseCol: {
    flex: 1.05,
    minWidth: 360,
    overflow: "hidden",
    position: "relative",
  },
  glowOrbTop: {
    backgroundColor: "rgba(52, 211, 153, 0.24)",
    borderRadius: 180,
    height: 220,
    position: "absolute",
    right: -40,
    top: -30,
    width: 220,
  },
  showcaseForeground: {
    flex: 1,
    justifyContent: "space-between",
    padding: 28,
  },
  showcaseBrandPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(6, 78, 59, 0.56)",
    borderColor: "rgba(167, 243, 208, 0.35)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  showcaseIconBubble: {
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.22)",
    borderColor: "rgba(110, 231, 183, 0.45)",
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  showcaseBrandTitle: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  showcaseBrandSub: {
    color: "#A7F3D0",
    fontSize: 10.5,
    fontWeight: "700",
  },
  mascotStage: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    minHeight: 200,
    position: "relative",
  },
  showcaseMascot: {
    height: 175,
    width: 175,
  },
  floatingStatChip: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderColor: "rgba(255, 255, 255, 0.32)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "absolute",
  },
  floatingStatLeft: {
    left: 6,
    top: 26,
  },
  floatingStatRight: {
    bottom: 24,
    right: 6,
  },
  floatingStatText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "800",
  },
  showcaseFooterCard: {
    backgroundColor: "rgba(2, 44, 34, 0.62)",
    borderColor: "rgba(167, 243, 208, 0.24)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  showcaseHeadline: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 26,
  },
  showcaseFeatureList: {
    gap: 7,
  },
  showcaseFeatureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  showcaseFeatureText: {
    color: "#ECFDF5",
    fontSize: 12.5,
    fontWeight: "700",
  },
  orb: {
    position: "absolute",
  },
});
