import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidCard, LiquidSwitch } from "@/src/components/ui/LiquidGlass";
import AppHeader from "@/src/components/user/AppHeader";
import ClayIcon3D from "@/src/components/user/ClayIcon3D";
import { useFloatingChat } from "@/src/components/user/FloatingChatOverlay";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import { changePassword, logout } from "@/src/services/auth.service";
import {
  checkInTodayStreak,
  getMyProfile,
  getMyProfileInsights,
  getMyStreak,
  updateMyProfile,
  updateMyTargetScore,
  uploadMyAvatar,
} from "@/src/services/user.service";
import { ProfileInsightsData } from "@/src/types/user-api";
import {
  ACCENT_SWATCHES,
  LIQUID_THEME_PRESETS,
  LiquidThemeColors,
  useAppTheme,
  useThemedStyles,
} from "@/src/store/theme-store";
import { useVoiceSettings } from "@/src/store/voice-store";
import { computeLevelProgress, getLevelTierStyle, LEVEL_XP_RULES } from "@/src/utils/level";
import { pushRoute } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

const LEVEL_OPTIONS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

export default function ProfileScreen() {
  const { auth, signOut, updateUserProfile } = useAuth();
  const {
    theme,
    presetId,
    accentId,
    prismaticGlow,
    setPresetId,
    setAccentId,
    setPrismaticGlow,
  } = useAppTheme();
  const { gridItemWidth, height, rf, isNarrow, screenPadding } = useResponsiveLayout();
  const {
    engine: voiceEngine,
    voiceRegion,
    selectedVoiceId,
    rate: voiceRate,
    voices: speechifyVoices,
    speechifyConfigured,
    voicesLoading,
    voiceStatusMessage,
    lastPlaybackLabel,
    isSpeaking,
    setEngine: setVoiceEngine,
    setVoiceRegion,
    setSelectedVoiceId,
    setRate: setVoiceRate,
    refreshVoices,
    speakText,
    stopSpeaking,
  } = useVoiceSettings();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const { openCommunityChat, fabVisible, setFabVisible } = useFloatingChat();
  const [targetScore, setTargetScore] = useState<number>(auth.user?.targetScore ?? 0);
  const [fullName, setFullName] = useState<string>(auth.user?.fullName ?? "");
  const [username, setUsername] = useState<string>(auth.user?.username ?? "");
  const [bio, setBio] = useState<string>(auth.user?.bio ?? "");
  const [email, setEmail] = useState<string>(auth.user?.email ?? "");
  const [currentLevel, setCurrentLevel] = useState<string>(auth.user?.currentLevel ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string>(auth.user?.avatarUrl ?? "");
  const [streakDays, setStreakDays] = useState<number>(0);
  const [todayCheckedIn, setTodayCheckedIn] = useState<boolean>(false);
  const [insights, setInsights] = useState<ProfileInsightsData | null>(null);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [checkingInStreak, setCheckingInStreak] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [editTargetScore, setEditTargetScore] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const inFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!auth.accessToken || inFlightRef.current) return;

      async function loadProfile() {
        if (!auth.accessToken) return;
        inFlightRef.current = true;
        try {
          const [profileResponse, streakResponse, insightsResponse] = await Promise.all([
            getMyProfile(auth.accessToken),
            getMyStreak(auth.accessToken),
            getMyProfileInsights(auth.accessToken).catch(() => null),
          ]);

          setTargetScore(profileResponse.data.targetScore);
          setFullName(profileResponse.data.fullName);
          setUsername(profileResponse.data.username ?? "");
          setBio(profileResponse.data.bio ?? "");
          setEmail(profileResponse.data.email);
          setCurrentLevel(profileResponse.data.currentLevel);
          setAvatarUrl(profileResponse.data.avatarUrl ?? "");
          setStreakDays(streakResponse.data.currentLoginStreak ?? 0);
          setTodayCheckedIn(Boolean(streakResponse.data.todayLoggedIn));
          if (insightsResponse?.data) {
            setInsights(insightsResponse.data);
          }
          updateUserProfile(profileResponse.data);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Không thể tải thông tin cá nhân.";
          Alert.alert("Hồ sơ", message);
        } finally {
          inFlightRef.current = false;
        }
      }

      void loadProfile();
    }, [auth.accessToken, updateUserProfile]),
  );

  const increaseTarget = async () => {
    if (!auth.accessToken) return;
    const nextTarget = Math.min(targetScore + 5, 990);
    try {
      const response = await updateMyTargetScore(auth.accessToken, nextTarget);
      setTargetScore(response.data.targetScore);
      updateUserProfile(response.data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể cập nhật mục tiêu.";
      Alert.alert("Hồ sơ", message);
    }
  };

  const handleLogout = async () => {
    if (!auth.accessToken || loggingOut) return;

    try {
      setLoggingOut(true);
      await logout(auth.accessToken, auth.tokenType ?? "Bearer");
    } catch {
      // best-effort
    } finally {
      signOut();
      setLoggingOut(false);
      router.replace("/");
    }
  };

  const openEditModal = () => {
    setEditFullName(fullName);
    setEditUsername(username);
    setEditBio(bio);
    setEditLevel(currentLevel || "INTERMEDIATE");
    setEditTargetScore(String(targetScore || 650));
    setEditAvatarUrl(avatarUrl);
    setShowEditModal(true);
  };

  const handlePickAndUploadAvatar = async () => {
    if (!auth.accessToken || uploadingAvatar) return;
    try {
      setUploadingAvatar(true);
      let picked: { uri?: string; name: string; mimeType?: string; webFile?: File | Blob } | null = null;
      try {
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!res.canceled && res.assets?.[0]) {
          const asset = res.assets[0];
          picked = {
            uri: asset.uri,
            name: asset.fileName || "avatar.jpg",
            mimeType: asset.mimeType || "image/jpeg",
            webFile: (asset as { file?: File }).file,
          };
        }
      } catch {
        const doc = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
        if (!doc.canceled && doc.assets?.[0]) {
          const a = doc.assets[0];
          picked = {
            uri: a.uri,
            name: a.name || "avatar.jpg",
            mimeType: a.mimeType || "image/jpeg",
            webFile: (a as { file?: File }).file,
          };
        }
      }
      if (!picked) return;
      const uploaded = await uploadMyAvatar(auth.accessToken, picked);
      if (uploaded.data) {
        setAvatarUrl(uploaded.data.avatarUrl ?? "");
        setEditAvatarUrl(uploaded.data.avatarUrl ?? "");
        updateUserProfile(uploaded.data);
        const ins = await getMyProfileInsights(auth.accessToken).catch(() => null);
        if (ins?.data) setInsights(ins.data);
        Alert.alert("Ảnh đại diện", "Đã cập nhật ảnh đại diện mới!");
      }
    } catch (err) {
      Alert.alert("Ảnh đại diện", err instanceof Error ? err.message : "Không thể tải ảnh đại diện.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCheckInStreak = async () => {
    if (!auth.accessToken || checkingInStreak) return;
    try {
      setCheckingInStreak(true);
      const res = await checkInTodayStreak(auth.accessToken);
      if (res.data) {
        setStreakDays(res.data.currentLoginStreak ?? streakDays);
        setTodayCheckedIn(true);
        const [me, ins] = await Promise.all([
          getMyProfile(auth.accessToken),
          getMyProfileInsights(auth.accessToken).catch(() => null),
        ]);
        if (me.data) updateUserProfile(me.data);
        if (ins?.data) setInsights(ins.data);
        if ((res.data.diamondsEarned ?? 0) > 0) {
          Alert.alert("Điểm danh", `Bạn đã nhận +${res.data.diamondsEarned} 💎 cho chuỗi ${res.data.currentLoginStreak} ngày!`);
        }
      }
    } catch (err) {
      Alert.alert("Điểm danh", err instanceof Error ? err.message : "Không thể điểm danh.");
    } finally {
      setCheckingInStreak(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!auth.accessToken) return;
    if (!editFullName.trim()) {
      Alert.alert("Hồ sơ", "Họ và tên không được để trống.");
      return;
    }
    const parsedScore = Number(editTargetScore);
    try {
      setSavingProfile(true);
      const res = await updateMyProfile(auth.accessToken, {
        fullName: editFullName.trim(),
        username: editUsername.trim() ? editUsername.trim() : undefined,
        bio: editBio.trim(),
        currentLevel: editLevel.trim() || undefined,
        avatarUrl: editAvatarUrl.trim() || undefined,
        targetScore: Number.isFinite(parsedScore) && parsedScore > 0 ? Math.min(990, parsedScore) : undefined,
      });
      if (res.data) {
        setFullName(res.data.fullName);
        setUsername(res.data.username ?? "");
        setBio(res.data.bio ?? "");
        setCurrentLevel(res.data.currentLevel);
        setTargetScore(res.data.targetScore);
        setAvatarUrl(res.data.avatarUrl ?? "");
        updateUserProfile(res.data);
        const ins = await getMyProfileInsights(auth.accessToken).catch(() => null);
        if (ins?.data) setInsights(ins.data);
      }
      setShowEditModal(false);
      Alert.alert("Hồ sơ", "Đã cập nhật thông tin cá nhân.");
    } catch (error) {
      Alert.alert("Hồ sơ", error instanceof Error ? error.message : "Không thể cập nhật hồ sơ.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!auth.accessToken) return;
    if (!currentPassword || newPassword.length < 6) {
      Alert.alert("Mật khẩu", "Nhập mật khẩu hiện tại và mật khẩu mới tối thiểu 6 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mật khẩu", "Xác nhận mật khẩu mới chưa khớp.");
      return;
    }
    try {
      setSavingPassword(true);
      await changePassword(auth.accessToken, { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordModal(false);
      Alert.alert("Thành công", "Đã đổi mật khẩu tài khoản.");
    } catch (error) {
      Alert.alert("Mật khẩu", error instanceof Error ? error.message : "Không thể đổi mật khẩu.");
    } finally {
      setSavingPassword(false);
    }
  };

  const presetTileW = gridItemWidth(2, 8, true);
  const shortLevel = useMemo(() => {
    if (currentLevel === "ADVANCED") return "ADV";
    if (currentLevel === "INTERMEDIATE") return "INT";
    return "BEG";
  }, [currentLevel]);

  const regionSpeechifyVoices = useMemo(() => {
    const targetPrefix = voiceRegion === "UK" ? "en-gb" : "en-us";
    const matched = speechifyVoices.filter((v) =>
      v.locale?.toLowerCase().startsWith(targetPrefix),
    );
    return (matched.length > 0 ? matched : speechifyVoices).slice(0, 14);
  }, [speechifyVoices, voiceRegion]);

  const levelInfo = useMemo(
    () => computeLevelProgress(insights?.learningXp ?? auth.user?.learningXp ?? 0),
    [auth.user?.learningXp, insights?.learningXp],
  );
  const effectiveLevel = insights?.level ?? auth.user?.level ?? levelInfo.level;
  const effectiveLevelTitle = insights?.levelTitle ?? auth.user?.levelTitle ?? levelInfo.levelTitle;
  const effectiveNextXp = insights?.nextLevelXp ?? auth.user?.nextLevelXp ?? levelInfo.nextLevelXp;
  const effectiveMinXp = insights?.currentLevelMinXp ?? auth.user?.currentLevelMinXp ?? levelInfo.currentLevelMinXp;
  const effectiveXp = insights?.learningXp ?? auth.user?.learningXp ?? levelInfo.totalXp;
  const effectivePct =
    insights?.levelProgressPercent ??
    auth.user?.levelProgressPercent ??
    levelInfo.progressPercent;

  return (
    <UserScreen>
      <AppHeader
        rightSlot={
          <Pressable onPress={() => pushRoute("/user/shop")} style={styles.coinPill}>
            <Text style={styles.coinText}>💎 {insights?.diamonds ?? auth.user?.diamonds ?? 50}</Text>
          </Pressable>
        }
        subtitle="Thành tích & Cài đặt"
        title="Hồ sơ"
      />

      <SurfaceCard style={styles.profileHeroCard}>
        <View style={styles.profileHeroTop}>
          <Pressable onPress={openEditModal}>
            <UserAvatarWithFrame
              avatarUrl={avatarUrl || auth.user?.avatarUrl}
              frameId={insights?.equippedFrameId ?? auth.user?.equippedFrameId}
              fullName={fullName}
              level={effectiveLevel}
              size={62}
            />
          </Pressable>

          <View style={styles.profileIdentityCol}>
            <View style={styles.nameTierRow}>
              <Text numberOfLines={1} style={[styles.profileHeroName, { fontSize: rf(18) }]}>
                {fullName || "Học viên TOEIC"}
              </Text>
              <Pressable onPress={() => setShowLevelModal(true)}>
                <LinearGradient
                  colors={getLevelTierStyle(effectiveLevel).badgeColors}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={styles.tierPill}
                >
                  <Text style={styles.tierPillTxt}>
                    Lv.{effectiveLevel} • {effectiveLevelTitle}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
            <Text numberOfLines={1} style={styles.profileHandle}>
              @{username || insights?.username || "learner"}
            </Text>
            <Text numberOfLines={1} style={styles.profileEmailText}>
              {email || "Chưa có email"}
            </Text>
            {bio ? (
              <Text numberOfLines={2} style={styles.profileBioText}>
                {bio}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.heroStatsStrip}>
          <Pressable onPress={() => pushRoute("/user/shop")} style={styles.heroChip}>
            <Text style={styles.heroChipVal}>💎 {insights?.diamonds ?? auth.user?.diamonds ?? 50}</Text>
            <Text style={styles.heroChipSub}>Cửa hàng ›</Text>
          </Pressable>
          <Pressable onPress={() => setShowStreakModal(true)} style={styles.heroChip}>
            <Text style={styles.heroChipVal}>🔥 {streakDays} ngày</Text>
            <Text style={styles.heroChipSub}>{todayCheckedIn ? "Đã điểm danh" : "Điểm danh ngay"}</Text>
          </Pressable>
          <Pressable onPress={() => pushRoute("/user/leaderboard")} style={styles.heroChip}>
            <Text style={styles.heroChipVal}>🏆 +{insights?.weeklyStudyDiamonds ?? 0}</Text>
            <Text style={styles.heroChipSub}>Tuần này ›</Text>
          </Pressable>
        </View>

        <View style={styles.rewardBtnRow}>
          <Pressable onPress={openEditModal} style={styles.heroBtnPrimary}>
            <Ionicons color="#FFFFFF" name="create-outline" size={14} />
            <Text style={styles.heroBtnPrimaryTxt}>Sửa hồ sơ</Text>
          </Pressable>
          <Pressable onPress={() => pushRoute("/user/shop")} style={styles.heroBtnSecondary}>
            <Ionicons color={colors.primary} name="sparkles-outline" size={14} />
            <Text style={styles.heroBtnSecondaryTxt}>Khung & Avatar</Text>
          </Pressable>
          <Pressable onPress={() => setShowPasswordModal(true)} style={styles.heroBtnSecondary}>
            <Ionicons color={colors.primary} name="key-outline" size={14} />
            <Text style={styles.heroBtnSecondaryTxt}>Mật khẩu</Text>
          </Pressable>
        </View>
      </SurfaceCard>

      {!fabVisible ? (
        <SurfaceCard style={styles.chatDockedCard}>
          <View style={styles.chatDockedLeft}>
            <ClayIcon3D colors={["#818CF8", "#4F46E5"]} icon="chatbubbles" size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.chatDockedTitle}>Chat Cộng đồng & Bạn bè</Text>
              <Text style={styles.chatDockedSub}>
                Icon nổi đang tắt • Nhấn để trò chuyện hoặc bật lại
              </Text>
            </View>
          </View>
          <View style={styles.chatDockedActions}>
            <Pressable onPress={openCommunityChat} style={styles.chatOpenMiniBtn}>
              <Text style={styles.chatOpenMiniTxt}>Mở Chat</Text>
            </Pressable>
            <Pressable onPress={() => setFabVisible(true)} style={styles.chatRestoreBtn}>
              <Ionicons color={colors.primary} name="eye-outline" size={13} />
              <Text style={styles.chatRestoreTxt}>Hiện nổi</Text>
            </Pressable>
          </View>
        </SurfaceCard>
      ) : null}

      {insights ? (
        <>
          <SectionTitle
            actionLabel="Cách tính Level"
            onActionPress={() => setShowLevelModal(true)}
            title="Thống kê học tập"
          />
          <SurfaceCard style={styles.studyStatsCard}>
            <View style={styles.xpRow}>
              <Pressable onPress={() => setShowLevelModal(true)}>
                <Text style={styles.xpLabel}>
                  Lv.{effectiveLevel} ({effectiveLevelTitle}) • +{effectiveXp - effectiveMinXp}/
                  {Math.max(100, effectiveNextXp - effectiveMinXp)} XP
                </Text>
              </Pressable>
              <Text style={styles.xpTime}>⏱ {insights.totalStudyMinutes} phút học</Text>
            </View>
            <View style={styles.xpBarTrack}>
              <LinearGradient
                colors={getLevelTierStyle(effectiveLevel).badgeColors}
                end={{ x: 1, y: 0 }}
                start={{ x: 0, y: 0 }}
                style={[
                  styles.xpBarFill,
                  {
                    width: `${Math.min(100, Math.max(6, effectivePct))}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.xpSubCaptionRow}>
              <Text style={styles.xpSubCaption}>Tổng tích lũy: {effectiveXp.toLocaleString()} XP</Text>
              <Text style={styles.xpSubCaption}>
                Cần thêm {Math.max(0, effectiveNextXp - effectiveXp)} XP lên Lv.{effectiveLevel + 1}
              </Text>
            </View>
            <View style={styles.statsMiniGrid}>
              <View style={styles.statsMiniBox}>
                <Text style={styles.statsMiniNum}>{insights.stats.completedLessons + insights.stats.completedVideos}</Text>
                <Text style={styles.statsMiniLbl}>Bài học & Video</Text>
              </View>
              <View style={styles.statsMiniBox}>
                <Text style={styles.statsMiniNum}>{insights.stats.masteredVocabCount}</Text>
                <Text style={styles.statsMiniLbl}>Từ thành thạo</Text>
              </View>
              <View style={styles.statsMiniBox}>
                <Text style={styles.statsMiniNum}>{insights.stats.submittedTests}</Text>
                <Text style={styles.statsMiniLbl}>Đề đã thi</Text>
              </View>
              <View style={styles.statsMiniBox}>
                <Text style={styles.statsMiniNum}>{insights.stats.arenaWins}W / {insights.stats.arenaElo}</Text>
                <Text style={styles.statsMiniLbl}>Solo ELO</Text>
              </View>
            </View>
          </SurfaceCard>

          <SectionTitle
            title={`Thành tựu đạt được (${insights.stats.totalAchievementsUnlocked}/${insights.achievements.length})`}
          />
          <SurfaceCard style={styles.achContainerCard}>
            <View style={styles.achGridCol}>
              {insights.achievements.map((a) => (
                <View key={a.code} style={[styles.achRowCard, !a.unlocked ? styles.achRowLocked : null]}>
                  <View
                    style={[
                      styles.achBadgeIcon,
                      { backgroundColor: a.unlocked ? a.accentColor : colors.surfaceMuted },
                    ]}
                  >
                    <Ionicons
                      color={a.unlocked ? "#FFFFFF" : colors.textMuted}
                      name={(a.iconName as keyof typeof Ionicons.glyphMap) || "trophy"}
                      size={18}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.achTitleText}>{a.title}</Text>
                    <Text numberOfLines={2} style={styles.achDescText}>{a.description}</Text>
                  </View>
                  <View style={styles.achRightTag}>
                    <Text style={[styles.achRewardTxt, a.unlocked ? { color: "#10B981" } : null]}>
                      {a.unlocked ? `✓ +${a.rewardDiamonds}💎` : `${a.currentProgress}/${a.targetProgress}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </SurfaceCard>
        </>
      ) : null}

      <SectionTitle title="Tiến độ của bạn" />
      <SurfaceCard padding="sm" style={styles.progressGridCard}>
        <View style={styles.progressTripleRow}>
          <View style={styles.progressStatCol}>
            <Text style={styles.statLabel}>Mục tiêu{"\n"}TOEIC</Text>
            <View style={styles.statValueRow}>
              <Text style={[styles.statVal, { fontSize: rf(20) }]}>{targetScore}</Text>
              <Pressable hitSlop={8} onPress={increaseTarget} style={styles.plusFiveBtn}>
                <Text style={styles.plusFiveText}>+5</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.progressStatCol}>
            <Text style={styles.statLabel}>Chuỗi{"\n"}ngày học</Text>
            <View style={styles.statValueRow}>
              <Text style={[styles.statVal, { fontSize: rf(20) }]}>{streakDays}</Text>
              <Ionicons color="#FF7247" name="flame" size={20} />
            </View>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.progressStatCol}>
            <Text style={styles.statLabel}>Trình độ{"\n"}hiện tại</Text>
            <View style={styles.statValueRow}>
              <Text style={[styles.statVal, { fontSize: rf(18) }]}>{shortLevel}</Text>
              <Ionicons color="#F59E0B" name="ribbon" size={18} />
            </View>
          </View>
        </View>
      </SurfaceCard>

      <SectionTitle title="Giao diện & Màu sắc" />
      <SurfaceCard style={styles.themeCard}>
        <View style={styles.themeTopHeader}>
          <Text style={styles.themeSubHeading}>1. Chủ đề Pastel 3D</Text>
          <View style={[styles.currentThemeBadge, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.currentThemeText, { color: colors.primary }]}>{theme.name}</Text>
          </View>
        </View>

        <View style={styles.presetGrid}>
          {LIQUID_THEME_PRESETS.map((preset) => {
            const active = preset.id === presetId;
            return (
              <Pressable
                key={preset.id}
                onPress={() => setPresetId(preset.id)}
                style={[
                  styles.presetCard,
                  { width: presetTileW },
                  active ? styles.presetCardActive : null,
                ]}
              >
                <LinearGradient
                  colors={preset.previewStops}
                  end={{ x: 1, y: 1 }}
                  start={{ x: 0, y: 0 }}
                  style={styles.presetOrb}
                >
                  {active ? <Ionicons color="#FFFFFF" name="checkmark" size={12} /> : null}
                </LinearGradient>
                <Text numberOfLines={1} style={[styles.presetLabel, { fontSize: rf(isNarrow ? 12 : 13) }]}>
                  {preset.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.themeSubHeading, { marginTop: 12 }]}>2. Màu điểm nhấn nút 3D</Text>
        <ScrollView
          contentContainerStyle={styles.accentRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {ACCENT_SWATCHES.map((swatch) => {
            const selected = swatch.id === accentId;
            return (
              <Pressable
                key={swatch.id}
                onPress={() => setAccentId(swatch.id)}
                style={[
                  styles.accentPill,
                  selected ? { backgroundColor: colors.primarySoft, borderColor: colors.primary } : null,
                ]}
              >
                {swatch.id === "preset" ? (
                  <View style={[styles.accentDot, { backgroundColor: colors.text }]}>
                    <Ionicons color={colors.surface} name="sparkles" size={10} />
                  </View>
                ) : (
                  <LinearGradient
                    colors={[swatch.gradient[0], swatch.gradient[1]]}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={styles.accentDot}
                  />
                )}
                <Text style={styles.accentLabel}>{swatch.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.prismRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.prismTitle}>Hiệu ứng chiều sâu 3D</Text>
          </View>
          <LiquidSwitch
            accessibilityLabel="Bật tắt hiệu ứng pastel"
            onValueChange={setPrismaticGlow}
            value={prismaticGlow}
          />
        </View>
      </SurfaceCard>

      <SectionTitle title="Giọng đọc Speechify AI" />
      <SurfaceCard style={styles.themeCard}>
        <View style={styles.themeTopHeader}>
          <View
            style={[
              styles.currentThemeBadge,
              {
                backgroundColor: speechifyConfigured
                  ? colors.isDark
                    ? "rgba(25,180,143,0.22)"
                    : "#E6FBF4"
                  : colors.accentSoft,
              },
            ]}
          >
            <Text
              style={[
                styles.currentThemeText,
                { color: speechifyConfigured ? colors.success : colors.accent },
              ]}
            >
              {speechifyConfigured
                ? `Speechify AI • ${speechifyVoices.length || "Sẵn sàng"} giọng`
                : "Chưa cấu hình Speechify key"}
            </Text>
          </View>
          <Pressable
            disabled={voicesLoading}
            hitSlop={8}
            onPress={() => void refreshVoices()}
            style={styles.voiceRefreshBtn}
          >
            <Ionicons color={colors.primary} name="refresh" size={14} />
            <Text style={styles.voiceRefreshText}>
              {voicesLoading ? "Đang tải..." : "Đồng bộ"}
            </Text>
          </Pressable>
        </View>

        {voiceStatusMessage ? (
          <Text style={styles.voiceStatusNote}>{voiceStatusMessage}</Text>
        ) : null}

        <View style={styles.voiceControlsRow}>
          <Pressable
            onPress={() => setVoiceEngine("speechify")}
            style={[styles.voicePill, voiceEngine === "speechify" ? styles.voicePillActive : null]}
          >
            <Text
              style={[
                styles.voicePillText,
                voiceEngine === "speechify" ? styles.voicePillTextActive : null,
              ]}
            >
              Speechify AI
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setVoiceEngine("device")}
            style={[styles.voicePill, voiceEngine === "device" ? styles.voicePillActive : null]}
          >
            <Text
              style={[
                styles.voicePillText,
                voiceEngine === "device" ? styles.voicePillTextActive : null,
              ]}
            >
              Giọng máy
            </Text>
          </Pressable>

          {(["US", "UK"] as const).map((region) => (
            <Pressable
              key={region}
              onPress={() => setVoiceRegion(region)}
              style={[styles.voicePill, voiceRegion === region ? styles.voicePillActive : null]}
            >
              <Text
                style={[
                  styles.voicePillText,
                  voiceRegion === region ? styles.voicePillTextActive : null,
                ]}
              >
                {region}
              </Text>
            </Pressable>
          ))}
        </View>

        {voiceEngine === "speechify" && regionSpeechifyVoices.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.accentRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <Pressable
              onPress={() => setSelectedVoiceId(null)}
              style={[styles.voicePill, !selectedVoiceId ? styles.voicePillActive : null]}
            >
              <Text
                style={[
                  styles.voicePillText,
                  !selectedVoiceId ? styles.voicePillTextActive : null,
                ]}
              >
                Tự động ({voiceRegion})
              </Text>
            </Pressable>
            {regionSpeechifyVoices.map((voice) => {
              const selected = selectedVoiceId === voice.id;
              return (
                <Pressable
                  key={voice.id}
                  onPress={() => setSelectedVoiceId(voice.id)}
                  style={[styles.voicePill, selected ? styles.voicePillActive : null]}
                >
                  <Text style={[styles.voicePillText, selected ? styles.voicePillTextActive : null]}>
                    {voice.displayName}
                    {voice.gender ? ` • ${voice.gender === "female" ? "Nữ" : "Nam"}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.voiceFooterRow}>
          <View style={styles.voiceSpeedCluster}>
            <Text style={styles.themeSubHeading}>Tốc độ:</Text>
            <Pressable
              onPress={() => setVoiceRate((r) => Math.max(0.6, r - 0.1))}
              style={styles.voiceStepBtn}
            >
              <Text style={styles.voiceStepText}>-</Text>
            </Pressable>
            <Text style={styles.voiceRateLabel}>{voiceRate.toFixed(1)}x</Text>
            <Pressable
              onPress={() => setVoiceRate((r) => Math.min(1.5, r + 0.1))}
              style={styles.voiceStepBtn}
            >
              <Text style={styles.voiceStepText}>+</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              if (isSpeaking) {
                stopSpeaking();
              } else {
                void speakText(
                  "Welcome to TOEIC Trainer. Let us boost your listening and vocabulary score today!",
                );
              }
            }}
            style={styles.voiceSampleBtn}
          >
            <Ionicons
              color={colors.onPrimary}
              name={isSpeaking ? "stop-circle" : "volume-high"}
              size={15}
            />
            <Text style={styles.voiceSampleText}>
              {isSpeaking ? "Dừng phát" : "Nghe thử"}
            </Text>
          </Pressable>
        </View>

        {lastPlaybackLabel ? (
          <Text style={styles.voicePlaybackTag}>Đang dùng: {lastPlaybackLabel}</Text>
        ) : null}
      </SurfaceCard>

      <SectionTitle title="Công cụ học tập" />
      <SurfaceCard padding="sm" style={styles.toolsCard}>
        <Pressable onPress={() => pushRoute("/user/youtube-studio")} style={styles.toolRow}>
          <ClayIcon3D colors={["#FF7074", "#E53935"]} icon="logo-youtube" size={42} />
          <View style={styles.toolCopy}>
            <Text style={styles.toolTitle}>Thư viện Video AI</Text>
          </View>
          <View style={[styles.chevronMini, { backgroundColor: colors.primarySoft }]}>
            <Ionicons color={colors.primary} name="chevron-forward" size={15} />
          </View>
        </Pressable>

        <Pressable onPress={() => pushRoute("/user/dictionary")} style={[styles.toolRow, styles.toolRowBorder]}>
          <ClayIcon3D colors={["#60A5FA", "#2563EB"]} icon="git-network-outline" size={42} />
          <View style={styles.toolCopy}>
            <Text style={styles.toolTitle}>Từ điển & Camera AI</Text>
          </View>
          <View style={[styles.chevronMini, { backgroundColor: colors.primarySoft }]}>
            <Ionicons color={colors.primary} name="chevron-forward" size={15} />
          </View>
        </Pressable>

        <Pressable onPress={() => pushRoute("/user/mistakes")} style={[styles.toolRow, styles.toolRowBorder]}>
          <ClayIcon3D colors={["#FF8585", "#EA4359"]} icon="alert-circle" size={42} />
          <View style={styles.toolCopy}>
            <Text style={styles.toolTitle}>Ngân hàng câu sai</Text>
          </View>
          <View style={[styles.chevronMini, { backgroundColor: colors.primarySoft }]}>
            <Ionicons color={colors.primary} name="chevron-forward" size={15} />
          </View>
        </Pressable>

        <Pressable onPress={() => pushRoute("/user/notebook")} style={[styles.toolRow, styles.toolRowBorder]}>
          <ClayIcon3D colors={["#9D8FFF", "#6E5CEB"]} icon="bookmarks" size={42} />
          <View style={styles.toolCopy}>
            <Text style={styles.toolTitle}>Sổ tay ghi chú</Text>
          </View>
          <View style={[styles.chevronMini, { backgroundColor: colors.primarySoft }]}>
            <Ionicons color={colors.primary} name="chevron-forward" size={15} />
          </View>
        </Pressable>

        <Pressable onPress={() => pushRoute("/user/shop")} style={[styles.toolRow, styles.toolRowBorder]}>
          <ClayIcon3D colors={["#38BDF8", "#0284C7"]} icon="diamond" size={42} />
          <View style={styles.toolCopy}>
            <Text style={styles.toolTitle}>Cửa hàng Khung & Avatar</Text>
          </View>
          <View style={[styles.chevronMini, { backgroundColor: colors.primarySoft }]}>
            <Ionicons color={colors.primary} name="chevron-forward" size={15} />
          </View>
        </Pressable>

        <Pressable onPress={() => pushRoute("/user/leaderboard")} style={[styles.toolRow, styles.toolRowBorder]}>
          <ClayIcon3D colors={["#FBBF24", "#D97706"]} icon="trophy" size={42} />
          <View style={styles.toolCopy}>
            <Text style={styles.toolTitle}>Bảng xếp hạng học tập Tuần</Text>
          </View>
          <View style={[styles.chevronMini, { backgroundColor: colors.primarySoft }]}>
            <Ionicons color={colors.primary} name="chevron-forward" size={15} />
          </View>
        </Pressable>

        <View style={[styles.toolRow, styles.toolRowBorder]}>
          <Pressable onPress={openCommunityChat} style={styles.toolMainTap}>
            <ClayIcon3D colors={["#818CF8", "#4F46E5"]} icon="chatbubbles" size={42} />
            <View style={styles.toolCopy}>
              <Text style={styles.toolTitle}>Chat Cộng đồng & Bạn bè</Text>
              <Text style={styles.toolSub}>
                {fabVisible ? "Đang bật nút chat nổi" : "Đang mở từ mục Hồ sơ"}
              </Text>
            </View>
          </Pressable>
          <View style={styles.chatToggleCol}>
            <Text style={styles.chatToggleLbl}>Nổi</Text>
            <LiquidSwitch
              accessibilityLabel="Bật hoặc tắt nút chat nổi"
              onValueChange={setFabVisible}
              value={fabVisible}
            />
          </View>
        </View>

        <Pressable onPress={() => pushRoute("/user/arena")} style={[styles.toolRow, styles.toolRowBorder]}>
          <ClayIcon3D colors={["#5BE5D5", "#14B8A6"]} icon="flash" size={42} />
          <View style={styles.toolCopy}>
            <Text style={styles.toolTitle}>Đấu trường Quiz 1v1</Text>
          </View>
          <View style={[styles.chevronMini, { backgroundColor: colors.primarySoft }]}>
            <Ionicons color={colors.primary} name="chevron-forward" size={15} />
          </View>
        </Pressable>
      </SurfaceCard>

      <Pressable
        disabled={loggingOut}
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed ? { opacity: 0.9 } : null,
          loggingOut ? { opacity: 0.65 } : null,
        ]}
      >
        <Ionicons color="#FFFFFF" name="log-out-outline" size={18} />
        <Text style={styles.logoutText}>{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</Text>
      </Pressable>

      <Modal animationType="fade" onRequestClose={() => setShowEditModal(false)} transparent visible={showEditModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modalBackdrop, { padding: screenPadding }]}
        >
          <LiquidCard style={[styles.modalCard, { maxHeight: Math.round(height * 0.85) }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Chỉnh sửa hồ sơ</Text>
              <View style={styles.editAvatarPreviewRow}>
                <UserAvatarWithFrame
                  avatarUrl={editAvatarUrl || avatarUrl}
                  frameId={insights?.equippedFrameId ?? auth.user?.equippedFrameId}
                  fullName={editFullName || fullName}
                  size={64}
                />
                <View style={{ flex: 1, gap: 6 }}>
                  <Pressable
                    disabled={uploadingAvatar}
                    onPress={() => void handlePickAndUploadAvatar()}
                    style={styles.uploadAvatarBtn}
                  >
                    {uploadingAvatar ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons color="#FFFFFF" name="image-outline" size={15} />
                        <Text style={styles.uploadAvatarText}>Tải ảnh từ thiết bị</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setShowEditModal(false);
                      pushRoute("/user/shop");
                    }}
                    style={styles.openShopAvatarBtn}
                  >
                    <Text style={styles.openShopAvatarText}>Chọn Avatar 3D & Khung ›</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.modalLabel}>Họ và tên</Text>
              <TextInput
                onChangeText={setEditFullName}
                placeholder="Nhập họ tên"
                placeholderTextColor={colors.textMuted}
                style={styles.modalInput}
                value={editFullName}
              />
              <Text style={styles.modalLabel}>Username (@tên_định_danh)</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setEditUsername}
                placeholder="vd: dung.toeic900"
                placeholderTextColor={colors.textMuted}
                style={styles.modalInput}
                value={editUsername}
              />
              <Text style={styles.modalLabel}>Tiểu sử / Châm ngôn (tối đa 300 ký tự)</Text>
              <TextInput
                onChangeText={setEditBio}
                placeholder="Mục tiêu 850+ trong năm nay..."
                placeholderTextColor={colors.textMuted}
                style={styles.modalInput}
                value={editBio}
              />
              <Text style={styles.modalLabel}>Mục tiêu điểm TOEIC (10 - 990)</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setEditTargetScore}
                placeholder="650"
                placeholderTextColor={colors.textMuted}
                style={styles.modalInput}
                value={editTargetScore}
              />
              <Text style={styles.modalLabel}>Trình độ hiện tại</Text>
              <View style={styles.levelChipRow}>
                {LEVEL_OPTIONS.map((lvl) => (
                  <Pressable
                    key={lvl}
                    onPress={() => setEditLevel(lvl)}
                    style={[styles.levelChip, editLevel === lvl ? styles.levelChipActive : null]}
                  >
                    <Text style={[styles.levelChipText, editLevel === lvl ? styles.levelChipTextActive : null]}>
                      {lvl}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.modalLabel}>Avatar URL (tùy chọn)</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setEditAvatarUrl}
                placeholder="https://..."
                placeholderTextColor={colors.textMuted}
                style={styles.modalInput}
                value={editAvatarUrl}
              />
              <View style={styles.modalButtons}>
                <LiquidButton
                  compact
                  label="Hủy"
                  onPress={() => setShowEditModal(false)}
                  style={{ flex: 1 }}
                  variant="glass"
                />
                <LiquidButton
                  compact
                  label={savingProfile ? "Đang lưu..." : "Lưu hồ sơ"}
                  loading={savingProfile}
                  onPress={() => void handleSaveProfile()}
                  style={{ flex: 1 }}
                  variant="primary"
                />
              </View>
            </ScrollView>
          </LiquidCard>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShowPasswordModal(false)} transparent visible={showPasswordModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modalBackdrop, { padding: screenPadding }]}
        >
          <LiquidCard style={[styles.modalCard, { maxHeight: Math.round(height * 0.85) }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Đổi mật khẩu</Text>
              <Text style={styles.modalLabel}>Mật khẩu hiện tại</Text>
              <TextInput
                onChangeText={setCurrentPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.modalInput}
                value={currentPassword}
              />
              <Text style={styles.modalLabel}>Mật khẩu mới (tối thiểu 6 ký tự)</Text>
              <TextInput
                onChangeText={setNewPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.modalInput}
                value={newPassword}
              />
              <Text style={styles.modalLabel}>Xác nhận mật khẩu mới</Text>
              <TextInput
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.modalInput}
                value={confirmPassword}
              />
              <View style={styles.modalButtons}>
                <LiquidButton
                  compact
                  label="Hủy"
                  onPress={() => setShowPasswordModal(false)}
                  style={{ flex: 1 }}
                  variant="glass"
                />
                <LiquidButton
                  compact
                  label={savingPassword ? "Đang đổi..." : "Xác nhận"}
                  loading={savingPassword}
                  onPress={() => void handleChangePassword()}
                  style={{ flex: 1 }}
                  variant="primary"
                />
              </View>
            </ScrollView>
          </LiquidCard>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShowStreakModal(false)} transparent visible={showStreakModal}>
        <View style={[styles.modalBackdrop, { padding: screenPadding }]}>
          <LiquidCard style={styles.streakModalCard}>
            <Pressable onPress={() => setShowStreakModal(false)} style={styles.streakCloseBtn}>
              <Ionicons color={colors.text} name="close" size={20} />
            </Pressable>
            <Ionicons color="#2563EB" name="flame" size={46} />
            <Text style={styles.streakBigNum}>{streakDays}</Text>
            <Text style={styles.streakSubLbl}>{streakDays} NGÀY LIÊN TIẾP</Text>
            <Text style={styles.streakHeading}>Chuỗi ngày học của bạn</Text>
            <View style={styles.weekDaysRow}>
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day, idx) => {
                const jsDay = new Date().getDay();
                const monIdx = jsDay === 0 ? 6 : jsDay - 1;
                const active = idx <= monIdx && idx >= Math.max(0, monIdx - Math.max(0, streakDays - 1));
                return (
                  <View key={day} style={styles.weekDayCol}>
                    <Text style={styles.weekDayLbl}>{day}</Text>
                    <View style={[styles.weekDayDot, active ? styles.weekDayDotActive : null]}>
                      {active ? <Ionicons color="#FFFFFF" name="checkmark" size={14} /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
            <Pressable
              disabled={checkingInStreak}
              onPress={() => void handleCheckInStreak()}
              style={[styles.streakCheckBtn, todayCheckedIn ? styles.streakCheckedBtn : null]}
            >
              <Ionicons color="#FFFFFF" name={todayCheckedIn ? "checkmark-circle" : "sparkles"} size={17} />
              <Text style={styles.streakCheckTxt}>
                {checkingInStreak
                  ? "ĐANG ĐIỂM DANH..."
                  : todayCheckedIn
                    ? "ĐÃ ĐIỂM DANH HÔM NAY"
                    : "ĐIỂM DANH NGAY (+10 💎)"}
              </Text>
            </Pressable>
          </LiquidCard>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShowLevelModal(false)} transparent visible={showLevelModal}>
        <View style={[styles.modalBackdrop, { padding: screenPadding }]}>
          <LiquidCard style={[styles.modalCard, { maxHeight: Math.round(height * 0.85) }]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.levelModalHeader}>
                <Text style={styles.modalTitle}>Cấp độ & Hệ thống XP</Text>
                <Pressable hitSlop={8} onPress={() => setShowLevelModal(false)}>
                  <Ionicons color={colors.text} name="close" size={20} />
                </Pressable>
              </View>

              <View style={styles.levelHeroSummary}>
                <UserAvatarWithFrame
                  avatarUrl={avatarUrl || auth.user?.avatarUrl}
                  frameId={insights?.equippedFrameId ?? auth.user?.equippedFrameId}
                  fullName={fullName}
                  level={effectiveLevel}
                  size={54}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.levelBigTitle}>
                    Lv.{effectiveLevel} • {effectiveLevelTitle}
                  </Text>
                  <Text style={styles.levelSubMeta}>
                    {effectiveXp - effectiveMinXp}/{Math.max(100, effectiveNextXp - effectiveMinXp)} XP để lên Lv.{effectiveLevel + 1}
                  </Text>
                  <View style={styles.xpBarTrack}>
                    <LinearGradient
                      colors={getLevelTierStyle(effectiveLevel).badgeColors}
                      end={{ x: 1, y: 0 }}
                      start={{ x: 0, y: 0 }}
                      style={[
                        styles.xpBarFill,
                        { width: `${Math.min(100, Math.max(6, effectivePct))}%` },
                      ]}
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.modalLabel}>Mốc Danh Hiệu theo Level</Text>
              <View style={styles.tierListRow}>
                {[
                  { min: 1, lbl: "Lv.1+ Tân Binh" },
                  { min: 5, lbl: "Lv.5+ Học Giả" },
                  { min: 10, lbl: "Lv.10+ Tinh Anh" },
                  { min: 20, lbl: "Lv.20+ Chiến Tướng" },
                  { min: 30, lbl: "Lv.30+ Huyền Thoại" },
                ].map((t) => (
                  <LinearGradient
                    key={t.min}
                    colors={getLevelTierStyle(t.min).badgeColors}
                    end={{ x: 1, y: 1 }}
                    start={{ x: 0, y: 0 }}
                    style={styles.tierPreviewPill}
                  >
                    <Text style={styles.tierPreviewText}>{t.lbl}</Text>
                  </LinearGradient>
                ))}
              </View>

              <Text style={styles.modalLabel}>Cách tích lũy XP tăng Level nhanh</Text>
              <View style={styles.xpRulesCol}>
                {LEVEL_XP_RULES.map((rule) => (
                  <View key={rule.activity} style={styles.xpRuleRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.xpRuleTitle}>{rule.activity}</Text>
                      <Text style={styles.xpRuleNote}>{rule.note}</Text>
                    </View>
                    <View style={styles.xpRuleBadge}>
                      <Text style={styles.xpRuleBadgeText}>{rule.xp}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </LiquidCard>
        </View>
      </Modal>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    coinPill: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(245,158,11,0.2)" : "#FFF4D6",
      borderColor: colors.isDark ? "rgba(245,158,11,0.35)" : "#FDE3A0",
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    coinText: {
      color: colors.isDark ? "#FCD34D" : "#92400E",
      fontSize: 13,
      fontWeight: "900",
    },
    rewardBanner: {
      borderRadius: 24,
      marginBottom: 18,
      minHeight: 146,
      overflow: "hidden",
      position: "relative",
    },
    rewardOverlay: {
      flex: 1,
      justifyContent: "center",
      padding: 16,
      width: "60%",
    },
    rewardTitle: {
      color: "#221D4A",
      fontWeight: "900",
    },
    rewardName: {
      color: "#3F32A8",
      fontSize: 14,
      fontWeight: "900",
      marginTop: 2,
    },
    rewardEmail: {
      color: "#574E87",
      fontSize: 11.5,
      marginTop: 1,
    },
    rewardBtnRow: {
      flexDirection: "row",
      gap: 6,
      marginTop: 10,
    },
    bannerBtn: {
      backgroundColor: "#FFFFFF",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    bannerBtnText: {
      color: "#3F32A8",
      fontSize: 11,
      fontWeight: "900",
    },
    progressGridCard: {
      marginBottom: 18,
    },
    progressTripleRow: {
      alignItems: "center",
      flexDirection: "row",
    },
    progressStatCol: {
      alignItems: "center",
      flex: 1,
      gap: 6,
      paddingVertical: 6,
    },
    verticalDivider: {
      backgroundColor: colors.border,
      height: 44,
      width: 1,
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "700",
      lineHeight: 15,
      textAlign: "center",
    },
    statValueRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    statVal: {
      color: colors.text,
      fontWeight: "900",
    },
    plusFiveBtn: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    plusFiveText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "900",
    },
    themeCard: {
      marginBottom: 18,
    },
    themeTopHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    themeSubHeading: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
    },
    currentThemeBadge: {
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    currentThemeText: {
      fontSize: 11.5,
      fontWeight: "900",
    },
    presetGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    presetCard: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    presetCardActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    presetOrb: {
      alignItems: "center",
      borderRadius: 99,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    presetLabel: {
      color: colors.text,
      flex: 1,
      fontWeight: "800",
    },
    accentRow: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 8,
    },
    accentPill: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    accentDot: {
      alignItems: "center",
      borderRadius: 99,
      height: 16,
      justifyContent: "center",
      width: 16,
    },
    accentLabel: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
    },
    prismRow: {
      alignItems: "center",
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginTop: 10,
      paddingTop: 12,
    },
    prismTitle: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: "800",
    },
    prismSub: {
      color: colors.textMuted,
      fontSize: 11.5,
      marginTop: 1,
    },
    voiceRefreshBtn: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    voiceRefreshText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
    },
    voiceStatusNote: {
      color: colors.textMuted,
      fontSize: 11.5,
      lineHeight: 16,
      marginBottom: 8,
    },
    voiceControlsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 4,
    },
    voicePill: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    voicePillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    voicePillText: {
      color: colors.text,
      fontSize: 11.5,
      fontWeight: "800",
    },
    voicePillTextActive: {
      color: colors.onPrimary,
    },
    voiceFooterRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 8,
    },
    voiceSpeedCluster: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    voiceStepBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    voiceStepText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "900",
    },
    voiceRateLabel: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "900",
      minWidth: 32,
      textAlign: "center",
    },
    voiceSampleBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    voiceSampleText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: "900",
    },
    voicePlaybackTag: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "700",
      marginTop: 8,
    },
    toolsCard: {
      marginBottom: 18,
    },
    toolRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingVertical: 11,
    },
    toolRowBorder: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
    },
    toolIcon: {
      alignItems: "center",
      borderRadius: 14,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    toolCopy: {
      flex: 1,
      minWidth: 0,
    },
    toolTitle: {
      color: colors.text,
      fontSize: 14.5,
      fontWeight: "800",
    },
    toolSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    chevronMini: {
      alignItems: "center",
      borderRadius: 999,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    logoutButton: {
      alignItems: "center",
      backgroundColor: colors.danger,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      paddingVertical: 14,
    },
    logoutText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(18, 16, 46, 0.55)",
      flex: 1,
      justifyContent: "center",
    },
    modalCard: {
      maxWidth: 440,
      width: "100%",
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 6,
    },
    modalLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 5,
      marginTop: 10,
    },
    modalInput: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      color: colors.text,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    levelChipRow: {
      flexDirection: "row",
      gap: 6,
      marginTop: 4,
    },
    levelChip: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 8,
    },
    levelChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    levelChipText: {
      color: colors.textMuted,
      fontSize: 10.5,
      fontWeight: "800",
    },
    levelChipTextActive: {
      color: colors.onPrimary,
    },
    modalButtons: {
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
    },
    profileHeroCard: { gap: 12, marginBottom: 16 },
    profileHeroTop: { alignItems: "center", flexDirection: "row", gap: 14 },
    profileIdentityCol: { flex: 1, gap: 2, minWidth: 0 },
    profileHeroName: { color: colors.text, fontWeight: "900" },
    profileHandle: { color: colors.primary, fontSize: 13, fontWeight: "800" },
    profileEmailText: { color: colors.textMuted, fontSize: 11.5 },
    profileBioText: { color: colors.text, fontSize: 12, fontStyle: "italic", marginTop: 2 },
    heroStatsStrip: { flexDirection: "row", gap: 8 },
    heroChip: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 7,
    },
    heroChipVal: { color: colors.text, fontSize: 13, fontWeight: "900" },
    heroChipSub: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginTop: 1 },
    heroBtnPrimary: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 99,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    heroBtnPrimaryTxt: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "900" },
    heroBtnSecondary: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    heroBtnSecondaryTxt: { color: colors.primary, fontSize: 11.5, fontWeight: "800" },
    studyStatsCard: { gap: 10, marginBottom: 16 },
    xpRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    xpLabel: { color: colors.text, fontSize: 12.5, fontWeight: "900" },
    xpTime: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    xpBarTrack: {
      backgroundColor: colors.glassFill,
      borderRadius: 99,
      height: 8,
      overflow: "hidden",
      width: "100%",
    },
    xpBarFill: { borderRadius: 99, height: "100%" },
    statsMiniGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    statsMiniBox: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flex: 1,
      minWidth: "45%",
      paddingVertical: 8,
    },
    statsMiniNum: { color: colors.text, fontSize: 14, fontWeight: "900" },
    statsMiniLbl: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
    achContainerCard: { marginBottom: 16 },
    achGridCol: { gap: 8 },
    achRowCard: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 10,
    },
    achRowLocked: { opacity: 0.56 },
    achBadgeIcon: { alignItems: "center", borderRadius: 12, height: 36, justifyContent: "center", width: 36 },
    achTitleText: { color: colors.text, fontSize: 13, fontWeight: "800" },
    achDescText: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
    achRightTag: { alignItems: "flex-end" },
    achRewardTxt: { color: colors.textMuted, fontSize: 11.5, fontWeight: "900" },
    editAvatarPreviewRow: { alignItems: "center", flexDirection: "row", gap: 12, marginVertical: 10 },
    uploadAvatarBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 10,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      paddingVertical: 8,
    },
    uploadAvatarText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
    openShopAvatarBtn: { alignItems: "center", paddingVertical: 4 },
    openShopAvatarText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
    streakModalCard: { alignItems: "center", gap: 6, maxWidth: 360, padding: 20, position: "relative", width: "100%" },
    streakCloseBtn: { position: "absolute", right: 14, top: 14 },
    streakBigNum: { color: colors.text, fontSize: 34, fontWeight: "900" },
    streakSubLbl: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
    streakHeading: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 4 },
    weekDaysRow: { flexDirection: "row", gap: 8, justifyContent: "space-between", marginVertical: 10, width: "100%" },
    weekDayCol: { alignItems: "center", flex: 1, gap: 5 },
    weekDayLbl: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
    weekDayDot: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    weekDayDotActive: { backgroundColor: "#1E293B", borderColor: "#1E293B" },
    streakCheckBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 14,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      marginTop: 4,
      paddingVertical: 12,
      width: "100%",
    },
    streakCheckedBtn: { backgroundColor: "#4ADE80" },
    streakCheckTxt: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" },
    nameTierRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tierPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
    tierPillTxt: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "900" },
    chatDockedCard: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
      marginBottom: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    chatDockedLeft: { alignItems: "center", flex: 1, flexDirection: "row", gap: 10, minWidth: 0 },
    chatDockedTitle: { color: colors.text, fontSize: 13.5, fontWeight: "900" },
    chatDockedSub: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
    chatDockedActions: { alignItems: "flex-end", gap: 5 },
    chatOpenMiniBtn: {
      backgroundColor: colors.primary,
      borderRadius: 99,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    chatOpenMiniTxt: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "900" },
    chatRestoreBtn: { alignItems: "center", flexDirection: "row", gap: 3, paddingHorizontal: 4, paddingVertical: 2 },
    chatRestoreTxt: { color: colors.primary, fontSize: 11, fontWeight: "800" },
    toolMainTap: { alignItems: "center", flex: 1, flexDirection: "row", gap: 12, minWidth: 0 },
    chatToggleCol: { alignItems: "center", flexDirection: "row", gap: 6 },
    chatToggleLbl: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
    xpSubCaptionRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -4 },
    xpSubCaption: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    levelModalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    levelHeroSummary: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginBottom: 8,
      padding: 12,
    },
    levelBigTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
    levelSubMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    tierListRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
    tierPreviewPill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
    tierPreviewText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "900" },
    xpRulesCol: { gap: 7, marginTop: 4 },
    xpRuleRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    xpRuleTitle: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    xpRuleNote: { color: colors.textMuted, fontSize: 11 },
    xpRuleBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: 99,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    xpRuleBadgeText: { color: colors.primary, fontSize: 11.5, fontWeight: "900" },
  });
