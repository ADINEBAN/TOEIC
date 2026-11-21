import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import VerifiedBadge from "@/src/components/common/VerifiedBadge";
import { LiquidCard } from "@/src/components/ui/LiquidGlass";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import { useAuth } from "@/src/hooks/use-auth";
import {
  acceptFriendRequest,
  blockChatUser,
  getPublicUserProfile,
  removeFriendship,
  sendFriendRequest,
  unblockChatUser,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { ProfileInsightsData } from "@/src/types/user-api";
import { useResponsiveLayout } from "@/src/utils/responsive";
import { confirmWeb } from "@/src/utils/web-dialog";

type PublicProfileModalProps = {
  userId: number | null;
  visible: boolean;
  onClose: () => void;
  onFriendshipChanged?: () => void;
  onStartDirectChat?: (user: {
    userId: number;
    fullName: string;
    username: string;
    avatarUrl?: string | null;
    equippedFrameId?: string | null;
    verified?: boolean;
    level: number;
  }) => void;
};

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (confirmWeb(message)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { style: "cancel", text: "Hủy" },
    { style: "destructive", text: "Xác nhận", onPress: onConfirm },
  ]);
}

export default function PublicProfileModal({
  userId,
  visible,
  onClose,
  onFriendshipChanged,
  onStartDirectChat,
}: PublicProfileModalProps) {
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { height, screenPadding } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileInsightsData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!visible || !userId || !auth.accessToken) return;
    const token = auth.accessToken;
    let active = true;
    const initTimer = setTimeout(() => {
      if (!active) return;
      setProfile(null);
      setLoading(true);
      void getPublicUserProfile(token, userId)
        .then((res) => {
          if (active && res.data) {
            setProfile(res.data);
          }
        })
        .catch((err) => {
          if (active) {
            Alert.alert("Hồ sơ", err instanceof Error ? err.message : "Không tải được thông tin người dùng.");
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(initTimer);
    };
  }, [auth.accessToken, userId, visible]);

  const isMe =
    (auth.user?.id != null && userId != null && auth.user.id === userId)
    || profile?.relationStatus === "SELF";

  const relationStatus = profile?.relationStatus ?? "NONE";

  const handleAddFriend = async () => {
    if (!auth.accessToken || !profile || actionLoading) return;
    try {
      setActionLoading(true);
      const res = await sendFriendRequest(auth.accessToken, { targetUserId: profile.userId });
      const becameFriend = res.data?.friends?.some((f) => f.userId === profile.userId);
      const nextStatus = becameFriend ? "ACCEPTED" : "PENDING_OUTGOING";
      setProfile((prev) => (prev ? { ...prev, relationStatus: nextStatus } : prev));
      onFriendshipChanged?.();
      Alert.alert(
        "Bạn bè",
        becameFriend
          ? `Bạn và @${profile.username} đã trở thành bạn bè.`
          : `Đã gửi lời mời kết bạn tới @${profile.username}.`,
      );
    } catch (err) {
      Alert.alert("Bạn bè", err instanceof Error ? err.message : "Không thể gửi lời mời kết bạn.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!auth.accessToken || !profile || actionLoading) return;
    try {
      setActionLoading(true);
      await acceptFriendRequest(auth.accessToken, profile.userId);
      setProfile((prev) => (prev ? { ...prev, relationStatus: "ACCEPTED" } : prev));
      onFriendshipChanged?.();
      Alert.alert("Bạn bè", `Bạn và @${profile.username} đã trở thành bạn bè.`);
    } catch (err) {
      Alert.alert("Bạn bè", err instanceof Error ? err.message : "Không thể chấp nhận lời mời.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveFriendship = (promptMessage: string) => {
    if (!auth.accessToken || !profile || actionLoading) return;
    const token = auth.accessToken;
    const targetId = profile.userId;
    confirmAction("Bạn bè", promptMessage, () => {
      void (async () => {
        try {
          setActionLoading(true);
          await removeFriendship(token, targetId);
          setProfile((prev) => (prev ? { ...prev, relationStatus: "NONE" } : prev));
          onFriendshipChanged?.();
        } catch (err) {
          Alert.alert("Bạn bè", err instanceof Error ? err.message : "Thao tác thất bại.");
        } finally {
          setActionLoading(false);
        }
      })();
    });
  };

  const handleUnblock = async () => {
    if (!auth.accessToken || !profile || actionLoading) return;
    try {
      setActionLoading(true);
      await unblockChatUser(auth.accessToken, profile.userId);
      setProfile((prev) => (prev ? { ...prev, relationStatus: "NONE" } : prev));
      onFriendshipChanged?.();
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể bỏ chặn.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!auth.accessToken || !profile || actionLoading) return;
    try {
      setActionLoading(true);
      await blockChatUser(auth.accessToken, profile.userId);
      onFriendshipChanged?.();
      Alert.alert("Đã chặn", `Bạn đã chặn @${profile.username}.`);
      onClose();
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể chặn người dùng.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.backdrop, { padding: screenPadding }]}>
        <LiquidCard style={[styles.sheet, { maxHeight: Math.round(height * 0.85) }]}>
          <View style={styles.topRow}>
            <Text style={styles.sheetTitle}>Hồ sơ học viên</Text>
            <Pressable hitSlop={8} onPress={onClose} style={styles.closeBtn}>
              <Ionicons color={colors.text} name="close" size={20} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : profile ? (
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.heroWrap}>
                <UserAvatarWithFrame
                  avatarUrl={profile.avatarUrl}
                  frameId={profile.equippedFrameId}
                  fullName={profile.fullName}
                  level={profile.level}
                  size={74}
                />
                <View style={{ alignItems: "center", flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 4 }}>
                  <Text style={[styles.fullName, { marginTop: 0 }]}>{profile.fullName}</Text>
                  <VerifiedBadge size={17} verified={profile.verified} />
                </View>
                <Text style={styles.username}>@{profile.username}</Text>
                {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

                <View style={styles.pillRow}>
                  <View style={styles.statChip}>
                    <Text style={styles.statChipText}>💎 {profile.diamonds}</Text>
                  </View>
                  <View style={styles.statChip}>
                    <Text style={styles.statChipText}>🔥 {profile.currentStreak} ngày</Text>
                  </View>
                  <View style={styles.statChip}>
                    <Text style={styles.statChipText}>⚔️ {profile.stats.arenaElo} ELO</Text>
                  </View>
                </View>

                {!isMe ? (
                  <View style={styles.socialBtns}>
                    {relationStatus === "ACCEPTED" ? (
                      <Pressable
                        disabled={actionLoading}
                        onPress={() => handleRemoveFriendship(`Hủy kết bạn với @${profile.username}?`)}
                        style={styles.friendAction}
                      >
                        <Ionicons color="#047857" name="checkmark-circle" size={16} />
                        <Text style={styles.friendActionText}>Bạn bè</Text>
                      </Pressable>
                    ) : relationStatus === "PENDING_OUTGOING" ? (
                      <Pressable
                        disabled={actionLoading}
                        onPress={() => handleRemoveFriendship(`Hủy lời mời kết bạn đã gửi tới @${profile.username}?`)}
                        style={styles.pendingAction}
                      >
                        <Ionicons color={colors.textMuted} name="time-outline" size={15} />
                        <Text style={styles.pendingActionText}>Đã gửi lời mời</Text>
                      </Pressable>
                    ) : relationStatus === "PENDING_INCOMING" ? (
                      <Pressable disabled={actionLoading} onPress={handleAcceptFriend} style={styles.primaryAction}>
                        <Ionicons color="#FFFFFF" name="checkmark" size={15} />
                        <Text style={styles.primaryActionText}>Đồng ý kết bạn</Text>
                      </Pressable>
                    ) : relationStatus === "BLOCKED" ? (
                      <Pressable disabled={actionLoading} onPress={handleUnblock} style={styles.pendingAction}>
                        <Ionicons color={colors.textMuted} name="ban-outline" size={15} />
                        <Text style={styles.pendingActionText}>Bỏ chặn</Text>
                      </Pressable>
                    ) : relationStatus !== "BLOCKED_BY_OTHER" ? (
                      <Pressable disabled={actionLoading} onPress={handleAddFriend} style={styles.primaryAction}>
                        <Ionicons color="#FFFFFF" name="person-add-outline" size={15} />
                        <Text style={styles.primaryActionText}>Kết bạn</Text>
                      </Pressable>
                    ) : null}
                    {onStartDirectChat && relationStatus !== "BLOCKED" && relationStatus !== "BLOCKED_BY_OTHER" ? (
                      <Pressable
                        onPress={() => {
                          onClose();
                          onStartDirectChat({
                            userId: profile.userId,
                            fullName: profile.fullName,
                            username: profile.username,
                            avatarUrl: profile.avatarUrl,
                            equippedFrameId: profile.equippedFrameId,
                            verified: profile.verified,
                            level: profile.level,
                          });
                        }}
                        style={styles.secondaryAction}
                      >
                        <Ionicons color={colors.primary} name="chatbubble-outline" size={15} />
                        <Text style={styles.secondaryActionText}>Nhắn tin</Text>
                      </Pressable>
                    ) : null}
                    {relationStatus !== "BLOCKED" ? (
                      <Pressable disabled={actionLoading} onPress={handleBlock} style={styles.dangerAction}>
                        <Ionicons color="#EF4444" name="ban-outline" size={15} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={styles.metricsGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricVal}>{profile.stats.completedLessons}</Text>
                  <Text style={styles.metricLbl}>Bài học xong</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricVal}>{profile.stats.masteredVocabCount}</Text>
                  <Text style={styles.metricLbl}>Từ thành thạo</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricVal}>{profile.stats.submittedTests}</Text>
                  <Text style={styles.metricLbl}>Đề đã thi</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricVal}>{profile.stats.arenaWins}</Text>
                  <Text style={styles.metricLbl}>Thắng Solo</Text>
                </View>
              </View>

              <Text style={styles.sectionHeader}>
                Thành tựu đạt được ({profile.stats.totalAchievementsUnlocked}/{profile.achievements.length})
              </Text>
              <View style={styles.achList}>
                {profile.achievements.map((a) => (
                  <View
                    key={a.code}
                    style={[styles.achCard, !a.unlocked ? styles.achCardLocked : null]}
                  >
                    <View
                      style={[
                        styles.achIcon,
                        { backgroundColor: a.unlocked ? a.accentColor : colors.surfaceMuted },
                      ]}
                    >
                      <Ionicons
                        color={a.unlocked ? "#FFFFFF" : colors.textMuted}
                        name={(a.iconName as keyof typeof Ionicons.glyphMap) || "trophy"}
                        size={17}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.achTitle}>
                        {a.title}
                      </Text>
                      <Text numberOfLines={2} style={styles.achDesc}>
                        {a.description}
                      </Text>
                    </View>
                    <Text style={styles.achReward}>
                      {a.unlocked ? "✓" : `${a.currentProgress}/${a.targetProgress}`}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </LiquidCard>
      </View>
    </Modal>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    backdrop: {
      alignItems: "center",
      backgroundColor: "rgba(15, 23, 42, 0.56)",
      flex: 1,
      justifyContent: "center",
    },
    sheet: {
      maxWidth: 440,
      width: "100%",
    },
    topRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    sheetTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
    closeBtn: { padding: 4 },
    centerBox: { paddingVertical: 40, alignItems: "center" },
    heroWrap: { alignItems: "center", gap: 6, paddingBottom: 14 },
    fullName: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 4 },
    username: { color: colors.primary, fontSize: 13, fontWeight: "800" },
    bio: { color: colors.textMuted, fontSize: 12.5, textAlign: "center", paddingHorizontal: 10 },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 },
    statChip: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statChipText: { color: colors.text, fontSize: 12, fontWeight: "800" },
    socialBtns: { flexDirection: "row", gap: 8, marginTop: 8 },
    primaryAction: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 99,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    primaryActionText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
    friendAction: {
      alignItems: "center",
      backgroundColor: "rgba(16, 185, 129, 0.14)",
      borderColor: "rgba(16, 185, 129, 0.45)",
      borderRadius: 99,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    friendActionText: { color: "#047857", fontSize: 12.5, fontWeight: "800" },
    pendingAction: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    pendingActionText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "800" },
    secondaryAction: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderRadius: 99,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    secondaryActionText: { color: colors.primary, fontSize: 12.5, fontWeight: "800" },
    dangerAction: {
      alignItems: "center",
      backgroundColor: "rgba(239,68,68,0.1)",
      borderRadius: 99,
      justifyContent: "center",
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14,
    },
    metricBox: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      minWidth: "46%",
      flex: 1,
      paddingVertical: 10,
    },
    metricVal: { color: colors.text, fontSize: 16, fontWeight: "900" },
    metricLbl: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
    sectionHeader: { color: colors.text, fontSize: 14, fontWeight: "900", marginBottom: 8 },
    achList: { gap: 8, paddingBottom: 8 },
    achCard: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 10,
    },
    achCardLocked: { opacity: 0.58 },
    achIcon: {
      alignItems: "center",
      borderRadius: 12,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    achTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
    achDesc: { color: colors.textMuted, fontSize: 11.5, marginTop: 1 },
    achReward: { color: colors.primary, fontSize: 11.5, fontWeight: "900" },
  });
