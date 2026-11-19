import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Provides fluid layout metrics calibrated across phone aspect ratios
 * (compact 16:9, standard 19.5:9, tall 20:9/21:9, and tablets >= 680dp).
 */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const safeWidth = Math.max(width, 320);
    const safeHeight = Math.max(height, 480);
    const aspectRatio = safeHeight / safeWidth;

    const isNarrow = safeWidth < 365;
    const isCompact = safeWidth < 395;
    const isTablet = safeWidth >= 680;
    const isShort = safeHeight < 700;
    const isTall = aspectRatio >= 2.05;

    const screenPadding = isNarrow ? 14 : isTablet ? 28 : 18;
    const cardPadding = isNarrow ? 14 : isTablet ? 20 : 16;
    const sectionGap = isNarrow ? 12 : 16;
    const maxContentWidth = isTablet ? 620 : undefined;
    const usableContentWidth = Math.min(safeWidth, maxContentWidth ?? safeWidth) - screenPadding * 2;

    const dockHeight = isNarrow ? 62 : 68;
    const dockBottom = Math.max(insets.bottom, 10);
    const dockClearance = dockHeight + dockBottom + 18;
    const pageBottomClearance = Math.max(insets.bottom, 16) + 22;

    const fontScale = Math.max(0.9, Math.min(safeWidth / 390, 1.07));
    const rf = (size: number) => Math.round(size * fontScale * 2) / 2;

    const gridItemWidth = (columns: number, gap: number, insideCard = false) => {
      const containerW = insideCard
        ? usableContentWidth - cardPadding * 2
        : usableContentWidth;
      return Math.max(40, Math.floor((containerW - gap * (columns - 1)) / columns));
    };

    return {
      width: safeWidth,
      height: safeHeight,
      insets,
      aspectRatio,
      isNarrow,
      isCompact,
      isTablet,
      isShort,
      isTall,
      screenPadding,
      cardPadding,
      sectionGap,
      maxContentWidth,
      usableContentWidth,
      dockHeight,
      dockBottom,
      dockClearance,
      pageBottomClearance,
      rf,
      gridItemWidth,
    };
  }, [height, insets, width]);
}
