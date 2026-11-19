import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";

import { resolvePlayableMediaUrl } from "@/src/services/user.service";
import { useAppTheme } from "@/src/store/theme-store";
import { getLevelTierStyle } from "@/src/utils/level";

const COSMETIC_AVATAR_SOURCES: Record<string, ImageSourcePropType> = {
  kitty: require("@/assets/avatars/avatar-kitty.jpg"),
  owl: require("@/assets/avatars/avatar-owl.jpg"),
  panda: require("@/assets/avatars/avatar-panda.jpg"),
  bunny: require("@/assets/avatars/avatar-bunny.jpg"),
  shiba: require("@/assets/avatars/avatar-shiba.jpg"),
  parrot: require("@/assets/avatars/avatar-parrot.jpg"),
};

const FRAME_OVERLAY_IMAGES: Record<string, ImageSourcePropType> = {
  frame_static_bronze: require("@/assets/frames/frame-bronze-shield.png"),
  frame_static_emerald: require("@/assets/frames/frame-emerald-jade.png"),
  frame_static_sakura: require("@/assets/frames/frame-sakura.png"),
  frame_static_scholar: require("@/assets/frames/frame-scholar-gold.png"),
  frame_static_royal: require("@/assets/frames/frame-royal-sapphire.png"),
  frame_anim_neon_pulse: require("@/assets/frames/frame-neon-pulse.png"),
  frame_anim_cyber_orbit: require("@/assets/frames/frame-cyber-orbit.png"),
  frame_anim_phoenix_flame: require("@/assets/frames/frame-phoenix-flame.png"),
  frame_anim_aurora_crown: require("@/assets/frames/frame-aurora-crown.png"),
  frame_anim_galactic_dragon: require("@/assets/frames/frame-dragon-galaxy.png"),
  frame_anim_crimson_dragon: require("@/assets/frames/frame-dragon-crimson.png"),
  frame_anim_frost_wolf: require("@/assets/frames/frame-wolf-frost.png"),
  frame_anim_emerald_wolf: require("@/assets/frames/frame-wolf-emerald.png"),
};

type FrameSpec = {
  colors: readonly [string, string, string];
  particleColor: string;
  secondaryParticleColor: string;
  animated: boolean;
  mode?: "rotate" | "pulse" | "flame" | "aurora" | "galaxy" | "frost" | "dragon";
};

const FRAME_SPECS: Record<string, FrameSpec> = {
  frame_static_bronze: {
    colors: ["#CD7F32", "#F59E0B", "#92400E"],
    particleColor: "#F59E0B",
    secondaryParticleColor: "#FDE68A",
    animated: false,
  },
  frame_static_emerald: {
    colors: ["#34D399", "#10B981", "#047857"],
    particleColor: "#34D399",
    secondaryParticleColor: "#A7F3D0",
    animated: false,
  },
  frame_static_sakura: {
    colors: ["#F9A8D4", "#F472B6", "#FB7185"],
    particleColor: "#F9A8D4",
    secondaryParticleColor: "#FDF2F8",
    animated: false,
  },
  frame_static_scholar: {
    colors: ["#FDE047", "#F59E0B", "#B45309"],
    particleColor: "#FACC15",
    secondaryParticleColor: "#FEF08A",
    animated: false,
  },
  frame_static_royal: {
    colors: ["#60A5FA", "#2563EB", "#4338CA"],
    particleColor: "#60A5FA",
    secondaryParticleColor: "#FBBF24",
    animated: false,
  },
  frame_anim_neon_pulse: {
    colors: ["#22D3EE", "#6366F1", "#38BDF8"],
    particleColor: "#22D3EE",
    secondaryParticleColor: "#A5B4FC",
    animated: true,
    mode: "pulse",
  },
  frame_anim_cyber_orbit: {
    colors: ["#C084FC", "#8B5CF6", "#EC4899"],
    particleColor: "#F472B6",
    secondaryParticleColor: "#C4B5FD",
    animated: true,
    mode: "rotate",
  },
  frame_anim_phoenix_flame: {
    colors: ["#FDE047", "#F97316", "#DC2626"],
    particleColor: "#FB923C",
    secondaryParticleColor: "#FDE047",
    animated: true,
    mode: "flame",
  },
  frame_anim_aurora_crown: {
    colors: ["#2DD4BF", "#38BDF8", "#FBBF24"],
    particleColor: "#2DD4BF",
    secondaryParticleColor: "#FDE047",
    animated: true,
    mode: "aurora",
  },
  frame_anim_galactic_dragon: {
    colors: ["#A855F7", "#F59E0B", "#3B82F6"],
    particleColor: "#C084FC",
    secondaryParticleColor: "#60A5FA",
    animated: true,
    mode: "galaxy",
  },
  frame_anim_frost_wolf: {
    colors: ["#67E8F9", "#38BDF8", "#0284C7"],
    particleColor: "#67E8F9",
    secondaryParticleColor: "#E0F2FE",
    animated: true,
    mode: "frost",
  },
  frame_anim_emerald_wolf: {
    colors: ["#34D399", "#10B981", "#059669"],
    particleColor: "#34D399",
    secondaryParticleColor: "#FEF08A",
    animated: true,
    mode: "aurora",
  },
  frame_anim_crimson_dragon: {
    colors: ["#EF4444", "#F59E0B", "#B91C1C"],
    particleColor: "#F97316",
    secondaryParticleColor: "#FDE047",
    animated: true,
    mode: "dragon",
  },
};

export function resolveAvatarSource(avatarUrl?: string | null): ImageSourcePropType | null {
  if (!avatarUrl) return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("cosmetic://")) {
    const key = trimmed.slice("cosmetic://".length).toLowerCase();
    return COSMETIC_AVATAR_SOURCES[key] ?? null;
  }
  if (trimmed.startsWith("data:") || trimmed.startsWith("file://")) {
    return { uri: trimmed };
  }
  const resolved = resolvePlayableMediaUrl(trimmed);
  if (resolved && (/^https?:\/\//i.test(resolved) || resolved.startsWith("/"))) {
    return { uri: resolved };
  }
  return null;
}

export function getCosmeticAvatarPreview(previewKey: string): ImageSourcePropType | null {
  return COSMETIC_AVATAR_SOURCES[previewKey.toLowerCase()] ?? null;
}

type UserAvatarWithFrameProps = {
  avatarUrl?: string | null;
  frameId?: string | null;
  fullName?: string | null;
  size?: number;
  level?: number;
  showCornerBadge?: boolean;
};

export default function UserAvatarWithFrame({
  avatarUrl,
  frameId,
  fullName,
  size = 44,
  level,
}: UserAvatarWithFrameProps) {
  const { theme } = useAppTheme();
  const colors = theme.colors;
  const spec = frameId ? FRAME_SPECS[frameId] : undefined;
  const frameArtwork = frameId ? FRAME_OVERLAY_IMAGES[frameId] : undefined;
  const isParrotGlow = avatarUrl === "cosmetic://parrot";
  const animated = Boolean(spec?.animated || isParrotGlow);

  const [spinAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(0));
  const [flareAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animated) {
      spinAnim.setValue(0);
      pulseAnim.setValue(0);
      flareAnim.setValue(0);
      return;
    }

    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: spec?.mode === "dragon" || spec?.mode === "galaxy" ? 3400 : 4600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const flareLoop = Animated.loop(
      Animated.timing(flareAnim, {
        toValue: 1,
        duration: 1900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );

    spinLoop.start();
    pulseLoop.start();
    flareLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
      flareLoop.stop();
    };
  }, [animated, flareAnim, pulseAnim, spec?.mode, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const reverseSpin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["360deg", "0deg"],
  });
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.09],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0.88],
  });
  const frameBreath = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.032],
  });
  const flareRise = flareAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, -Math.max(12, Math.round(size * 0.34))],
  });
  const flareFade = flareAnim.interpolate({
    inputRange: [0, 0.25, 0.85, 1],
    outputRange: [0, 0.95, 0.65, 0],
  });

  // Match the normalized 226/440 aperture in assets/frames/*.png cleanly.
  const hasOrnateArtwork = Boolean(frameArtwork && spec);
  const frameOverlaySize = hasOrnateArtwork ? Math.round(size * 1.94) : size + 6;
  const wrapperSize = hasOrnateArtwork ? Math.round(size * 1.56) : size + 8;
  const imageSource = resolveAvatarSource(avatarUrl);
  const initial = (fullName?.trim().charAt(0) || "U").toUpperCase();
  const ringColors: readonly [string, string, string] = spec
    ? spec.colors
    : isParrotGlow
      ? ["#60A5FA", "#8B5CF6", "#38BDF8"]
      : [colors.glassBorder, colors.primarySoft, colors.glassBorder];

  const showParticles = Boolean(animated && spec);
  const levelTier = typeof level === "number" && level > 0 ? getLevelTierStyle(level) : null;
  const badgeFontSize = size >= 60 ? 10 : size >= 40 ? 9 : 8;
  const badgePadH = size >= 60 ? 6 : 4;
  const badgeOffset = hasOrnateArtwork ? Math.round(size * 0.06) : -2;

  return (
    <View style={[styles.wrapper, { height: wrapperSize, width: wrapperSize }]}>
      {/* Layer 1: Pulsing Radial Aura */}
      {animated ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.auraHalo,
            {
              borderRadius: wrapperSize,
              height: Math.round(size * 1.38),
              opacity: pulseOpacity,
              shadowColor: spec?.particleColor ?? "#60A5FA",
              transform: [{ scale: pulseScale }],
              width: Math.round(size * 1.38),
            },
          ]}
        >
          <LinearGradient
            colors={[
              `${spec?.particleColor ?? "#60A5FA"}44`,
              `${spec?.secondaryParticleColor ?? "#8B5CF6"}22`,
              "transparent",
            ]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={[StyleSheet.absoluteFill, { borderRadius: wrapperSize }]}
          />
        </Animated.View>
      ) : null}

      {/* Layer 2: Default metallic border when user has no frame artwork equipped */}
      {!hasOrnateArtwork ? (
        <View
          pointerEvents="none"
          style={[
            styles.fallbackRing,
            {
              borderRadius: (size + 6) / 2,
              height: size + 6,
              width: size + 6,
            },
          ]}
        >
          <LinearGradient
            colors={ringColors}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={[StyleSheet.absoluteFill, { borderRadius: (size + 6) / 2 }]}
          />
        </View>
      ) : null}

      {/* Layer 3: User Avatar Photo */}
      <View
        style={[
          styles.avatarCore,
          {
            backgroundColor: colors.primarySoft,
            borderColor: hasOrnateArtwork ? "rgba(255,255,255,0.22)" : colors.surface,
            borderRadius: size / 2,
            borderWidth: hasOrnateArtwork ? 1 : 2,
            height: size,
            width: size,
          },
        ]}
      >
        {imageSource ? (
          <Image resizeMode="cover" source={imageSource} style={{ height: size, width: size }} />
        ) : (
          <LinearGradient
            colors={colors.primaryGradient}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={[styles.fallbackGrad, { borderRadius: size / 2 }]}
          >
            <Text
              style={[
                styles.initialText,
                { color: colors.onPrimary, fontSize: Math.max(12, Math.round(size * 0.42)) },
              ]}
            >
              {initial}
            </Text>
          </LinearGradient>
        )}
      </View>

      {/* Layer 4: Sculpted Ornate 3D Transparent Frame PNG */}
      {hasOrnateArtwork && frameArtwork ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ornateArtworkWrap,
            {
              height: frameOverlaySize,
              transform: animated ? [{ scale: frameBreath }] : [],
              width: frameOverlaySize,
            },
          ]}
        >
          <Image
            resizeMode="contain"
            source={frameArtwork}
            style={{ height: frameOverlaySize, width: frameOverlaySize }}
          />
        </Animated.View>
      ) : null}

      {/* Layer 5: Orbiting Luminous Sparks & Rising Flame/Crystal Effects */}
      {showParticles && spec ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbitLayer,
              {
                height: wrapperSize + 6,
                transform: [{ rotate: spin }],
                width: wrapperSize + 6,
              },
            ]}
          >
            <View
              style={[
                styles.sparkDotLarge,
                {
                  backgroundColor: spec.secondaryParticleColor,
                  left: (wrapperSize + 6) / 2 - 3.5,
                  shadowColor: spec.particleColor,
                  top: 0,
                },
              ]}
            />
            <View
              style={[
                styles.sparkDotSmall,
                {
                  backgroundColor: spec.particleColor,
                  bottom: 2,
                  right: Math.round(wrapperSize * 0.16),
                  shadowColor: spec.particleColor,
                },
              ]}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbitLayer,
              {
                height: wrapperSize + 2,
                transform: [{ rotate: reverseSpin }],
                width: wrapperSize + 2,
              },
            ]}
          >
            <View
              style={[
                styles.sparkDotSmall,
                {
                  backgroundColor: "#FFFFFF",
                  left: 2,
                  shadowColor: spec.secondaryParticleColor,
                  top: Math.round(wrapperSize * 0.25),
                },
              ]}
            />
            <View
              style={[
                styles.sparkDotMedium,
                {
                  backgroundColor: spec.particleColor,
                  bottom: Math.round(wrapperSize * 0.2),
                  right: 1,
                  shadowColor: spec.secondaryParticleColor,
                },
              ]}
            />
          </Animated.View>

          {size >= 40 ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.risingFlare,
                  {
                    backgroundColor: spec.particleColor,
                    left: 3,
                    opacity: flareFade,
                    shadowColor: spec.particleColor,
                    top: Math.round(wrapperSize * 0.42),
                    transform: [{ translateY: flareRise }, { scale: pulseScale }],
                  },
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.risingFlare,
                  {
                    backgroundColor: spec.secondaryParticleColor,
                    opacity: flareFade,
                    right: 3,
                    shadowColor: spec.secondaryParticleColor,
                    top: Math.round(wrapperSize * 0.36),
                    transform: [{ translateY: flareRise }, { scale: pulseScale }],
                  },
                ]}
              />
            </>
          ) : null}
        </>
      ) : null}

      {/* Layer 6: Corner Tiered Level Badge */}
      {levelTier && typeof level === "number" ? (
        <LinearGradient
          colors={levelTier.badgeColors}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[
            styles.levelBadge,
            {
              borderColor: levelTier.borderColor,
              bottom: badgeOffset,
              paddingHorizontal: badgePadH,
              right: badgeOffset,
            },
          ]}
        >
          <Text style={[styles.levelBadgeText, { fontSize: badgeFontSize }]}>
            Lv.{level}
          </Text>
        </LinearGradient>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
  },
  auraHalo: {
    elevation: 4,
    position: "absolute",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 12,
    zIndex: 1,
  },
  fallbackRing: {
    overflow: "hidden",
    position: "absolute",
    zIndex: 2,
  },
  avatarCore: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 3,
  },
  fallbackGrad: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  initialText: {
    fontWeight: "900",
  },
  ornateArtworkWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    zIndex: 5,
  },
  orbitLayer: {
    position: "absolute",
    zIndex: 8,
  },
  sparkDotLarge: {
    borderRadius: 99,
    elevation: 4,
    height: 7,
    position: "absolute",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    width: 7,
  },
  sparkDotMedium: {
    borderRadius: 99,
    elevation: 3,
    height: 5,
    position: "absolute",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 5,
    width: 5,
  },
  sparkDotSmall: {
    borderRadius: 99,
    height: 4,
    position: "absolute",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    width: 4,
  },
  risingFlare: {
    borderRadius: 99,
    elevation: 3,
    height: 6,
    position: "absolute",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    width: 6,
    zIndex: 8,
  },
  levelBadge: {
    borderRadius: 99,
    borderWidth: 1.5,
    elevation: 6,
    paddingVertical: 1.5,
    position: "absolute",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    zIndex: 20,
  },
  levelBadgeText: {
    color: "#FFFFFF",
    fontWeight: "900",
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
