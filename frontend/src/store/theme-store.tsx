import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

export type ThemePresetId =
  | "lavender"
  | "emerald"
  | "coral"
  | "sapphire"
  | "rose"
  | "obsidian";

export type AccentSwatchId =
  | "preset"
  | "lavender"
  | "emerald"
  | "coral"
  | "sapphire"
  | "rose"
  | "amber"
  | "cyan";

export type LiquidThemeColors = {
  isDark: boolean;
  background: string;
  backgroundStrong: string;
  backgroundGradient: readonly [string, string, string];
  surface: string;
  surfaceDisabled: string;
  surfaceAlt: string;
  surfaceMuted: string;
  glassFill: string;
  glassFillStrong: string;
  glassBorder: string;
  glassInnerHighlight: string;
  glassEdgeWarm: string;
  glassEdgeCool: string;
  primary: string;
  primaryGradient: readonly [string, string, string];
  primaryDark: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  accentGradient: readonly [string, string];
  text: string;
  textMuted: string;
  onPrimary: string;
  border: string;
  borderStrong: string;
  success: string;
  danger: string;
  shadow: string;
  orbPrimary: string;
  orbSecondary: string;
  orbAccent: string;
  heroSurface: string;
  heroBorder: string;
  heroText: string;
  heroTextMuted: string;
  tabBarBg: string;
};

export type ThemePreset = {
  id: ThemePresetId;
  name: string;
  subtitle: string;
  previewStops: readonly [string, string];
  colors: LiquidThemeColors;
};

export type AccentSwatch = {
  id: AccentSwatchId;
  label: string;
  primary: string;
  gradient: readonly [string, string, string];
  primarySoft: string;
};

export const ACCENT_SWATCHES: AccentSwatch[] = [
  {
    id: "preset",
    label: "Mặc định",
    primary: "#7160F2",
    gradient: ["#9488FF", "#7160F2", "#5948DB"],
    primarySoft: "#EDE9FE",
  },
  {
    id: "lavender",
    label: "Tím Clay",
    primary: "#7160F2",
    gradient: ["#9488FF", "#7160F2", "#5948DB"],
    primarySoft: "#EDE9FE",
  },
  {
    id: "emerald",
    label: "Ngọc Bạc Hà",
    primary: "#2CB8A8",
    gradient: ["#5CD6C8", "#2CB8A8", "#1B9486"],
    primarySoft: "#D6F6F2",
  },
  {
    id: "coral",
    label: "Cam San Hô",
    primary: "#FF6F47",
    gradient: ["#FF9572", "#FF6F47", "#E4522A"],
    primarySoft: "#FFE3DA",
  },
  {
    id: "sapphire",
    label: "Xanh Da Trời",
    primary: "#3D8BFF",
    gradient: ["#6EB0FF", "#3D8BFF", "#1F6BE3"],
    primarySoft: "#DCEAFF",
  },
  {
    id: "rose",
    label: "Hồng Pastel",
    primary: "#F04E8A",
    gradient: ["#FF7EAE", "#F04E8A", "#CF2F6B"],
    primarySoft: "#FFE0EC",
  },
  {
    id: "amber",
    label: "Vàng Nắng",
    primary: "#F59E0B",
    gradient: ["#FBBF24", "#F59E0B", "#D97706"],
    primarySoft: "#FEF3C7",
  },
  {
    id: "cyan",
    label: "Xanh Băng",
    primary: "#06B6D4",
    gradient: ["#38DFFA", "#06B6D4", "#0891B2"],
    primarySoft: "#CFFAFE",
  },
];

export const LIQUID_THEME_PRESETS: ThemePreset[] = [
  {
    id: "lavender",
    name: "Lavender Clay",
    subtitle: "Phong cách 3D tím pastel & trắng sữa",
    previewStops: ["#9488FF", "#7160F2"],
    colors: {
      isDark: false,
      background: "#F5F4FF",
      backgroundStrong: "#ECEAFD",
      backgroundGradient: ["#F8F7FF", "#F2F0FE", "#FBFBFF"],
      surface: "#FFFFFF",
      surfaceDisabled: "#E2E0F2",
      surfaceAlt: "#F5F3FF",
      surfaceMuted: "#ECEAF8",
      glassFill: "#FFFFFF",
      glassFillStrong: "#F7F6FF",
      glassBorder: "rgba(255, 255, 255, 0.92)",
      glassInnerHighlight: "#FFFFFF",
      glassEdgeWarm: "rgba(255, 184, 92, 0.16)",
      glassEdgeCool: "rgba(113, 96, 242, 0.14)",
      primary: "#7160F2",
      primaryGradient: ["#9488FF", "#7160F2", "#5948DB"],
      primaryDark: "#3F32A8",
      primarySoft: "#EDE9FE",
      accent: "#36B8AA",
      accentSoft: "#DCF7F3",
      accentGradient: ["#59D3C5", "#2EA89B"],
      text: "#1E1B3A",
      textMuted: "#6E6A8E",
      onPrimary: "#FFFFFF",
      border: "#EAE7F8",
      borderStrong: "#D6D0F2",
      success: "#16A374",
      danger: "#EA4359",
      shadow: "#5B4BE0",
      orbPrimary: "rgba(148, 136, 255, 0.14)",
      orbSecondary: "rgba(89, 211, 197, 0.13)",
      orbAccent: "rgba(255, 194, 102, 0.12)",
      heroSurface: "#7464F0",
      heroBorder: "rgba(255, 255, 255, 0.36)",
      heroText: "#FFFFFF",
      heroTextMuted: "rgba(255, 255, 255, 0.88)",
      tabBarBg: "#FFFFFF",
    },
  },
  {
    id: "emerald",
    name: "Mint Clay",
    subtitle: "Kẹo bạc hà tươi sáng & tím nhấn",
    previewStops: ["#5CD6C8", "#2CB8A8"],
    colors: {
      isDark: false,
      background: "#F2FAF8",
      backgroundStrong: "#E4F4F0",
      backgroundGradient: ["#F6FCFB", "#EAF7F4", "#F8FCFF"],
      surface: "#FFFFFF",
      surfaceDisabled: "#D9EBE7",
      surfaceAlt: "#F0FAF8",
      surfaceMuted: "#E4F2EE",
      glassFill: "#FFFFFF",
      glassFillStrong: "#F3FBF9",
      glassBorder: "#DCF0EB",
      glassInnerHighlight: "#FFFFFF",
      glassEdgeWarm: "rgba(255, 178, 102, 0.14)",
      glassEdgeCool: "rgba(44, 184, 168, 0.16)",
      primary: "#2CB8A8",
      primaryGradient: ["#5CD6C8", "#2CB8A8", "#1A9688"],
      primaryDark: "#146B61",
      primarySoft: "#D9F6F2",
      accent: "#7160F2",
      accentSoft: "#ECE9FE",
      accentGradient: ["#9488FF", "#6B5AE8"],
      text: "#152B28",
      textMuted: "#587470",
      onPrimary: "#FFFFFF",
      border: "#DEF0EB",
      borderStrong: "#BAE0D7",
      success: "#129C6E",
      danger: "#EA4359",
      shadow: "rgba(26, 120, 108, 0.13)",
      orbPrimary: "rgba(44, 184, 168, 0.14)",
      orbSecondary: "rgba(113, 96, 242, 0.11)",
      orbAccent: "rgba(255, 194, 102, 0.12)",
      heroSurface: "#2CB8A8",
      heroBorder: "rgba(255, 255, 255, 0.36)",
      heroText: "#FFFFFF",
      heroTextMuted: "rgba(255, 255, 255, 0.90)",
      tabBarBg: "#FFFFFF",
    },
  },
  {
    id: "coral",
    name: "Peach Coral",
    subtitle: "Cam đào ấm áp & tươi vui",
    previewStops: ["#FF9572", "#FF6F47"],
    colors: {
      isDark: false,
      background: "#FFF7F4",
      backgroundStrong: "#FCECE6",
      backgroundGradient: ["#FFF9F6", "#FDF0EA", "#FFF8FA"],
      surface: "#FFFFFF",
      surfaceDisabled: "#F0DFD8",
      surfaceAlt: "#FFF4EF",
      surfaceMuted: "#F9EAE3",
      glassFill: "#FFFFFF",
      glassFillStrong: "#FFF8F5",
      glassBorder: "#F7E4DC",
      glassInnerHighlight: "#FFFFFF",
      glassEdgeWarm: "rgba(255, 111, 71, 0.16)",
      glassEdgeCool: "rgba(113, 96, 242, 0.12)",
      primary: "#FF6F47",
      primaryGradient: ["#FF9572", "#FF6F47", "#E4522A"],
      primaryDark: "#A93414",
      primarySoft: "#FFE4DA",
      accent: "#2CB8A8",
      accentSoft: "#D9F6F2",
      accentGradient: ["#5CD6C8", "#2CB8A8"],
      text: "#2C1814",
      textMuted: "#7C6059",
      onPrimary: "#FFFFFF",
      border: "#F6E4DC",
      borderStrong: "#ECC8B9",
      success: "#16A374",
      danger: "#DC3545",
      shadow: "rgba(196, 86, 52, 0.13)",
      orbPrimary: "rgba(255, 111, 71, 0.13)",
      orbSecondary: "rgba(44, 184, 168, 0.12)",
      orbAccent: "rgba(255, 194, 102, 0.14)",
      heroSurface: "#FF7650",
      heroBorder: "rgba(255, 255, 255, 0.36)",
      heroText: "#FFFFFF",
      heroTextMuted: "rgba(255, 255, 255, 0.90)",
      tabBarBg: "#FFFFFF",
    },
  },
  {
    id: "sapphire",
    name: "Sky Pastel",
    subtitle: "Xanh bầu trời nhẹ nhàng dễ tập trung",
    previewStops: ["#6EB0FF", "#3D8BFF"],
    colors: {
      isDark: false,
      background: "#F3F7FF",
      backgroundStrong: "#E6EEFC",
      backgroundGradient: ["#F7FAFF", "#ECF2FE", "#F7F8FF"],
      surface: "#FFFFFF",
      surfaceDisabled: "#DCE4F3",
      surfaceAlt: "#F2F6FF",
      surfaceMuted: "#E7EEFC",
      glassFill: "#FFFFFF",
      glassFillStrong: "#F5F8FF",
      glassBorder: "#E1E9FA",
      glassInnerHighlight: "#FFFFFF",
      glassEdgeWarm: "rgba(255, 184, 92, 0.14)",
      glassEdgeCool: "rgba(61, 139, 255, 0.16)",
      primary: "#3D8BFF",
      primaryGradient: ["#6EB0FF", "#3D8BFF", "#1F6BE3"],
      primaryDark: "#15499E",
      primarySoft: "#DEEAFE",
      accent: "#7160F2",
      accentSoft: "#EDE9FE",
      accentGradient: ["#9488FF", "#6B5AE8"],
      text: "#142038",
      textMuted: "#5B6B8A",
      onPrimary: "#FFFFFF",
      border: "#E1E9F9",
      borderStrong: "#C3D5F5",
      success: "#16A374",
      danger: "#EA4359",
      shadow: "rgba(42, 92, 184, 0.13)",
      orbPrimary: "rgba(61, 139, 255, 0.14)",
      orbSecondary: "rgba(113, 96, 242, 0.12)",
      orbAccent: "rgba(44, 184, 168, 0.12)",
      heroSurface: "#3D8BFF",
      heroBorder: "rgba(255, 255, 255, 0.36)",
      heroText: "#FFFFFF",
      heroTextMuted: "rgba(255, 255, 255, 0.90)",
      tabBarBg: "#FFFFFF",
    },
  },
  {
    id: "rose",
    name: "Rose Candy",
    subtitle: "Hồng pastel ngọt ngào hiện đại",
    previewStops: ["#FF7EAE", "#F04E8A"],
    colors: {
      isDark: false,
      background: "#FFF5F9",
      backgroundStrong: "#FCE8F0",
      backgroundGradient: ["#FFF8FB", "#FBECF3", "#FAF5FF"],
      surface: "#FFFFFF",
      surfaceDisabled: "#EEDCE4",
      surfaceAlt: "#FFF2F7",
      surfaceMuted: "#F8E5EE",
      glassFill: "#FFFFFF",
      glassFillStrong: "#FFF7FA",
      glassBorder: "#F6DFEA",
      glassInnerHighlight: "#FFFFFF",
      glassEdgeWarm: "rgba(240, 78, 138, 0.15)",
      glassEdgeCool: "rgba(113, 96, 242, 0.13)",
      primary: "#F04E8A",
      primaryGradient: ["#FF7EAE", "#F04E8A", "#CF2F6B"],
      primaryDark: "#9E194D",
      primarySoft: "#FFE0EC",
      accent: "#7160F2",
      accentSoft: "#EDE9FE",
      accentGradient: ["#9488FF", "#6B5AE8"],
      text: "#2B1220",
      textMuted: "#7A586A",
      onPrimary: "#FFFFFF",
      border: "#F5DFEA",
      borderStrong: "#EBBFD3",
      success: "#16A374",
      danger: "#DC3545",
      shadow: "rgba(182, 46, 102, 0.12)",
      orbPrimary: "rgba(240, 78, 138, 0.13)",
      orbSecondary: "rgba(113, 96, 242, 0.12)",
      orbAccent: "rgba(255, 194, 102, 0.12)",
      heroSurface: "#F04E8A",
      heroBorder: "rgba(255, 255, 255, 0.36)",
      heroText: "#FFFFFF",
      heroTextMuted: "rgba(255, 255, 255, 0.90)",
      tabBarBg: "#FFFFFF",
    },
  },
  {
    id: "obsidian",
    name: "Night Indigo",
    subtitle: "Chế độ tối dịu mắt với điểm nhấn tím",
    previewStops: ["#8E7FFF", "#5443D8"],
    colors: {
      isDark: true,
      background: "#121329",
      backgroundStrong: "#191B38",
      backgroundGradient: ["#111226", "#181A36", "#13152C"],
      surface: "#1E2144",
      surfaceDisabled: "#2C305B",
      surfaceAlt: "#23264E",
      surfaceMuted: "#262954",
      glassFill: "#1E2144",
      glassFillStrong: "#252952",
      glassBorder: "rgba(255, 255, 255, 0.12)",
      glassInnerHighlight: "rgba(255, 255, 255, 0.16)",
      glassEdgeWarm: "rgba(255, 184, 92, 0.16)",
      glassEdgeCool: "rgba(142, 127, 255, 0.22)",
      primary: "#8A7BFF",
      primaryGradient: ["#A99DFF", "#8A7BFF", "#6858E6"],
      primaryDark: "#DED9FF",
      primarySoft: "rgba(138, 123, 255, 0.22)",
      accent: "#36C9B8",
      accentSoft: "rgba(54, 201, 184, 0.18)",
      accentGradient: ["#5CE0D1", "#2EA89B"],
      text: "#F5F4FF",
      textMuted: "#ABA7CF",
      onPrimary: "#FFFFFF",
      border: "rgba(255, 255, 255, 0.12)",
      borderStrong: "rgba(255, 255, 255, 0.22)",
      success: "#34D399",
      danger: "#FB7185",
      shadow: "rgba(0, 0, 12, 0.45)",
      orbPrimary: "rgba(138, 123, 255, 0.22)",
      orbSecondary: "rgba(54, 201, 184, 0.16)",
      orbAccent: "rgba(255, 194, 102, 0.14)",
      heroSurface: "#5D4CE0",
      heroBorder: "rgba(255, 255, 255, 0.24)",
      heroText: "#FFFFFF",
      heroTextMuted: "rgba(242, 240, 255, 0.88)",
      tabBarBg: "#1A1C3C",
    },
  },
];

type ThemeStoragePayload = {
  presetId: ThemePresetId;
  accentId: AccentSwatchId;
  prismaticGlow: boolean;
};

const STORAGE_KEY = "toeic_trainer_clay_theme_v2";

type ThemeContextValue = {
  presetId: ThemePresetId;
  accentId: AccentSwatchId;
  prismaticGlow: boolean;
  theme: ThemePreset;
  setPresetId: (id: ThemePresetId) => void;
  setAccentId: (id: AccentSwatchId) => void;
  setPrismaticGlow: (enabled: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function persistSettings(payload: ThemeStoragePayload) {
  const serialized = JSON.stringify(payload);
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
    await AsyncStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Non-fatal if storage unavailable
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [presetId, setPresetIdState] = useState<ThemePresetId>("lavender");
  const [accentId, setAccentIdState] = useState<AccentSwatchId>("preset");
  const [prismaticGlow, setPrismaticGlowState] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const raw =
          Platform.OS === "web" && typeof localStorage !== "undefined"
            ? localStorage.getItem(STORAGE_KEY)
            : await AsyncStorage.getItem(STORAGE_KEY);
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<ThemeStoragePayload>;
        if (parsed.presetId && LIQUID_THEME_PRESETS.some((p) => p.id === parsed.presetId)) {
          setPresetIdState(parsed.presetId);
        }
        if (parsed.accentId && ACCENT_SWATCHES.some((s) => s.id === parsed.accentId)) {
          setAccentIdState(parsed.accentId);
        }
        if (typeof parsed.prismaticGlow === "boolean") {
          setPrismaticGlowState(parsed.prismaticGlow);
        }
      } catch {
        // Ignore corrupt preference cache
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const setPresetId = useCallback(
    (next: ThemePresetId) => {
      setPresetIdState(next);
      void persistSettings({ presetId: next, accentId, prismaticGlow });
    },
    [accentId, prismaticGlow],
  );

  const setAccentId = useCallback(
    (next: AccentSwatchId) => {
      setAccentIdState(next);
      void persistSettings({ presetId, accentId: next, prismaticGlow });
    },
    [presetId, prismaticGlow],
  );

  const setPrismaticGlow = useCallback(
    (next: boolean) => {
      setPrismaticGlowState(next);
      void persistSettings({ presetId, accentId, prismaticGlow: next });
    },
    [accentId, presetId],
  );

  const theme = useMemo<ThemePreset>(() => {
    const base = LIQUID_THEME_PRESETS.find((p) => p.id === presetId) ?? LIQUID_THEME_PRESETS[0];
    if (accentId === "preset") {
      return base;
    }
    const swatch = ACCENT_SWATCHES.find((s) => s.id === accentId);
    if (!swatch) return base;
    return {
      ...base,
      previewStops: [swatch.gradient[0], swatch.gradient[1]],
      colors: {
        ...base.colors,
        primary: swatch.primary,
        primaryGradient: swatch.gradient,
        primarySoft: base.colors.isDark ? `${swatch.primary}38` : swatch.primarySoft,
        heroSurface: swatch.primary,
      },
    };
  }, [accentId, presetId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      presetId,
      accentId,
      prismaticGlow,
      theme,
      setPresetId,
      setAccentId,
      setPrismaticGlow,
    }),
    [accentId, presetId, prismaticGlow, setAccentId, setPresetId, setPrismaticGlow, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      presetId: "lavender" as ThemePresetId,
      accentId: "preset" as AccentSwatchId,
      prismaticGlow: true,
      theme: LIQUID_THEME_PRESETS[0],
      setPresetId: () => undefined,
      setAccentId: () => undefined,
      setPrismaticGlow: () => undefined,
    };
  }
  return ctx;
}

export function useThemedStyles<T>(factory: (colors: LiquidThemeColors) => T): T {
  const { theme } = useAppTheme();
  return useMemo(() => factory(theme.colors), [factory, theme.colors]);
}
