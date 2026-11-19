import { ReactNode } from "react";
import { StyleProp, ViewStyle } from "react-native";

import { LiquidCard } from "@/src/components/ui/LiquidGlass";

export default function SurfaceCard({
  children,
  style,
  hero = false,
  padding = "md",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  hero?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}) {
  return (
    <LiquidCard hero={hero} padding={padding} style={style}>
      {children}
    </LiquidCard>
  );
}
