import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import AppLogoBadge from "@/src/components/common/AppLogoBadge";
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
      <LinearGradient
        colors={
          c.isDark
            ? ["rgba(59, 130, 246, 0.16)", "rgba(30, 41, 59, 0.68)"]
            : ["rgba(59, 130, 246, 0.09)", "rgba(255, 255, 255, 0.96)"]
        }
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.brandCard, { borderColor: c.glassBorder }]}
      >
        <AppLogoBadge glowColor={c.primary} size={38} />
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
            <Pressable
              onPress={() => pushRoute("/user/subscription")}
              style={({ pressed }) => [
                styles.diamondChip,
                {
                  backgroundColor: c.isDark ? "rgba(56, 189, 248, 0.16)" : "rgba(14, 165, 233, 0.1)",
                },
                pressed ? { opacity: 0.78 } : null,
              ]}
            >
              <Text style={[styles.diamondText, { color: c.primaryDark }]}>
                💎 {(user?.diamonds ?? 50).toLocaleString("vi-VN")}
              </Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.navScrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.navScroll}
      >
        {NAV_GROUPS.map((group, groupIdx) => (
          <View
            key={group.title}
            style={[
              styles.navGroup,
              groupIdx > 0
                ? [styles.navGroupDivider, { borderTopColor: c.glassBorder }]
                : null,
            ]}
          >
            <Text style={[styles.groupTitle, { color: c.textMuted }]}>{group.title}</Text>
            {group.items.map((item) => {
              const active = item.matchPrefixes.some((p) => pathname.startsWith(p));
              return (
                <Pressable
                  key={item.route}
                  onPress={() => handleNavigate(item.route)}
                  style={({ pressed }) => [
                    styles.navItem,
                    active
                      ? [
                          styles.navItemActive,
                          {
                            backgroundColor: c.primarySoft,
                            borderColor: c.border,
                            shadowColor: c.primary,
                          },
                        ]
                      : null,
                    pressed ? { opacity: 0.82 } : null,
                  ]}
                >
                  <View
                    style={[
                      styles.activeBar,
                      { backgroundColor: active ? c.primary : "transparent" },
                    ]}
                  />
                  <View
                    style={[
                      styles.navIconTile,
                      {
                        backgroundColor: active
                          ? c.primary
                          : c.isDark
                            ? "rgba(255,255,255,0.06)"
                            : c.surfaceMuted,
                      },
                    ]}
                  >
                    <Ionicons
                      color={active ? "#FFFFFF" : c.textMuted}
                      name={item.icon}
                      size={15}
                    />
                  </View>
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
          <View style={[styles.navGroup, styles.navGroupDivider, { borderTopColor: c.glassBorder }]}>
            <Text style={[styles.groupTitle, { color: c.textMuted }]}>QUẢN TRỊ</Text>
            <Pressable
              onPress={() => pushRoute("/admin/dashboard")}
              style={({ pressed }) => [styles.navItem, pressed ? { opacity: 0.85 } : null]}
            >
              <View style={[styles.activeBar, { backgroundColor: "transparent" }]} />
              <View style={[styles.navIconTile, { backgroundColor: "rgba(2, 132, 199, 0.14)" }]}>
                <Ionicons color="#0284C7" name="shield-checkmark" size={15} />
              </View>
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
          style={({ pressed }) => [
            styles.userFooter,
            { backgroundColor: c.glassFillStrong, borderColor: c.glassBorder },
            pressed ? { opacity: 0.88 } : null,
          ]}
        >
          <UserAvatarWithFrame
            avatarUrl={user.avatarUrl}
            frameId={user.equippedFrameId}
            fullName={user.fullName || user.email}
            level={user.level ?? 1}
            showCornerBadge={false}
            size={38}
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
          <Ionicons color={c.textMuted} name="chevron-forward" size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    borderRightWidth: 1,
    gap: 10,
    height: "100%",
    maxHeight: "100%",
    minHeight: 0,
    overflow: "hidden",
    paddingBottom: 12,
    paddingHorizontal: 13,
    paddingTop: 12,
    width: 256,
  },
  brandCard: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
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
    marginTop: 4,
  },
  tierPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tierPillText: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  diamondChip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  diamondText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  navScroll: {
    flex: 1,
    minHeight: 0,
  },
  navScrollContent: {
    gap: 6,
    paddingBottom: 6,
  },
  navGroup: {
    gap: 2,
  },
  navGroupDivider: {
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 8,
  },
  groupTitle: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  navItem: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  navItemActive: {
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  activeBar: {
    borderRadius: 4,
    height: 18,
    width: 3,
  },
  navIconTile: {
    alignItems: "center",
    borderRadius: 8,
    height: 27,
    justifyContent: "center",
    width: 27,
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
    backgroundColor: "#F3E8FF",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  itemBadgeText: {
    color: "#7C3AED",
    fontSize: 9.5,
    fontWeight: "900",
  },
  userFooter: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
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
