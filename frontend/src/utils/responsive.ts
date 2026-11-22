import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ResponsiveLayoutOptions = {
  hideDesktopSidebar?: boolean;
};

/**
 * Provides fluid layout metrics calibrated across phone aspect ratios
 * (compact 16:9, standard 19.5:9, tall 20:9/21:9, tablets >= 680dp, and desktop web >= 1024px).
 */
export function useResponsiveLayout(options?: ResponsiveLayoutOptions) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hideDesktopSidebar = Boolean(options?.hideDesktopSidebar);

  return useMemo(() => {
    const safeWidth = Math.max(width, 320);
    const safeHeight = Math.max(height, 480);
    const aspectRatio = safeHeight / safeWidth;

    const isNarrow = safeWidth < 365;
    const isCompact = safeWidth < 395;
    const isTablet = safeWidth >= 680;
    const isDesktopWeb = Platform.OS === "web" && safeWidth >= 1024;
    const isShort = safeHeight < 700;
    const isTall = aspectRatio >= 2.05;

    const webSidebarWidth = isDesktopWeb && !hideDesktopSidebar ? 244 : 0;
    const screenPadding = isNarrow ? 14 : isDesktopWeb ? 28 : isTablet ? 28 : 18;
    const cardPadding = isNarrow ? 14 : isTablet ? 20 : 16;
    const sectionGap = isNarrow ? 12 : 16;
    const maxContentWidth = isDesktopWeb
      ? hideDesktopSidebar
        ? 1240
        : 1120
      : isTablet
        ? 620
        : undefined;
    const availableViewportWidth = Math.max(320, safeWidth - webSidebarWidth);
    const usableContentWidth =
      Math.min(availableViewportWidth, maxContentWidth ?? availableViewportWidth) -
      screenPadding * 2;

    const dockHeight = isNarrow ? 62 : 68;
    const dockBottom = Math.max(insets.bottom, 10);
    const dockClearance = isDesktopWeb ? 28 : dockHeight + dockBottom + 18;
    const pageBottomClearance = isDesktopWeb ? 28 : Math.max(insets.bottom, 16) + 22;

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
      isDesktopWeb,
      webSidebarWidth,
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
  }, [height, hideDesktopSidebar, insets, width]);
}
