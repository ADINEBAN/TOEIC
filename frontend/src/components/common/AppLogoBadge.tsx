import { useEffect, useState } from "react";
import { Animated, Easing, Image, Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

type AppLogoBadgeProps = {
  size?: number;
  animated?: boolean;
  glowColor?: string;
  style?: StyleProp<ViewStyle>;
};

export default function AppLogoBadge({
  size = 40,
  animated = false,
  glowColor = "rgba(37, 99, 235, 0.34)",
  style,
}: AppLogoBadgeProps) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const borderRadius = Math.max(10, Math.round(size * 0.28));
  const animatedScale = animated
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] })
    : 1;
  const haloOpacity = animated
    ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.72] })
    : 0.28;

  return (
    <View style={[styles.wrap, { height: size, width: size }, style]}>
      {animated ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              backgroundColor: glowColor,
              borderRadius: borderRadius + 6,
              height: size + 8,
              opacity: haloOpacity,
              transform: [{ scale: animatedScale }],
              width: size + 8,
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.badge,
          {
            borderRadius,
            height: size,
            shadowColor: glowColor,
            transform: [{ scale: animatedScale }],
            width: size,
          },
        ]}
      >
        <Image
          resizeMode="cover"
          source={require("@/assets/images/brand-logo.png")}
          style={{ borderRadius, height: "100%", width: "100%" }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  halo: {
    position: "absolute",
  },
  badge: {
    backgroundColor: "#0B132B",
    borderColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
});
