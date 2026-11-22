import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import VerifiedBadge from "@/src/components/common/VerifiedBadge";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import { useAuth } from "@/src/hooks/use-auth";
import { useAppTheme } from "@/src/store/theme-store";
import { pushRoute, replaceRoute } from "@/src/utils/navigation";

type NavItem = {
  label: string;
  route: string;
  matchPrefixes: string[];
  icon: keyof typeof Ionicons.glyphMap;
  badgeText?: string;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "CHÍNH",
    items: [
      { label: "Trang chủ", route: "/user/home", matchPrefixes: ["/user/home"], icon: "home" },
      {
        label: "Lộ trình TOEIC",
        route: "/user/practice",
        matchPrefixes: ["/user/practice", "/user/roadmap", "/user/onboarding", "/user/practice-module"],
        icon: "school",
      },
      { label: "Từ vựng & SM-2", route: "/user/cards", matchPrefixes: ["/user/cards"], icon: "albums" },
      {
        label: "Thi thử TOEIC",
        route: "/user/test",
        matchPrefixes: ["/user/test", "/user/attempt-review"],
        icon: "trophy",
      },
      { label: "Ngữ pháp", route: "/user/grammar", matchPrefixes: ["/user/grammar"], icon: "library" },
    ],
  },
  {
    title: "CÔNG CỤ AI",
    items: [
      {
        label: "Thư viện Video AI",
        route: "/user/youtube-studio",
        matchPrefixes: ["/user/youtube-studio"],
        icon: "logo-youtube",
      },
      {
        label: "Đề từ Tài liệu",
        route: "/user/document-exam",
        matchPrefixes: ["/user/document-exam"],
        icon: "document-text",
      },
      {
        label: "Từ điển & Camera AI",
        route: "/user/dictionary",
        matchPrefixes: ["/user/dictionary"],
        icon: "camera",
      },
      {
        label: "Ngân hàng câu sai",
        route: "/user/mistakes",
        matchPrefixes: ["/user/mistakes"],
        icon: "alert-circle",
      },
      {
        label: "Đấu trường 1v1",
        route: "/user/arena",
        matchPrefixes: ["/user/arena"],
        icon: "flash",
      },
    ],
  },
  {
    title: "TÀI KHOẢN",
    items: [
      {
        label: "Bảng xếp hạng",
        route: "/user/leaderboard",
        matchPrefixes: ["/user/leaderboard"],
        icon: "podium",
      },
      { label: "Cửa hàng Avatar", route: "/user/shop", matchPrefixes: ["/user/shop"], icon: "bag-handle" },
      {
        label: "Gói PLUS & PRO",
        route: "/user/subscription",
        matchPrefixes: ["/user/subscription"],
        icon: "sparkles",
        badgeText: "VIP",
      },
      { label: "Hồ sơ & Cài đặt", route: "/user/profile", matchPrefixes: ["/user/profile"], icon: "person" },
    ],
  },
];

export default function WebDesktopSidebar() {
  const pathname = usePathname();
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const c = theme.colors;

  const user = auth.user;
  const planTier = (user?.planTier ?? (user?.premium ? "PRO" : "FREE")).toUpperCase();
  const isAdmin =
    user?.role?.toUpperCase() === "ADMIN" || user?.role?.toUpperCase() === "CONTENT_MANAGER";

  const handleNavigate = (route: string) => {
    if (pathname === route) return;
    if (
      route === "/user/home" ||
      route === "/user/practice" ||
      route === "/user/cards" ||
      route === "/user/test" ||
      route === "/user/profile"
    ) {
      replaceRoute(route as never);
    } else {
      pushRoute(route as never);
    }
  };

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: c.tabBarBg,
          borderRightColor: c.glassBorder,
        },
      ]}
    >
      <View style={styles.brandBox}>
        <View style={[styles.brandIcon, { backgroundColor: c.primary }]}>
          <Ionicons color="#FFFFFF" name="school" size={18} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.brandTitle, { color: c.text }]}>
            TOEIC TRAINER
          </Text>
          <View style={styles.brandSubRow}>
            <View
              style={[
                styles.tierPill,
                {
                  backgroundColor:
                    planTier === "PRO" ? "#7C3AED" : planTier === "PLUS" ? "#0D9488" : c.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[
                  styles.tierPillText,
                  { color: planTier === "FREE" ? c.textMuted : "#FFFFFF" },
                ]}
              >
                {planTier}
              </Text>
            </View>
            <Text style={[styles.diamondText, { color: c.primaryDark }]}>
              💎 {(user?.diamonds ?? 50).toLocaleString("vi-VN")}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.navScrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.navScroll}
      >
        {NAV_GROUPS.map((group) => (
          <View key={group.title} style={styles.navGroup}>
            <Text style={[styles.groupTitle, { color: c.textMuted }]}>{group.title}</Text>
            {group.items.map((item) => {
              const active = item.matchPrefixes.some((p) => pathname.startsWith(p));
              return (
                <Pressable
                  key={item.route}
                  onPress={() => handleNavigate(item.route)}
                  style={({ pressed }) => [
                    styles.navItem,
                    active ? { backgroundColor: c.primarySoft, borderColor: c.border } : null,
                    pressed ? { opacity: 0.85 } : null,
                  ]}
                >
                  <Ionicons
                    color={active ? c.primary : c.textMuted}
                    name={item.icon}
                    size={17}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.navLabel,
                      { color: active ? c.primaryDark : c.text },
                      active ? styles.navLabelActive : null,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.badgeText ? (
                    <View style={styles.itemBadge}>
                      <Text style={styles.itemBadgeText}>{item.badgeText}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        {isAdmin ? (
          <View style={styles.navGroup}>
            <Text style={[styles.groupTitle, { color: c.textMuted }]}>QUẢN TRỊ</Text>
            <Pressable
              onPress={() => pushRoute("/admin/dashboard")}
              style={({ pressed }) => [styles.navItem, pressed ? { opacity: 0.85 } : null]}
            >
              <Ionicons color="#0284C7" name="shield-checkmark" size={17} />
              <Text numberOfLines={1} style={[styles.navLabel, { color: c.text }]}>
                Cổng Quản trị Admin
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {user ? (
        <Pressable
          onPress={() => handleNavigate("/user/profile")}
          style={[
            styles.userFooter,
            { backgroundColor: c.glassFillStrong, borderColor: c.glassBorder },
          ]}
        >
          <UserAvatarWithFrame
            avatarUrl={user.avatarUrl}
            frameId={user.equippedFrameId}
            fullName={user.fullName || user.email}
            level={user.level ?? 1}
            showCornerBadge={false}
            size={36}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
              <Text numberOfLines={1} style={[styles.userName, { color: c.text }]}>
                {user.fullName}
              </Text>
              <VerifiedBadge size={13} verified={user.verified} />
            </View>
            <Text numberOfLines={1} style={[styles.userMeta, { color: c.textMuted }]}>
              Lv.{user.level ?? 1} • Mục tiêu {user.targetScore || 500}+
            </Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    borderRightWidth: 1,
    gap: 10,
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingTop: 18,
    width: 244,
  },
  brandBox: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  brandIcon: {
    alignItems: "center",
    borderRadius: 12,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  brandTitle: {
    fontSize: 13.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  brandSubRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  tierPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  tierPillText: {
    fontSize: 9.5,
    fontWeight: "900",
  },
  diamondText: {
    fontSize: 11,
    fontWeight: "800",
  },
  navScroll: {
    flex: 1,
  },
  navScrollContent: {
    gap: 14,
    paddingBottom: 12,
  },
  navGroup: {
    gap: 3,
  },
  groupTitle: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: 4,
    paddingHorizontal: 10,
  },
  navItem: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  navLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  navLabelActive: {
    fontWeight: "800",
  },
  itemBadge: {
    backgroundColor: "#EDE9FE",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  itemBadgeText: {
    color: "#6D28D9",
    fontSize: 9.5,
    fontWeight: "900",
  },
  userFooter: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 9,
  },
  userName: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "800",
  },
  userMeta: {
    fontSize: 11,
    fontWeight: "600",
  },
});
