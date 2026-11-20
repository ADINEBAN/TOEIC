import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing } from "@/src/assets/styles/theme";
import { AdminSidebarItem } from "@/src/types/admin";

type AdminSidebarProps = {
  activeItemId: string;
  items: AdminSidebarItem[];
  onSelect: (id: string) => void;
};

export default function AdminSidebar({
  activeItemId,
  items,
  onSelect,
}: AdminSidebarProps) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarEyebrow}>Danh mục</Text>
        <Text style={styles.sidebarTitle}>Quản trị hệ thống</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {items.map((item) => {
            const active = item.id === activeItemId;

            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item.id)}
                style={({ pressed }) => [
                  styles.item,
                  active ? styles.itemActive : null,
                  pressed && !active ? styles.itemPressed : null,
                ]}
              >
                {active ? <View style={styles.activeRail} /> : null}
                <View
                  style={[styles.iconWrap, active ? styles.iconWrapActive : null]}
                >
                  <Ionicons
                    color={active ? colors.onPrimary : colors.textMuted}
                    name={item.icon as keyof typeof Ionicons.glyphMap}
                    size={17}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.label, active ? styles.labelActive : null]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  activeRail: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    bottom: 8,
    left: 0,
    position: "absolute",
    top: 8,
    width: 3,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  iconWrapActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  item: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  itemActive: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BFDBFE",
  },
  itemPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  label: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.primaryDark,
    fontWeight: "800",
  },
  list: {
    gap: 4,
  },
  sidebar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 256,
    minWidth: 236,
    padding: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  sidebarEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sidebarHeader: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    marginBottom: 10,
    paddingBottom: 12,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  sidebarTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
});
