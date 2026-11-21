import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

type VerifiedBadgeProps = {
  verified?: boolean | null;
  size?: number;
};

/**
 * Instagram/Twitter-style scalloped blue verified badge seal.
 */
export default function VerifiedBadge({ verified, size = 15 }: VerifiedBadgeProps) {
  if (!verified) return null;
  const innerSize = Math.max(6, Math.round(size * 0.48));
  return (
    <View
      accessibilityLabel="Tài khoản đã xác minh tích xanh"
      style={[styles.wrap, { width: size, height: size }]}
    >
      <View
        style={[
          styles.checkBacking,
          {
            borderRadius: innerSize / 2,
            height: innerSize,
            width: innerSize,
          },
        ]}
      />
      <MaterialIcons color="#1D9BF0" name="verified" size={size} style={styles.icon} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  checkBacking: {
    backgroundColor: "#FFFFFF",
    position: "absolute",
  },
  icon: {
    lineHeight: undefined,
  },
});
