import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidIconButton, LiquidSegmentedBar } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  addUserGrammarFavorite,
  getUserFavoriteGrammars,
  getUserGrammarDetail,
  getUserGrammars,
  removeUserGrammarFavorite,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { useVoiceSettings } from "@/src/store/voice-store";
import { UserGrammarListItem } from "@/src/types/user-api";
import { safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

type GrammarTab = "all" | "favorites";

export default function GrammarScreen() {
  const { auth, isHydrated } = useAuth();
  const { theme } = useAppTheme();
  const { height, insets, rf } = useResponsiveLayout();
  const { isSpeaking, speakText, stopSpeaking } = useVoiceSettings();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [activeTab, setActiveTab] = useState<GrammarTab>("all");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [favoriteLoadingId, setFavoriteLoadingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [allGrammars, setAllGrammars] = useState<UserGrammarListItem[]>([]);
  const [favoriteGrammars, setFavoriteGrammars] = useState<UserGrammarListItem[]>([]);
  const [selectedGrammar, setSelectedGrammar] = useState<UserGrammarListItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const loadActiveTabData = useCallback(async () => {
    if (!auth.accessToken) return;

    try {
      setLoading(true);
      setErrorMessage(null);

      if (activeTab === "all") {
        const response = await getUserGrammars(auth.accessToken);
        setAllGrammars(response.data ?? []);
      } else {
        const response = await getUserFavoriteGrammars(auth.accessToken);
        setFavoriteGrammars(response.data ?? []);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Không thể tải danh sách ngữ pháp.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, auth.accessToken]);

  const refreshAllSources = useCallback(async () => {
    if (!auth.accessToken) return;

    try {
      const [allResponse, favoriteResponse] = await Promise.all([
        getUserGrammars(auth.accessToken),
        getUserFavoriteGrammars(auth.accessToken),
      ]);

      setAllGrammars(allResponse.data ?? []);
      setFavoriteGrammars(favoriteResponse.data ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Không thể đồng bộ dữ liệu ngữ pháp.",
      );
    }
  }, [auth.accessToken]);

  useEffect(() => {
    if (!isHydrated || !auth.accessToken) return;
    const timer = setTimeout(() => {
      void loadActiveTabData();
    }, 0);
    return () => clearTimeout(timer);
  }, [auth.accessToken, isHydrated, loadActiveTabData]);

  const visibleGrammars = useMemo(
    () => (activeTab === "all" ? allGrammars : favoriteGrammars),
    [activeTab, allGrammars, favoriteGrammars],
  );

  const favoriteIds = useMemo(
    () => new Set(favoriteGrammars.map((item) => item.id)),
    [favoriteGrammars],
  );

  const openGrammarDetail = useCallback(
    async (grammarId: number) => {
      if (!auth.accessToken) return;

      try {
        setDetailVisible(true);
        setDetailLoading(true);
        setErrorMessage(null);
        const response = await getUserGrammarDetail(auth.accessToken, grammarId);
        setSelectedGrammar(response.data ?? null);
      } catch (error) {
        setSelectedGrammar(null);
        setErrorMessage(
          error instanceof Error ? error.message : "Không thể tải chi tiết ngữ pháp.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [auth.accessToken],
  );

  const syncFavoriteState = useCallback(
    (grammarId: number, nextFavorite: boolean) => {
      setAllGrammars((current) =>
        current.map((item) =>
          item.id === grammarId ? { ...item, isFavorite: nextFavorite } : item,
        ),
      );

      setFavoriteGrammars((current) => {
        if (nextFavorite) {
          const existing = current.find((item) => item.id === grammarId);
          if (existing) {
            return current.map((item) =>
              item.id === grammarId ? { ...item, isFavorite: true } : item,
            );
          }

          const sourceItem = allGrammars.find((item) => item.id === grammarId);
          return sourceItem ? [{ ...sourceItem, isFavorite: true }, ...current] : current;
        }

        return current.filter((item) => item.id !== grammarId);
      });

      setSelectedGrammar((current) =>
        current && current.id === grammarId ? { ...current, isFavorite: nextFavorite } : current,
      );
    },
    [allGrammars],
  );

  const toggleFavorite = useCallback(
    async (grammarId: number, isFavorite: boolean) => {
      if (!auth.accessToken || favoriteLoadingId === grammarId) return;

      try {
        setFavoriteLoadingId(grammarId);
        setErrorMessage(null);

        if (isFavorite) {
          await removeUserGrammarFavorite(auth.accessToken, grammarId);
        } else {
          await addUserGrammarFavorite(auth.accessToken, grammarId);
        }

        syncFavoriteState(grammarId, !isFavorite);
        await refreshAllSources();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Không thể cập nhật trạng thái yêu thích.",
        );
      } finally {
        setFavoriteLoadingId(null);
      }
    },
    [auth.accessToken, favoriteLoadingId, refreshAllSources, syncFavoriteState],
  );

  const renderGrammarItem = (item: UserGrammarListItem) => {
    const isFavorite = item.isFavorite || favoriteIds.has(item.id);
    const previewText = item.tips?.trim() || item.content?.trim() || "Chạm để xem chi tiết.";

    return (
      <Pressable
        key={item.id}
        onPress={() => openGrammarDetail(item.id)}
        style={({ pressed }) => [pressed ? { opacity: 0.9 } : null]}
      >
        <SurfaceCard padding="sm" style={styles.grammarItem}>
          <View style={styles.grammarItemMain}>
            <View style={styles.grammarIcon}>
              <Ionicons color={colors.accent} name="book-outline" size={18} />
            </View>
            <View style={styles.grammarCopy}>
              <Text numberOfLines={1} style={[styles.grammarTitle, { fontSize: rf(15) }]}>
                {item.title}
              </Text>
              <Text numberOfLines={2} style={styles.grammarSubtitle}>
                {previewText}
              </Text>
              {item.example?.trim() ? (
                <Text numberOfLines={1} style={styles.grammarMeta}>
                  VD: {item.example.trim()}
                </Text>
              ) : null}
            </View>
          </View>

          <Pressable
            hitSlop={10}
            onPress={() => toggleFavorite(item.id, isFavorite)}
            style={styles.favoriteButton}
          >
            {favoriteLoadingId === item.id ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Ionicons
                color={isFavorite ? "#F5A623" : colors.textMuted}
                name={isFavorite ? "star" : "star-outline"}
                size={20}
              />
            )}
          </Pressable>
        </SurfaceCard>
      </Pressable>
    );
  };

  const detailIsFavorite = selectedGrammar
    ? selectedGrammar.isFavorite || favoriteIds.has(selectedGrammar.id)
    : false;

  return (
    <>
      <UserScreen hasTabDock={false}>
        <AppHeader
          leftIcon="chevron-back-outline"
          onLeftPress={() => safeBack("/user/home")}
          rightSlot={<AvatarBadge label={auth.user?.fullName?.[0]?.toUpperCase() || "A"} />}
          title="Ngữ pháp TOEIC"
        />

        <View style={styles.filterToolbar}>
          <LiquidSegmentedBar
            onChange={setActiveTab}
            options={[
              { value: "all", label: "Tất cả", badge: allGrammars.length },
              { value: "favorites", label: "Yêu thích", badge: favoriteGrammars.length },
            ]}
            style={{ flex: 1 }}
            value={activeTab}
          />
          <LiquidIconButton accessibilityLabel="Tải lại" onPress={loadActiveTabData}>
            <Ionicons color={colors.primaryDark} name="refresh" size={17} />
          </LiquidIconButton>
        </View>

        {loading ? (
          <View style={styles.feedbackRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.feedbackText}>Đang tải danh sách ngữ pháp...</Text>
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {!loading && visibleGrammars.length === 0 ? (
          <SurfaceCard>
            <Text style={styles.emptyText}>
              {activeTab === "all"
                ? "Chưa có điểm ngữ pháp nào."
                : "Bạn chưa lưu điểm ngữ pháp yêu thích nào."}
            </Text>
          </SurfaceCard>
        ) : (
          <View style={styles.listColumn}>{visibleGrammars.map(renderGrammarItem)}</View>
        )}
      </UserScreen>

      <Modal
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
        transparent
        visible={detailVisible}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable onPress={() => setDetailVisible(false)} style={styles.sheetDismissArea} />
          <View
            style={[
              styles.sheetCard,
              {
                maxHeight: Math.round(height * 0.84),
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            {detailLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.feedbackText}>Đang tải chi tiết...</Text>
              </View>
            ) : selectedGrammar ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetHeaderCopy}>
                    <Text style={[styles.sheetTitle, { fontSize: rf(19) }]}>
                      {selectedGrammar.title}
                    </Text>
                    <Text style={styles.sheetSubtitle}>Chi tiết ngữ pháp TOEIC</Text>
                  </View>
                  <View style={styles.sheetHeaderActions}>
                    <Pressable
                      hitSlop={8}
                      onPress={() => toggleFavorite(selectedGrammar.id, detailIsFavorite)}
                      style={styles.sheetIconButton}
                    >
                      <Ionicons
                        color={detailIsFavorite ? "#F5A623" : colors.textMuted}
                        name={detailIsFavorite ? "star" : "star-outline"}
                        size={20}
                      />
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        stopSpeaking();
                        setDetailVisible(false);
                      }}
                      style={styles.sheetIconButton}
                    >
                      <Ionicons color={colors.textMuted} name="close" size={20} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionLabel}>Cấu trúc & Nội dung</Text>
                  <Text style={styles.sheetSectionText}>{selectedGrammar.content}</Text>
                </View>

                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionLabel}>Mẹo làm bài nhanh</Text>
                  <Text style={styles.sheetSectionText}>
                    {selectedGrammar.tips?.trim() || "Chưa có mẹo bổ sung."}
                  </Text>
                </View>

                <View style={styles.sheetSection}>
                  <View style={styles.exampleHeaderRow}>
                    <Text style={[styles.sheetSectionLabel, { marginBottom: 0 }]}>Ví dụ minh họa</Text>
                    {selectedGrammar.example?.trim() ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          if (isSpeaking) {
                            stopSpeaking();
                          } else {
                            void speakText(selectedGrammar.example || "");
                          }
                        }}
                        style={styles.exampleAudioPill}
                      >
                        <Ionicons
                          color={colors.primary}
                          name={isSpeaking ? "stop-circle-outline" : "volume-high-outline"}
                          size={15}
                        />
                        <Text style={styles.exampleAudioText}>
                          {isSpeaking ? "Dừng" : "Nghe ví dụ"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={[styles.sheetExampleText, { fontSize: rf(16) }]}>
                    {selectedGrammar.example?.trim() || "Chưa có ví dụ."}
                  </Text>
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.emptyText}>Không tìm thấy nội dung chi tiết.</Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    filterToolbar: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    feedbackRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    feedbackText: {
      color: colors.textMuted,
      fontSize: 13.5,
    },
    errorText: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.16)" : "rgba(217,91,91,0.12)",
      borderColor: colors.isDark ? "rgba(248,113,113,0.34)" : "rgba(217,91,91,0.22)",
      borderRadius: 14,
      borderWidth: 1,
      color: colors.danger,
      marginBottom: 12,
      padding: 12,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
    },
    listColumn: {
      gap: 10,
    },
    grammarItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
    },
    grammarItemMain: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 12,
      minWidth: 0,
    },
    grammarIcon: {
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    grammarCopy: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    grammarTitle: {
      color: colors.text,
      fontWeight: "800",
    },
    grammarSubtitle: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 18,
    },
    grammarMeta: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 2,
    },
    favoriteButton: {
      alignItems: "center",
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    sheetBackdrop: {
      backgroundColor: "rgba(9,16,32,0.45)",
      flex: 1,
      justifyContent: "flex-end",
    },
    sheetDismissArea: {
      flex: 1,
    },
    sheetCard: {
      alignSelf: "center",
      backgroundColor: colors.backgroundStrong,
      borderColor: colors.glassBorder,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: 1,
      maxWidth: 620,
      paddingHorizontal: 20,
      paddingTop: 10,
      width: "100%",
    },
    sheetHandle: {
      alignSelf: "center",
      backgroundColor: colors.glassBorder,
      borderRadius: radius.pill,
      height: 5,
      marginBottom: 14,
      width: 56,
    },
    sheetLoading: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 32,
    },
    sheetHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      marginBottom: 12,
    },
    sheetHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    sheetHeaderActions: {
      flexDirection: "row",
      gap: 8,
    },
    sheetIconButton: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    sheetTitle: {
      color: colors.text,
      fontWeight: "900",
      lineHeight: 26,
    },
    sheetSubtitle: {
      color: colors.accent,
      fontSize: 12.5,
      fontWeight: "800",
      marginTop: 2,
    },
    sheetSection: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      marginTop: 12,
      paddingTop: 12,
    },
    sheetSectionLabel: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: "900",
      marginBottom: 6,
      textTransform: "uppercase",
    },
    sheetSectionText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 23,
    },
    sheetExampleText: {
      color: colors.primaryDark,
      fontWeight: "800",
      lineHeight: 24,
      marginTop: 6,
    },
    exampleHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    exampleAudioPill: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    exampleAudioText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
    },
  });
