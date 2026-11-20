import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LiquidCard } from "@/src/components/ui/LiquidGlass";
import { useAppTheme } from "@/src/store/theme-store";
import { useResponsiveLayout } from "@/src/utils/responsive";

type AuthLayoutProps = {
  children: ReactNode;
  compact?: boolean;
  scrollable?: boolean;
};

export default function AuthLayout({
  children,
  compact = false,
  scrollable = true,
}: AuthLayoutProps) {
  const { theme, prismaticGlow } = useAppTheme();
  const { width, screenPadding, isShort, isNarrow, insets } = useResponsiveLayout();
  const c = theme.colors;
  const orbSize = Math.round(Math.min(width * 0.72, 290));

  const content = (
    <View style={styles.centerSlot}>
      <LiquidCard
        padding={compact || isShort ? "sm" : "md"}
        style={[
          styles.card,
          {
            borderRadius: isNarrow ? 24 : 28,
            paddingHorizontal: isNarrow ? 16 : 22,
            paddingVertical: isShort ? 18 : 24,
          },
        ]}
      >
        {children}
      </LiquidCard>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.background }]}>
      <StatusBar barStyle={c.isDark ? "light-content" : "dark-content"} />
      <LinearGradient
        colors={c.backgroundGradient}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {prismaticGlow ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.orb,
              {
                backgroundColor: c.orbPrimary,
                borderRadius: orbSize,
                height: orbSize,
                right: -Math.round(orbSize * 0.3),
                top: 24,
                width: orbSize,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.orb,
              {
                backgroundColor: c.orbSecondary,
                borderRadius: orbSize,
                bottom: 40,
                height: orbSize,
                left: -Math.round(orbSize * 0.32),
                width: orbSize,
              },
            ]}
          />
        </>
      ) : null}

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
                paddingBottom: Math.max(insets.bottom, 16) + 12,
                paddingHorizontal: screenPadding,
                paddingTop: isShort ? 12 : 24,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 12,
                paddingHorizontal: screenPadding,
                paddingTop: isShort ? 12 : 24,
              },
            ]}
          >
            {content}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
    maxWidth: 460,
    width: "100%",
  },
  card: {
    width: "100%",
  },
  orb: {
    position: "absolute",
  },
});
