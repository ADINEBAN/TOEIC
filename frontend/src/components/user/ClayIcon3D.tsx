import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

type ClayIcon3DProps = {
  icon: keyof typeof Ionicons.glyphMap;
  colors: readonly [string, string];
  shadowColor?: string;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
};

export default function ClayIcon3D({
  icon,
  colors,
  shadowColor,
  size = 50,
  iconSize,
  iconColor = "#FFFFFF",
  style,
}: ClayIcon3DProps) {
  const borderRadius = Math.round(size * 0.36);
  const resolvedIconSize = iconSize ?? Math.round(size * 0.48);

  return (
    <View
      style={[
        styles.outer,
        {
          borderRadius,
          height: size,
          width: size,
          shadowColor: shadowColor ?? colors[1],
          elevation: Platform.OS === "android" ? 6 : 0,
        },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius }]}>
        <LinearGradient
          colors={[colors[0], colors[1]]}
          end={{ x: 0.9, y: 1 }}
          start={{ x: 0.1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[styles.glossArc, { borderRadius }]} />
        <View
          pointerEvents="none"
          style={[
            styles.specDot,
            {
              height: Math.round(size * 0.24),
              width: Math.round(size * 0.42),
            },
          ]}
        />
        <Ionicons
          color={iconColor}
          name={icon}
          size={resolvedIconSize}
          style={styles.glyphShadow}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
  },
  clip: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.45)",
    borderTopColor: "rgba(255, 255, 255, 0.85)",
    borderWidth: 1.25,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  glossArc: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    height: "52%",
    left: 0,
    position: "absolute",
    right: 0,
    top: -4,
  },
  specDot: {
    backgroundColor: "rgba(255, 255, 255, 0.34)",
    borderRadius: 99,
    left: 6,
    position: "absolute",
    top: 4,
    transform: [{ rotate: "-18deg" }],
  },
  glyphShadow: {
    textShadowColor: "rgba(0, 0, 0, 0.16)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
});
