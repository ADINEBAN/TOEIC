import { useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

type DiamondToastPayload = {
  id: number;
  diamonds: number;
  label?: string;
};

type Listener = (payload: DiamondToastPayload) => void;

const listeners = new Set<Listener>();
let nextToastSeq = 1;
let pendingPayload: DiamondToastPayload | null = null;

export function showDiamondRewardToast(diamonds: number, label?: string) {
  const amount = Math.round(Number(diamonds) || 0);
  if (amount <= 0) return;
  const payload: DiamondToastPayload = {
    id: nextToastSeq++,
    diamonds: amount,
    label,
  };
  pendingPayload = payload;
  listeners.forEach((fn) => fn(payload));
}

export default function DiamondRewardToastHost() {
  const [toast, setToast] = useState<DiamondToastPayload | null>(() => {
    const initial = pendingPayload;
    pendingPayload = null;
    return initial;
  });

  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-28));
  const [scale] = useState(() => new Animated.Value(0.72));

  useEffect(() => {
    const handler: Listener = (payload) => {
      pendingPayload = null;
      setToast(payload);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    translateY.setValue(-28);
    scale.setValue(0.72);

    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 6,
          tension: 110,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 130,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1900),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 340,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -36,
          duration: 340,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.88,
          duration: 340,
          useNativeDriver: true,
        }),
      ]),
    ]);

    anim.start(({ finished }) => {
      if (finished) {
        setToast((cur) => (cur?.id === toast.id ? null : cur));
      }
    });

    return () => {
      anim.stop();
    };
  }, [opacity, scale, toast, translateY]);

  if (!toast) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        style={[
          styles.pill,
          {
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <View style={styles.iconCircle}>
          <Text style={styles.diamondEmoji}>💎</Text>
        </View>
        <View style={styles.textCol}>
          <Text style={styles.deltaText}>+{toast.diamonds.toLocaleString("vi-VN")} 💎</Text>
          {toast.label ? (
            <Text numberOfLines={1} style={styles.subText}>
              {toast.label}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: Platform.OS === "web" ? 18 : 14,
    zIndex: 9999,
  },
  pill: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderColor: "#38BDF8",
    borderRadius: 999,
    borderWidth: 1.5,
    elevation: 10,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: "rgba(56, 189, 248, 0.2)",
    borderRadius: 999,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  diamondEmoji: {
    fontSize: 16,
  },
  textCol: {
    gap: 1,
  },
  deltaText: {
    color: "#38BDF8",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  subText: {
    color: "#E2E8F0",
    fontSize: 11.5,
    fontWeight: "700",
  },
});
