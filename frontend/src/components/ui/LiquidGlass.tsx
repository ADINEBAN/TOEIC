import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { radius, spacing } from "@/src/assets/styles/user-theme";
import { useAppTheme } from "@/src/store/theme-store";
import { useResponsiveLayout } from "@/src/utils/responsive";

type LiquidCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  hero?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
};

/**
 * Soft 3D Claymorphism card surface matching the bright pastel rounded aesthetic
 * (clean opaque white pillow cards on light themes; vibrant gradient hero banners).
 */
export function LiquidCard({
  children,
  style,
  hero = false,
  padding = "md",
}: LiquidCardProps) {
  const { theme, prismaticGlow } = useAppTheme();
  const { cardPadding, isNarrow } = useResponsiveLayout();
  const c = theme.colors;

  const resolvedPadding =
    padding === "none"
      ? 0
      : padding === "sm"
        ? Math.max(10, cardPadding - 4)
        : padding === "lg"
          ? cardPadding + 4
          : cardPadding;

  const heroColors: readonly [string, string, string] = [
    c.primaryGradient[0],
    c.primaryGradient[1],
    c.primaryGradient[2],
  ];

  return (
    <View
      style={[
        styles.cardShell,
        {
          backgroundColor: hero ? c.primary : c.surface,
          borderColor: hero ? c.heroBorder : c.glassBorder,
          borderRadius: isNarrow ? 22 : 24,
          elevation: Platform.OS === "android" ? (hero ? 10 : 6) : 0,
          padding: resolvedPadding,
          shadowColor: hero ? c.primary : c.shadow,
          shadowOpacity: hero ? 0.26 : c.isDark ? 0.25 : 0.14,
          shadowRadius: hero ? 20 : 18,
        },
        style,
      ]}
    >
      {hero ? (
        <>
          <LinearGradient
            colors={heroColors}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.heroBubbleTop} />
          <View pointerEvents="none" style={styles.heroBubbleBottom} />
        </>
      ) : prismaticGlow ? (
        <View
          pointerEvents="none"
          style={[
            styles.clayTintCorner,
            { backgroundColor: c.isDark ? "rgba(142,127,255,0.08)" : "rgba(113,96,242,0.035)" },
          ]}
        />
      ) : null}

      {children}
    </View>
  );
}

type LiquidButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "accent" | "glass";
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function LiquidButton({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  compact = false,
}: LiquidButtonProps) {
  const { theme } = useAppTheme();
  const { isNarrow, rf } = useResponsiveLayout();
  const c = theme.colors;
  const isGlass = variant === "glass";

  const gradientColors: readonly [string, string, ...string[]] =
    variant === "accent"
      ? [c.accentGradient[0], c.accentGradient[1]]
      : variant === "primary"
        ? c.primaryGradient
        : [c.surface, c.surfaceAlt];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonBase,
        compact ? styles.buttonCompact : null,
        {
          backgroundColor: isGlass ? c.surface : c.primary,
          minHeight: compact ? (isNarrow ? 40 : 42) : isNarrow ? 46 : 48,
          borderColor: isGlass ? c.glassBorder : "rgba(255,255,255,0.28)",
          elevation: Platform.OS === "android" ? (isGlass ? 3 : 6) : 0,
          shadowColor: isGlass ? c.shadow : variant === "accent" ? c.accent : c.primary,
        },
        pressed && !disabled && !loading ? styles.buttonPressed : null,
        disabled || loading ? styles.buttonDisabled : null,
        style,
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        end={{ x: 0.9, y: 1 }}
        pointerEvents="none"
        start={{ x: 0.1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.buttonContent}>
        {loading ? (
          <ActivityIndicator color={isGlass ? c.text : c.onPrimary} size="small" />
        ) : (
          <>
            {leftIcon}
            <Text
              numberOfLines={1}
              style={[
                styles.buttonLabel,
                {
                  fontSize: rf(compact ? 13 : 14.5),
                  color: isGlass ? c.text : c.onPrimary,
                },
              ]}
            >
              {label}
            </Text>
            {rightIcon}
          </>
        )}
      </View>
    </Pressable>
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  badge?: string | number;
};

export function LiquidSegmentedBar<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const c = theme.colors;

  return (
    <View style={[styles.segmentRow, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segmentPill,
              {
                backgroundColor: active ? c.primary : c.surface,
                borderColor: active ? c.primary : c.glassBorder,
                elevation: Platform.OS === "android" ? (active ? 3 : 2) : 0,
                shadowColor: active ? c.primary : c.shadow,
              },
              pressed ? { opacity: 0.9 } : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentLabel,
                {
                  fontSize: rf(12.5),
                  color: active ? c.onPrimary : c.textMuted,
                },
              ]}
            >
              {opt.label}
              {opt.badge !== undefined ? ` (${opt.badge})` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type LiquidSwitchProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel?: string;
};

export function LiquidSwitch({
  value,
  onValueChange,
  accessibilityLabel,
}: LiquidSwitchProps) {
  const { theme } = useAppTheme();
  const c = theme.colors;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.switchTrack,
        {
          borderColor: value ? c.primary : c.borderStrong,
          shadowColor: value ? c.primary : c.shadow,
        },
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <LinearGradient
        colors={
          value
            ? [c.primaryGradient[0], c.primaryGradient[1]]
            : [c.surfaceMuted, c.surfaceAlt]
        }
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.switchThumb,
          value ? styles.switchThumbOn : styles.switchThumbOff,
        ]}
      />
    </Pressable>
  );
}

type LiquidIconButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function LiquidIconButton({
  children,
  onPress,
  accessibilityLabel,
  style,
}: LiquidIconButtonProps) {
  const { theme } = useAppTheme();
  const { isNarrow } = useResponsiveLayout();
  const c = theme.colors;
  const size = isNarrow ? 40 : 44;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          height: size,
          width: size,
          borderRadius: 999,
          backgroundColor: c.surface,
          borderColor: c.glassBorder,
          elevation: Platform.OS === "android" ? 2 : 0,
          shadowColor: c.shadow,
        },
        pressed ? styles.buttonPressed : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  heroBubbleTop: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    height: 110,
    position: "absolute",
    right: -28,
    top: -34,
    width: 110,
  },
  heroBubbleBottom: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    bottom: -36,
    height: 88,
    left: -24,
    position: "absolute",
    width: 88,
  },
  clayTintCorner: {
    borderRadius: 90,
    height: 120,
    position: "absolute",
    right: -40,
    top: -45,
    width: 120,
  },
  buttonBase: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    position: "relative",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  buttonCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  buttonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
  },
  buttonLabel: {
    flexShrink: 1,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.56,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  segmentLabel: {
    fontWeight: "800",
    textAlign: "center",
  },
  switchTrack: {
    borderRadius: radius.pill,
    borderWidth: 1,
    elevation: Platform.OS === "android" ? 2 : 0,
    height: 32,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 3,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    width: 54,
  },
  switchThumb: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    elevation: Platform.OS === "android" ? 3 : 0,
    height: 24,
    shadowColor: "rgba(30, 27, 58, 0.24)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: 24,
  },
  switchThumbOn: {
    alignSelf: "flex-end",
  },
  switchThumbOff: {
    alignSelf: "flex-start",
  },
  iconBtn: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
});
