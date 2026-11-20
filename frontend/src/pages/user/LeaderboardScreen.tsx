import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import AppHeader from "@/src/components/user/AppHeader";
import { useFloatingChat } from "@/src/components/user/FloatingChatOverlay";
import PublicProfileModal from "@/src/components/user/PublicProfileModal";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { getWeeklyLeaderboard } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { WeeklyLeaderboardData } from "@/src/types/user-api";
import { pushRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function splitCountdown(totalSec: number) {
  const s = Math.max(0, totalSec);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

export default function LeaderboardScreen() {
  const { auth } = useAuth();
  const { openDirectChat } = useFloatingChat();
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WeeklyLeaderboardData | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [inspectUserId, setInspectUserId] = useState<number | null>(null);
  const hasDataRef = useRef(false);

  const fetchBoard = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      if (!hasDataRef.current) {
        setLoading(true);
      }
      const res = await getWeeklyLeaderboard(auth.accessToken, weekOffset);
      if (res.data) {
        hasDataRef.current = true;
        setData(res.data);
        setRemainingSec(res.data.secondsUntilWeekClose ?? 0);
      }
    } catch {
      // ignore transient load failure
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, weekOffset]);

  useFocusEffect(
    useCallback(() => {
      void fetchBoard();
    }, [fetchBoard]),
  );

  const hasCountdown = weekOffset === 0 && remainingSec > 0;
  useEffect(() => {
    if (!hasCountdown) return;
    const timer = setInterval(() => {
      setRemainingSec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [hasCountdown]);

  const clock = useMemo(() => splitCountdown(remainingSec), [remainingSec]);

  return (
    <UserScreen>
      <AppHeader
        onLeftPress={() => safeBack("/user/home")}
        subtitle="Tổng bài học tuần"
        title="Bảng xếp hạng"
        rightSlot={
          <Pressable onPress={() => pushRoute("/user/arena")} style={styles.soloLinkBtn}>
            <Ionicons color={colors.primary} name="flash" size={14} />
            <Text style={styles.soloLinkText}>BXH Solo</Text>
          </Pressable>
        }
      />

      {/* Weekly Countdown & Reward Showcase */}
      <SurfaceCard style={styles.heroCard}>
        <LinearGradient
          colors={
            colors.isDark
              ? ["rgba(124, 58, 237, 0.24)", "rgba(59, 130, 246, 0.14)"]
              : ["rgba(139, 92, 246, 0.14)", "rgba(236, 72, 153, 0.08)"]
          }
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.timerHeaderRow}>
          <Ionicons color={colors.textMuted} name="time-outline" size={15} />
          <Text style={styles.timerLabel}>
            {weekOffset === 0 ? "Đóng bảng tổng kết tuần sau:" : "Bảng xếp hạng tuần đã lưu trữ"}
          </Text>
        </View>

        {weekOffset === 0 ? (
          <View style={styles.clockRow}>
            {[
              { val: clock.days, lbl: "Ngày" },
              { val: clock.hours, lbl: "Giờ" },
              { val: clock.minutes, lbl: "Phút" },
              { val: clock.seconds, lbl: "Giây" },
            ].map((b, i) => (
              <View key={b.lbl} style={styles.clockUnitWrap}>
                <View style={styles.clockTile}>
                  <Text style={styles.clockDigit}>{b.val}</Text>
                </View>
                <Text style={styles.clockLbl}>{b.lbl}</Text>
                {i < 3 ? <Text style={styles.clockColon}>:</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.weekSwitchRow}>
          <Pressable
            disabled={weekOffset <= -12}
            onPress={() => setWeekOffset((w) => Math.max(-12, w - 1))}
            style={styles.weekNavBtn}
          >
            <Ionicons color={colors.text} name="chevron-back" size={14} />
            <Text style={styles.weekNavText}>Tuần trước</Text>
          </Pressable>

          <Text style={[styles.weekTitle, { fontSize: rf(13.5) }]}>
            {data?.weekLabel || "Tuần này"}
          </Text>

          <Pressable
            disabled={weekOffset >= 0}
            onPress={() => setWeekOffset((w) => Math.min(0, w + 1))}
            style={[styles.weekNavBtn, weekOffset >= 0 ? { opacity: 0.45 } : null]}
          >
            <Text style={styles.weekNavText}>Tuần sau</Text>
            <Ionicons color={colors.text} name="chevron-forward" size={14} />
          </Pressable>
        </View>

        <Text style={styles.rewardSubTitle}>🏆 Phần thưởng Kim Cương học tập cuối tuần</Text>
        <View style={styles.tierRow}>
          {(data?.rewardTiers ?? []).map((t) => (
            <View key={t.rankLabel} style={styles.tierCard}>
              <Text style={styles.tierEmoji}>{t.badgeEmoji}</Text>
              <Text style={styles.tierRank}>{t.rankLabel}</Text>
              <Text style={styles.tierReward}>+{t.rewardDiamonds} 💎</Text>
            </View>
          ))}
        </View>
      </SurfaceCard>

      {/* Info Note distinguishing Study Weekly vs Solo */}
      <View style={styles.noteStrip}>
        <Ionicons color={colors.primary} name="diamond" size={15} />
        <Text style={styles.noteText}>
          Tính theo tổng kim cương học từ Bài học, Luyện tập, Thi thử, Từ vựng & Video AI trong tuần (BXH Solo tính riêng theo ELO).
        </Text>
      </View>

      {/* My Pinned Weekly Rank */}
      {data?.myEntry ? (
        <SurfaceCard style={styles.myRankCard}>
          <View style={styles.rowInner}>
            <View style={styles.rankBadgeDark}>
              <Text style={styles.rankBadgeDarkText}>#{data.myEntry.rank}</Text>
            </View>
            <UserAvatarWithFrame
              avatarUrl={data.myEntry.avatarUrl}
              frameId={data.myEntry.equippedFrameId}
              fullName={data.myEntry.fullName}
              level={data.myEntry.level}
              size={44}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.rowName}>
                {data.myEntry.fullName}{" "}
                <Text style={styles.rowHandle}>@{data.myEntry.username}</Text>
              </Text>
              <Text style={styles.rowMeta}>
                {data.myEntry.activitiesCount} hoạt động • 🔥 {data.myEntry.currentStreak} ngày
              </Text>
            </View>
            <View style={styles.diamondBadge}>
              <Text style={styles.diamondBadgeText}>+{data.myEntry.weeklyStudyDiamonds} 💎</Text>
            </View>
          </View>
        </SurfaceCard>
      ) : null}

      {/* Top Ranking List */}
      <SurfaceCard style={styles.listCard}>
        <View style={styles.listHeaderRow}>
          <Text style={styles.listTitle}>Bảng xếp hạng tuần</Text>
          <Text style={styles.listCount}>{data?.totalActiveLearners ?? 0} học viên tích cực</Text>
        </View>

        {loading && !data ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (data?.entries ?? []).length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyText}>
              Chưa có học viên nào nhận kim cương bài học trong tuần này. Hãy hoàn thành 1 bài học để dẫn đầu!
            </Text>
          </View>
        ) : (
          <View style={styles.entriesCol}>
            {data?.entries.map((entry) => {
              const isTop3 = entry.rank <= 3;
              const medalColor =
                entry.rank === 1
                  ? "#F59E0B"
                  : entry.rank === 2
                    ? "#94A3B8"
                    : entry.rank === 3
                      ? "#CD7F32"
                      : colors.textMuted;
              return (
                <Pressable
                  key={entry.userId}
                  onPress={() => setInspectUserId(entry.userId)}
                  style={[
                    styles.entryRow,
                    entry.rank === 1 ? styles.entryFirst : isTop3 ? styles.entryPodium : null,
                  ]}
                >
                  <View style={styles.rankCol}>
                    {isTop3 ? (
                      <Ionicons color={medalColor} name="trophy" size={20} />
                    ) : (
                      <Text style={styles.rankNum}>{entry.rank}</Text>
                    )}
                  </View>

                  <UserAvatarWithFrame
                    avatarUrl={entry.avatarUrl}
                    frameId={entry.equippedFrameId}
                    fullName={entry.fullName}
                    level={entry.level}
                    size={42}
                  />

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {entry.fullName}{" "}
                      <Text style={styles.rowHandle}>@{entry.username}</Text>
                    </Text>
                    <View style={styles.subStatsRow}>
                      <Text style={styles.rowMeta}>{entry.activitiesCount} bài học</Text>
                      {entry.currentStreak > 0 ? (
                        <Text style={styles.rowMeta}>• 🔥 {entry.currentStreak}d</Text>
                      ) : null}
                      {entry.topBadgeIcons?.slice(0, 3).map((ic, idx) => (
                        <Ionicons
                          key={`${entry.userId}-ic-${idx}`}
                          color={colors.primary}
                          name={(ic as keyof typeof Ionicons.glyphMap) || "ribbon"}
                          size={13}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.diamondBadge}>
                    <Text style={styles.diamondBadgeText}>{entry.weeklyStudyDiamonds} 💎</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </SurfaceCard>

      <PublicProfileModal
        onClose={() => setInspectUserId(null)}
        onStartDirectChat={(peer) => openDirectChat(peer)}
        userId={inspectUserId}
        visible={inspectUserId !== null}
      />
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    soloLinkBtn: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderRadius: 99,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    soloLinkText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
    heroCard: { gap: 10, marginBottom: 10, overflow: "hidden" },
    timerHeaderRow: { alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center" },
    timerLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
    clockRow: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "center" },
    clockUnitWrap: { alignItems: "center", position: "relative" },
    clockTile: {
      alignItems: "center",
      backgroundColor: colors.backgroundStrong,
      borderColor: colors.glassBorder,
      borderRadius: 10,
      borderWidth: 1,
      minWidth: 42,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    clockDigit: { color: colors.text, fontSize: 16, fontWeight: "900" },
    clockLbl: { color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 2 },
    clockColon: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "900",
      position: "absolute",
      right: -9,
      top: 5,
    },
    weekSwitchRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    weekNavBtn: {
      alignItems: "center",
      backgroundColor: colors.backgroundStrong,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      flexDirection: "row",
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    weekNavText: { color: colors.text, fontSize: 11.5, fontWeight: "800" },
    weekTitle: { color: colors.primary, fontWeight: "900" },
    rewardSubTitle: { color: colors.text, fontSize: 12.5, fontWeight: "900", marginTop: 4, textAlign: "center" },
    tierRow: { flexDirection: "row", gap: 6, justifyContent: "space-between" },
    tierCard: {
      alignItems: "center",
      backgroundColor: colors.backgroundStrong,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      gap: 2,
      paddingVertical: 8,
    },
    tierEmoji: { fontSize: 18 },
    tierRank: { color: colors.text, fontSize: 11, fontWeight: "900" },
    tierReward: { color: "#0284C7", fontSize: 10.5, fontWeight: "900" },
    noteStrip: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      flexDirection: "row",
      gap: 8,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    noteText: { color: colors.text, flex: 1, fontSize: 11.5, lineHeight: 16 },
    myRankCard: {
      borderColor: colors.primary,
      borderWidth: 1.5,
      marginBottom: 12,
    },
    rowInner: { alignItems: "center", flexDirection: "row", gap: 10 },
    rankBadgeDark: {
      backgroundColor: "#1E293B",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    rankBadgeDarkText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
    rowName: { color: colors.text, fontSize: 13.5, fontWeight: "900" },
    rowHandle: { color: colors.primary, fontSize: 12, fontWeight: "700" },
    rowMeta: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    diamondBadge: {
      backgroundColor: colors.isDark ? "rgba(14,165,233,0.22)" : "#E0F2FE",
      borderRadius: 99,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    diamondBadgeText: { color: "#0284C7", fontSize: 12, fontWeight: "900" },
    listCard: { gap: 10 },
    listHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    listTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
    listCount: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    centerBox: { paddingVertical: 28, alignItems: "center" },
    emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: "center" },
    entriesCol: { gap: 8 },
    entryRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 10,
    },
    entryFirst: {
      backgroundColor: colors.isDark ? "rgba(245, 158, 11, 0.16)" : "#FFFBEB",
      borderColor: "#FBBF24",
      borderWidth: 1.5,
    },
    entryPodium: {
      backgroundColor: colors.isDark ? "rgba(255, 255, 255, 0.05)" : "#F8FAFC",
      borderColor: colors.borderStrong,
    },
    rankCol: { alignItems: "center", width: 26 },
    rankNum: { color: colors.textMuted, fontSize: 13.5, fontWeight: "900" },
    subStatsRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
  });
