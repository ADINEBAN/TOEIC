import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import AppHeader from "@/src/components/user/AppHeader";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  equipCosmeticItem,
  getCosmeticShop,
  getMyProfile,
  purchaseCosmeticItem,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { CosmeticCatalogItem, CosmeticShopData } from "@/src/types/user-api";
import { safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

type FilterTab = "ALL" | "ANIMATED" | "STATIC" | "AVATAR" | "OWNED";

const RARITY_STYLES: Record<string, { bg: string; text: string }> = {
  COMMON: { bg: "#64748B", text: "#FFFFFF" },
  RARE: { bg: "#3B82F6", text: "#FFFFFF" },
  EPIC: { bg: "#8B5CF6", text: "#FFFFFF" },
  LEGENDARY: { bg: "#F59E0B", text: "#FFFFFF" },
};

export default function ShopScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shop, setShop] = useState<CosmeticShopData | null>(null);

  const cardWidth = gridItemWidth(2, 10);

  const loadShop = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setLoading(true);
      const res = await getCosmeticShop(auth.accessToken);
      if (res.data) setShop(res.data);
    } catch {
      // ignore transient error
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useFocusEffect(
    useCallback(() => {
      void loadShop();
    }, [loadShop]),
  );

  const syncUserFromServer = async () => {
    if (!auth.accessToken) return;
    try {
      const me = await getMyProfile(auth.accessToken);
      if (me.data) updateUserProfile(me.data);
    } catch {
      // ignore
    }
  };

  const handleAction = async (item: CosmeticCatalogItem) => {
    if (!auth.accessToken || busyId) return;
    try {
      setBusyId(item.id);
      if (item.equipped) {
        const res = await equipCosmeticItem(
          auth.accessToken,
          null,
          item.category === "AVATAR" ? "AVATAR" : "FRAME",
        );
        if (res.data) setShop(res.data);
        await syncUserFromServer();
        return;
      }
      if (item.owned) {
        const res = await equipCosmeticItem(
          auth.accessToken,
          item.id,
          item.category === "AVATAR" ? "AVATAR" : "FRAME",
        );
        if (res.data) setShop(res.data);
        await syncUserFromServer();
        return;
      }

      if ((shop?.myDiamonds ?? 0) < item.priceDiamonds) {
        Alert.alert(
          "Chưa đủ kim cương",
          `Bạn cần ${item.priceDiamonds} 💎 (hiện có ${shop?.myDiamonds ?? 0} 💎). Hãy học bài, làm đề hoặc thi Solo để nhận thêm kim cương nhé!`,
        );
        return;
      }

      const res = await purchaseCosmeticItem(auth.accessToken, item.id);
      if (res.data) setShop(res.data);
      await syncUserFromServer();
      Alert.alert("Mua thành công!", `Đã mở khóa và trang bị "${item.name}".`);
    } catch (err) {
      Alert.alert("Cửa hàng", err instanceof Error ? err.message : "Thao tác thất bại.");
    } finally {
      setBusyId(null);
    }
  };

  const filteredItems = useMemo(() => {
    const items = shop?.items ?? [];
    return items.filter((it) => {
      if (filter === "OWNED") return it.owned;
      if (filter === "AVATAR") return it.category === "AVATAR";
      if (filter === "ANIMATED") return it.category === "FRAME" && it.animationType === "ANIMATED";
      if (filter === "STATIC") return it.category === "FRAME" && it.animationType === "STATIC";
      return true;
    });
  }, [filter, shop?.items]);

  return (
    <UserScreen>
      <AppHeader
        onLeftPress={() => safeBack("/user/profile")}
        title="Cửa hàng"
        rightSlot={
          <View style={styles.diamondPill}>
            <Text style={styles.diamondPillText}>💎 {shop?.myDiamonds ?? auth.user?.diamonds ?? 50}</Text>
          </View>
        }
      />

      {/* Filter Pills */}
      <ScrollView
        contentContainerStyle={styles.filterRow}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: 12 }}
      >
        {(
          [
            { key: "ALL", label: "Tất cả" },
            { key: "ANIMATED", label: "Khung Động ✨" },
            { key: "STATIC", label: "Khung Tĩnh" },
            { key: "AVATAR", label: "Avatar 3D" },
            { key: "OWNED", label: "Đã sở hữu" },
          ] as { key: FilterTab; label: string }[]
        ).map((t) => {
          const active = filter === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setFilter(t.key)}
              style={[styles.filterPill, active ? styles.filterPillActive : null]}
            >
              <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && !shop ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : filteredItems.length === 0 ? (
        <SurfaceCard style={styles.centerBox}>
          <Text style={styles.emptyText}>Chưa có vật phẩm nào trong mục này.</Text>
        </SurfaceCard>
      ) : (
        <View style={styles.grid}>
          {filteredItems.map((item) => {
            const rarity = RARITY_STYLES[item.rarity] ?? RARITY_STYLES.COMMON;
            const isAvatar = item.category === "AVATAR";
            const isAnimated = item.animationType === "ANIMATED";
            const canAfford = (shop?.myDiamonds ?? 0) >= item.priceDiamonds;
            return (
              <SurfaceCard
                key={item.id}
                style={[
                  styles.itemCard,
                  { width: cardWidth },
                  item.equipped ? styles.itemCardEquipped : null,
                ]}
              >
                <View style={styles.badgeTopRow}>
                  <View style={[styles.typeBadge, isAnimated ? styles.typeBadgeAnim : null]}>
                    <Text style={[styles.typeBadgeText, isAnimated ? styles.typeBadgeTextAnim : null]}>
                      {isAvatar ? "AVATAR" : isAnimated ? "ĐỘNG" : "TĨNH"}
                    </Text>
                  </View>
                  <View style={[styles.rarityBadge, { backgroundColor: rarity.bg }]}>
                    <Text style={[styles.rarityText, { color: rarity.text }]}>{item.rarity}</Text>
                  </View>
                </View>

                <View style={styles.previewWrap}>
                  <UserAvatarWithFrame
                    avatarUrl={isAvatar ? `cosmetic://${item.previewKey}` : auth.user?.avatarUrl}
                    frameId={isAvatar ? shop?.equippedFrameId : item.id}
                    fullName={auth.user?.fullName || "A"}
                    level={auth.user?.level ?? 1}
                    size={54}
                  />
                </View>

                <Text numberOfLines={1} style={styles.itemName}>
                  {item.badgeEmoji ? `${item.badgeEmoji} ` : ""}
                  {item.name}
                </Text>
                <Text numberOfLines={2} style={styles.itemDesc}>
                  {item.description}
                </Text>

                <Text style={styles.priceText}>
                  💎 {item.priceDiamonds.toLocaleString()}
                </Text>

                <Pressable
                  disabled={busyId === item.id}
                  onPress={() => void handleAction(item)}
                  style={[
                    styles.actionBtn,
                    item.equipped
                      ? styles.actionEquipped
                      : item.owned
                        ? styles.actionOwned
                        : canAfford
                          ? styles.actionBuy
                          : styles.actionMuted,
                  ]}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        color="#FFFFFF"
                        name={
                          item.equipped
                            ? "checkmark-circle"
                            : item.owned
                              ? "sparkles"
                              : "cart-outline"
                        }
                        size={14}
                      />
                      <Text style={styles.actionBtnText}>
                        {item.equipped ? "Đang dùng" : item.owned ? "Trang bị" : "Mua ngay"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </SurfaceCard>
            );
          })}
        </View>
      )}
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    diamondPill: {
      backgroundColor: colors.isDark ? "rgba(14,165,233,0.22)" : "#E0F2FE",
      borderColor: "#38BDF8",
      borderRadius: 99,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    diamondPillText: { color: "#0284C7", fontSize: 13.5, fontWeight: "900" },
    filterRow: { gap: 8, paddingVertical: 2 },
    filterPill: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    filterTextActive: { color: "#FFFFFF" },
    centerBox: { alignItems: "center", paddingVertical: 40 },
    emptyText: { color: colors.textMuted, fontSize: 13.5 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    itemCard: {
      alignItems: "center",
      gap: 6,
      padding: 12,
    },
    itemCardEquipped: {
      borderColor: "#10B981",
      borderWidth: 2,
    },
    badgeTopRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      width: "100%",
    },
    typeBadge: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    typeBadgeAnim: { backgroundColor: "rgba(236, 72, 153, 0.16)" },
    typeBadgeText: { color: colors.textMuted, fontSize: 9.5, fontWeight: "900" },
    typeBadgeTextAnim: { color: "#DB2777" },
    rarityBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    rarityText: { fontSize: 9.5, fontWeight: "900" },
    previewWrap: { alignItems: "center", justifyContent: "center", minHeight: 112, paddingVertical: 8 },
    itemName: { color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "center" },
    itemDesc: { color: colors.textMuted, fontSize: 11, minHeight: 28, textAlign: "center" },
    priceText: { color: "#0284C7", fontSize: 13.5, fontWeight: "900", marginTop: 2 },
    actionBtn: {
      alignItems: "center",
      borderRadius: 12,
      flexDirection: "row",
      gap: 5,
      justifyContent: "center",
      marginTop: 2,
      paddingVertical: 8,
      width: "100%",
    },
    actionBuy: { backgroundColor: colors.primary },
    actionOwned: { backgroundColor: "#0EA5E9" },
    actionEquipped: { backgroundColor: "#10B981" },
    actionMuted: { backgroundColor: "#94A3B8" },
    actionBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  });
