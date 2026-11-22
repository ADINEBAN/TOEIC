import { LinearGradient } from "expo-linear-gradient";
import { usePathname } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppErrorBoundary from "@/src/components/common/AppErrorBoundary";
import DiamondRewardToastHost from "@/src/components/common/DiamondRewardToast";
import { useAppTheme } from "@/src/store/theme-store";
import { useResponsiveLayout } from "@/src/utils/responsive";

const TAB_ROUTES = new Set(["/user/home", "/user/practice", "/user/cards", "/user/test", "/user/profile"]);

type UserScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
  hasTabDock?: boolean;
};

export default function UserScreen({
  children,
  scrollable = true,
  contentStyle,
  hasTabDock,
}: UserScreenProps) {
  const { theme, prismaticGlow } = useAppTheme();
  const pathname = usePathname();
  const {
    width,
    isShort,
    screenPadding,
    maxContentWidth,
    dockClearance,
    pageBottomClearance,
  } = useResponsiveLayout();
  const c = theme.colors;

  const showDockPadding = hasTabDock ?? TAB_ROUTES.has(pathname);
  const baseBottomPad = showDockPadding ? dockClearance : pageBottomClearance;
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setAndroidKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bottomPad = androidKeyboardHeight > 0 ? Math.max(baseBottomPad, androidKeyboardHeight + 16) : baseBottomPad;

  const orbBig = Math.round(Math.min(width * 0.72, 320));
  const orbMid = Math.round(Math.min(width * 0.64, 280));
  const orbSmall = Math.round(Math.min(width * 0.56, 240));

  const body = (
    <View
      style={[
        !scrollable && styles.content,
        {
          alignSelf: "center",
          maxWidth: maxContentWidth,
          paddingBottom: bottomPad,
          paddingHorizontal: screenPadding,
          paddingTop: isShort ? 8 : 12,
          width: "100%",
        },
        contentStyle,
      ]}
    >
      <AppErrorBoundary>{children}</AppErrorBoundary>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: c.background }]}>
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
                borderRadius: orbBig,
                height: orbBig,
                left: -Math.round(orbBig * 0.32),
                top: 30,
                width: orbBig,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.orb,
              {
                backgroundColor: c.orbSecondary,
                borderRadius: orbMid,
                height: orbMid,
                right: -Math.round(orbMid * 0.34),
                top: 170,
                width: orbMid,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.orb,
              {
                backgroundColor: c.orbAccent,
                borderRadius: orbSmall,
                bottom: 80,
                height: orbSmall,
                left: "24%",
                width: orbSmall,
              },
            ]}
          />
        </>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {scrollable ? (
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
      <DiamondRewardToastHost />
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
  },
  content: {
    flex: 1,
  },
  orb: {
    position: "absolute",
  },
});
