import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/src/store/theme-store";
import { useResponsiveLayout } from "@/src/utils/responsive";

type SectionTitleProps = {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export default function SectionTitle({
  title,
  actionLabel,
  onActionPress,
}: SectionTitleProps) {
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const c = theme.colors;

  return (
    <View style={styles.row}>
      <Text numberOfLines={1} style={[styles.title, { color: c.text, fontSize: rf(18) }]}>
        {title}
      </Text>
      {actionLabel ? (
        <Pressable
          hitSlop={8}
          onPress={onActionPress}
          style={[styles.actionChip, { backgroundColor: c.primarySoft }]}
        >
          <Text style={[styles.action, { color: c.primaryDark, fontSize: rf(12) }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  actionChip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 6,
  },
  title: {
    flex: 1,
    fontWeight: "900",
    marginRight: 8,
    minWidth: 0,
  },
});
