import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "@/src/assets/styles/user-theme";
import { useAppTheme } from "@/src/store/theme-store";

type ProgressBarProps = {
  label?: string;
  value: number;
  rightLabel?: string;
  accentColor?: string;
  labelColor?: string;
  rightLabelColor?: string;
};

export default function ProgressBar({
  label,
  value,
  rightLabel,
  accentColor,
  labelColor,
  rightLabelColor,
}: ProgressBarProps) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const resolvedLabelColor = labelColor ?? c.text;
  const resolvedRightColor = rightLabelColor ?? c.primaryDark;
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const resolvedPercent = Math.max(0, Math.min(100, safeValue));
  const fillColors: readonly [string, string] = accentColor
    ? [accentColor, accentColor]
    : [c.primaryGradient[0], c.primaryGradient[1]];

  return (
    <View>
      {label || rightLabel ? (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: resolvedLabelColor }]}>{label}</Text>
          {rightLabel ? (
            <Text style={[styles.rightLabel, { color: resolvedRightColor }]}>{rightLabel}</Text>
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.track,
          {
            backgroundColor: c.isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.62)",
            borderColor: c.glassBorder,
          },
        ]}
      >
        <View style={[styles.fillWrap, { width: `${resolvedPercent}%` }]}>
          <LinearGradient
            colors={fillColors}
            end={{ x: 1, y: 0.5 }}
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  label: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
  },
  rightLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  track: {
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 12,
    overflow: "hidden",
  },
  fillWrap: {
    borderRadius: radius.pill,
    height: "100%",
    overflow: "hidden",
    position: "relative",
  },
});
