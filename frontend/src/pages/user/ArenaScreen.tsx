import { Ionicons } from "@expo/vector-icons";
import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidCard } from "@/src/components/ui/LiquidGlass";
import AppHeader from "@/src/components/user/AppHeader";
import { useFloatingChat } from "@/src/components/user/FloatingChatOverlay";
import PublicProfileModal from "@/src/components/user/PublicProfileModal";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  createArenaRoom,
  createMyFlashcard,
  getArenaLeaderboard,
  getArenaMatchmakingStatus,
  getArenaRoom,
  joinArenaMatchmaking,
  joinArenaRoom,
  leaveArenaMatchmaking,
  leaveArenaRoom,
  listArenaRooms,
  submitArenaAnswer,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { useVoiceSettings } from "@/src/store/voice-store";
import {
  ArenaLeaderboardData,
  ArenaMode,
  ArenaPlayerState,
  ArenaRoomItem,
} from "@/src/types/user-api";
import { pushRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function formatReactionSeconds(ms?: number) {
  if (!ms || ms <= 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ArenaScreen() {
  const { auth } = useAuth();
  const { openDirectChat } = useFloatingChat();
  const { speakText } = useVoiceSettings();
  const [inspectUserId, setInspectUserId] = useState<number | null>(null);
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  // Lobby & Matchmaking Config
  const [selectedMode, setSelectedMode] = useState<ArenaMode>("VOCAB");
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [hostSecretPassword, setHostSecretPassword] = useState<string | null>(null);
  const [showHostPwd, setShowHostPwd] = useState(false);
  const [displayLang, setDisplayLang] = useState<"EN" | "VI">("EN");
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  // Room List & Leaderboard
  const [rooms, setRooms] = useState<ArenaRoomItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<ArenaLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");

  // Password Join Prompt Modal
  const [pwdModalRoomCode, setPwdModalRoomCode] = useState<string | null>(null);
  const [pwdInput, setPwdInput] = useState("");
  const [joiningRoom, setJoiningRoom] = useState(false);

  // Matchmaking Queue State ("SEARCHING")
  const [searching, setSearching] = useState(false);
  const [searchWaitedSec, setSearchWaitedSec] = useState(0);

  // Active Room & Round Gameplay State
  const [activeRoom, setActiveRoom] = useState<ArenaRoomItem | null>(null);
  const [pickedPart5ByRound, setPickedPart5ByRound] = useState<Record<number, string>>({});
  const [vocabGuess, setVocabGuess] = useState("");
  const [wrongGuessAlert, setWrongGuessAlert] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [savedWordsMap, setSavedWordsMap] = useState<Record<string, boolean>>({});
  const [copiedHint, setCopiedHint] = useState(false);

  // Smooth local countdown clock synchronized with server remainingSeconds
  const [tickOffsetSec, setTickOffsetSec] = useState(0);
  const lastRoundIndexRef = useRef(-1);
  const spokenHintRoundRef = useRef(-1);
  const vocabInputRef = useRef<ComponentRef<typeof TextInput> | null>(null);
  const searchingRef = useRef(false);
  const accessTokenRef = useRef(auth.accessToken);

  useEffect(() => {
    searchingRef.current = searching;
    accessTokenRef.current = auth.accessToken;
  }, [auth.accessToken, searching]);

  useEffect(() => {
    return () => {
      if (searchingRef.current && accessTokenRef.current) {
        void leaveArenaMatchmaking(accessTokenRef.current).catch(() => {});
      }
    };
  }, []);

  const myEmail = auth.user?.email?.toLowerCase() ?? "";

  const applyRoomSnapshot = useCallback(
    (nextRoom: ArenaRoomItem | null) => {
      setActiveRoom(nextRoom);
      setTickOffsetSec(0);
      if (!nextRoom) {
        lastRoundIndexRef.current = -1;
        spokenHintRoundRef.current = -1;
        setWrongGuessAlert(false);
        return;
      }
      const nextIdx = nextRoom.currentRoundIndex ?? 0;
      if (lastRoundIndexRef.current !== nextIdx && nextRoom.roundPhase === "QUESTION") {
        setVocabGuess("");
        setWrongGuessAlert(false);
        setLangMenuOpen(false);
      }
      if (
        nextRoom.mode === "VOCAB" &&
        nextRoom.status === "IN_PROGRESS" &&
        nextRoom.roundPhase === "QUESTION" &&
        nextRoom.audioHintUnlocked &&
        nextRoom.audioHintWord &&
        spokenHintRoundRef.current !== nextIdx
      ) {
        spokenHintRoundRef.current = nextIdx;
        void speakText(nextRoom.audioHintWord);
      }
      lastRoundIndexRef.current = nextIdx;
    },
    [speakText],
  );

  const loadLobby = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setLoading(true);
      const [roomsRes, lbRes] = await Promise.allSettled([
        listArenaRooms(auth.accessToken),
        getArenaLeaderboard(auth.accessToken),
      ]);
      if (roomsRes.status === "fulfilled") {
        setRooms(roomsRes.value.data ?? []);
      }
      if (lbRes.status === "fulfilled" && lbRes.value.data) {
        setLeaderboard(lbRes.value.data);
      }
    } catch {
      // Keep cached lobby data on transient network errors
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLobby();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadLobby]);

  // Smooth 1s countdown between server syncs
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== "IN_PROGRESS") return;
    const timer = setInterval(() => {
      setTickOffsetSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeRoom]);

  // Fast live room polling during WAITING / IN_PROGRESS / REVEAL
  useEffect(() => {
    if (!auth.accessToken || !activeRoom?.roomCode || activeRoom.status === "FINISHED") return;
    const token = auth.accessToken;
    const code = activeRoom.roomCode;
    const intervalMs = activeRoom.status === "WAITING" ? 1300 : 700;
    const timer = setInterval(() => {
      void getArenaRoom(token, code)
        .then((res) => {
          if (res.data) {
            applyRoomSnapshot(res.data);
            if (res.data.status === "FINISHED") {
              void loadLobby();
            }
          }
        })
        .catch(() => {});
    }, intervalMs);
    return () => clearInterval(timer);
  }, [activeRoom?.roomCode, activeRoom?.status, applyRoomSnapshot, auth.accessToken, loadLobby]);

  // Random Matchmaking Queue Polling
  useEffect(() => {
    if (!searching || !auth.accessToken) return;
    const token = auth.accessToken;

    const secTimer = setInterval(() => {
      setSearchWaitedSec((s) => s + 1);
    }, 1000);

    const pollTimer = setInterval(() => {
      void getArenaMatchmakingStatus(token)
        .then((res) => {
          const data = res.data;
          if (!data) return;
          if (data.status === "MATCHED" && data.room) {
            setSearching(false);
            applyRoomSnapshot(data.room);
            setPickedPart5ByRound({});
            setVocabGuess("");
          } else if (data.status === "IDLE") {
            setSearching(false);
          }
        })
        .catch(() => {});
    }, 1200);

    return () => {
      clearInterval(secTimer);
      clearInterval(pollTimer);
    };
  }, [applyRoomSnapshot, auth.accessToken, searching]);

  const handleCreateRoom = async () => {
    if (!auth.accessToken) return;
    const cleanPwd = createPassword.trim();
    if (createPrivate && !cleanPwd) {
      Alert.alert("Thiếu mật khẩu", "Vui lòng nhập mật khẩu cho phòng Riêng tư.");
      return;
    }
    try {
      const res = await createArenaRoom(auth.accessToken, {
        isPrivate: createPrivate,
        mode: selectedMode,
        password: createPrivate ? cleanPwd : undefined,
        questionCount,
      });
      if (res.data) {
        setHostSecretPassword(createPrivate ? cleanPwd : null);
        setShowHostPwd(false);
        applyRoomSnapshot(res.data);
        setPickedPart5ByRound({});
        setVocabGuess("");
      }
    } catch (error) {
      Alert.alert("Đấu trường", error instanceof Error ? error.message : "Không thể tạo phòng.");
    }
  };

  const attemptJoinRoom = async (roomCode: string, password?: string) => {
    if (!auth.accessToken || !roomCode.trim()) return;
    try {
      setJoiningRoom(true);
      const res = await joinArenaRoom(auth.accessToken, roomCode.trim().toUpperCase(), password);
      if (res.data) {
        setPwdModalRoomCode(null);
        setPwdInput("");
        setHostSecretPassword(null);
        applyRoomSnapshot(res.data);
        setPickedPart5ByRound({});
        setVocabGuess("");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Không thể tham gia phòng.";
      if (msg.toLowerCase().includes("mật khẩu")) {
        setPwdModalRoomCode(roomCode.trim().toUpperCase());
      }
      Alert.alert("Vào phòng thất bại", msg);
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleJoinRoomCard = (room: ArenaRoomItem) => {
    if (room.hasPassword || room.isPrivate) {
      setPwdInput("");
      setPwdModalRoomCode(room.roomCode);
    } else {
      void attemptJoinRoom(room.roomCode);
    }
  };

  const handleFindRandomMatch = async () => {
    if (!auth.accessToken) return;
    try {
      setSearchWaitedSec(0);
      setSearching(true);
      const res = await joinArenaMatchmaking(auth.accessToken, {
        mode: selectedMode,
        questionCount,
      });
      const data = res.data;
      if (data?.status === "MATCHED" && data.room) {
        setSearching(false);
        applyRoomSnapshot(data.room);
        setPickedPart5ByRound({});
        setVocabGuess("");
      }
    } catch (error) {
      setSearching(false);
      Alert.alert("Ghép trận", error instanceof Error ? error.message : "Không thể vào hàng đợi ghép trận.");
    }
  };

  const handleCancelSearch = async () => {
    setSearching(false);
    if (!auth.accessToken) return;
    try {
      await leaveArenaMatchmaking(auth.accessToken);
    } catch {
      // Ignore cancel cleanup errors
    }
  };

  const handleExitActiveRoom = async () => {
    if (!activeRoom) return;
    const code = activeRoom.roomCode;
    const shouldCallLeave = auth.accessToken && activeRoom.status !== "FINISHED";
    applyRoomSnapshot(null);
    setHostSecretPassword(null);
    if (shouldCallLeave && auth.accessToken) {
      try {
        await leaveArenaRoom(auth.accessToken, code);
      } catch {
        // Ignore leave errors cleanly
      }
    }
    void loadLobby();
  };

  const handleSubmitPart5 = async (questionId: number, optionLabel: string) => {
    if (!auth.accessToken || !activeRoom || activeRoom.roundPhase !== "QUESTION") return;
    const rIdx = activeRoom.currentRoundIndex;
    if (pickedPart5ByRound[rIdx] !== undefined || submittingAnswer) return;

    setPickedPart5ByRound((prev) => ({ ...prev, [rIdx]: optionLabel }));
    try {
      setSubmittingAnswer(true);
      const res = await submitArenaAnswer(auth.accessToken, activeRoom.roomCode, {
        questionId,
        roundIndex: rIdx,
        selectedLabel: optionLabel,
      });
      if (res.data) {
        applyRoomSnapshot(res.data);
        if (res.data.status === "FINISHED") {
          void loadLobby();
        }
      }
    } catch (error) {
      Alert.alert("Đấu trường", error instanceof Error ? error.message : "Không gửi được đáp án.");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleSubmitVocab = async (questionId: number) => {
    const clean = vocabGuess.trim();
    if (!auth.accessToken || !activeRoom || !clean || activeRoom.roundPhase !== "QUESTION" || submittingAnswer) {
      return;
    }
    try {
      setSubmittingAnswer(true);
      const res = await submitArenaAnswer(auth.accessToken, activeRoom.roomCode, {
        questionId,
        roundIndex: activeRoom.currentRoundIndex,
        textAnswer: clean,
      });
      if (res.data) {
        applyRoomSnapshot(res.data);
        if (res.data.roundPhase === "REVEAL" || res.data.status === "FINISHED") {
          setVocabGuess("");
          setWrongGuessAlert(false);
        } else {
          // Wrong guess: immediately clear input box and refocus so user can re-type cleanly
          setVocabGuess("");
          setWrongGuessAlert(true);
          setTimeout(() => vocabInputRef.current?.focus(), 40);
        }
        if (res.data.status === "FINISHED") {
          void loadLobby();
        }
      }
    } catch (error) {
      Alert.alert("Đấu trường", error instanceof Error ? error.message : "Không gửi được từ vựng.");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleSaveRevealWord = async () => {
    if (!auth.accessToken || !activeRoom?.currentRevealWord) return;
    const word = activeRoom.currentRevealWord.trim();
    if (savedWordsMap[word.toLowerCase()]) return;
    const q = activeRoom.questions?.[activeRoom.currentRoundIndex];
    try {
      await createMyFlashcard(auth.accessToken, {
        englishWord: word,
        exampleSentence: q?.maskedExample?.replace(/\*+/g, word) || undefined,
        meaningVi: activeRoom.currentRevealMeaningVi || q?.explanation || word,
        pronunciation: q?.pronunciation || undefined,
      });
      setSavedWordsMap((prev) => ({ ...prev, [word.toLowerCase()]: true }));
    } catch (err) {
      Alert.alert("Lưu từ vựng", err instanceof Error ? err.message : "Không thể lưu vào Flashcards.");
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        setCopiedHint(true);
        setTimeout(() => setCopiedHint(false), 1800);
        return;
      }
      await Share.share({
        message: `Tham gia phòng Solo TOEIC của tôi! Mã phòng: ${code}${
          hostSecretPassword ? ` • Mật khẩu: ${hostSecretPassword}` : ""
        }`,
      });
    } catch {
      Alert.alert("Mã phòng", `Mã phòng của bạn là: ${code}`);
    }
  };

  const orderedPlayers = useMemo(() => {
    const list = activeRoom?.players ?? [];
    if (list.length <= 1) return list;
    const mine = list.find((p) => p.email.toLowerCase() === myEmail);
    const opp = list.find((p) => p.email.toLowerCase() !== myEmail);
    return mine && opp ? [mine, opp] : list;
  }, [activeRoom?.players, myEmail]);

  const myDiamonds = leaderboard?.myDiamonds ?? auth.user?.diamonds ?? 50;

  // =========================================================================
  // VIEW A: SEARCHING FOR OPPONENT (RANDOM MATCHMAKING)
  // =========================================================================
  if (searching && !activeRoom) {
    return (
      <UserScreen hasTabDock={false}>
        <AppHeader
          leftIcon="chevron-back-outline"
          onLeftPress={() => void handleCancelSearch()}
          rightSlot={
            <View style={styles.diamondHeaderPill}>
              <Ionicons color="#38BDF8" name="diamond" size={14} />
              <Text style={styles.diamondHeaderText}>{myDiamonds}</Text>
            </View>
          }
          subtitle={selectedMode === "VOCAB" ? "Chế độ Từ vựng 1v1" : "Chế độ Part 5 1v1"}
          title="Tìm trận ngẫu nhiên"
        />

        <SurfaceCard style={styles.searchingCard}>
          <View style={styles.searchingPulseCircle}>
            <Ionicons color={colors.primary} name="flash" size={40} />
          </View>
          <Text style={[styles.searchingTitle, { fontSize: rf(19) }]}>
            Đang tìm đối thủ...
          </Text>
          <Text style={styles.searchingSub}>
            Hệ thống sẽ ghép tự động khi có người thứ 2 cùng tìm chế độ{" "}
            <Text style={{ color: colors.primary, fontWeight: "900" }}>
              {selectedMode === "VOCAB" ? "Từ vựng" : "TOEIC Part 5"}
            </Text>
          </Text>
          <View style={styles.waitClockPill}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.waitClockText}>Đã chờ {searchWaitedSec}s</Text>
          </View>

          <LiquidButton
            label="Hủy tìm trận"
            onPress={() => void handleCancelSearch()}
            style={{ marginTop: 10, minWidth: 160 }}
            variant="glass"
          />
        </SurfaceCard>
      </UserScreen>
    );
  }

  // =========================================================================
  // VIEW B: ACTIVE ROOM (WAITING LOBBY / LIVE MATCH / FINISHED SUMMARY)
  // =========================================================================
  if (activeRoom) {
    const player1: ArenaPlayerState | undefined = orderedPlayers[0];
    const player2: ArenaPlayerState | undefined = orderedPlayers[1];
    const totalQ = activeRoom.totalQuestions || activeRoom.questions?.length || 10;
    const currentRoundIdx = activeRoom.currentRoundIndex ?? 0;
    const currentQ = activeRoom.questions?.[currentRoundIdx];
    const isVocabMode = activeRoom.mode === "VOCAB";
    const isReveal = activeRoom.roundPhase === "REVEAL";
    const roundDuration = Math.max(1, activeRoom.roundDurationSeconds || (isVocabMode ? 20 : 15));
    const displayRemainingSec = Math.max(0, (activeRoom.remainingSeconds ?? 0) - tickOffsetSec);
    const timerPct = Math.max(0, Math.min(100, (displayRemainingSec / roundDuration) * 100));

    // WAITING ROOM ("phải đợi đối thủ vô")
    if (activeRoom.status === "WAITING") {
      return (
        <UserScreen hasTabDock={false}>
          <AppHeader
            leftIcon="chevron-back-outline"
            onLeftPress={() => void handleExitActiveRoom()}
            rightSlot={
              <View style={styles.diamondHeaderPill}>
                <Ionicons color="#38BDF8" name="diamond" size={14} />
                <Text style={styles.diamondHeaderText}>{player1?.diamonds ?? myDiamonds}</Text>
              </View>
            }
            subtitle={isVocabMode ? "Từ vựng 1v1 • Chờ đối thủ" : "TOEIC Part 5 • Chờ đối thủ"}
            title={`Phòng ${activeRoom.roomCode}`}
          />

          <LiquidCard hero style={styles.waitingHeroCard}>
            <View style={styles.waitingBadgeRow}>
              <View style={styles.modeTagPill}>
                <Ionicons color="#FFFFFF" name={isVocabMode ? "book" : "document-text"} size={13} />
                <Text style={styles.modeTagText}>{isVocabMode ? "Từ vựng" : "Part 5"} • {totalQ} câu</Text>
              </View>
              <View style={styles.modeTagPill}>
                <Ionicons color="#FFFFFF" name={activeRoom.isPrivate ? "lock-closed" : "earth"} size={13} />
                <Text style={styles.modeTagText}>{activeRoom.isPrivate ? "Riêng tư (Có MK)" : "Công khai"}</Text>
              </View>
            </View>

            <Text style={styles.waitingCodeBig}>{activeRoom.roomCode}</Text>
            <Pressable onPress={() => void handleCopyCode(activeRoom.roomCode)} style={styles.copyCodeBtn}>
              <Ionicons color="#FFFFFF" name={copiedHint ? "checkmark" : "copy-outline"} size={14} />
              <Text style={styles.copyCodeText}>{copiedHint ? "Đã sao chép mã" : "Sao chép mã phòng"}</Text>
            </Pressable>

            {activeRoom.isPrivate && hostSecretPassword ? (
              <Pressable onPress={() => setShowHostPwd((v) => !v)} style={styles.hostPwdToggle}>
                <Ionicons color="#E0E7FF" name={showHostPwd ? "eye-off-outline" : "eye-outline"} size={14} />
                <Text style={styles.hostPwdText}>
                  Mật khẩu phòng: {showHostPwd ? hostSecretPassword : "•••••• (Chạm để xem)"}
                </Text>
              </Pressable>
            ) : null}
          </LiquidCard>

          <SurfaceCard style={styles.waitingMatchCard}>
            <View style={styles.duelSlotRow}>
              <View style={styles.duelSlotBox}>
                <View style={styles.avatarCirclePrimary}>
                  <Text style={styles.avatarInitial}>{(player1?.fullName?.[0] || "B").toUpperCase()}</Text>
                </View>
                <Text numberOfLines={1} style={styles.slotName}>{player1?.fullName || "Bạn"}</Text>
                <Text style={styles.slotSub}>💎 {player1?.diamonds ?? myDiamonds}</Text>
              </View>

              <View style={styles.vsBadge}>
                <Text style={styles.vsBadgeText}>VS</Text>
              </View>

              <View style={[styles.duelSlotBox, styles.duelSlotEmpty]}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.slotWaitingText}>Đang đợi đối thủ vô...</Text>
              </View>
            </View>

            <Text style={styles.waitNote}>
              Trận đấu sẽ tự động bắt đầu đếm giây ngay khi đối thủ tham gia phòng!
            </Text>

            <LiquidButton
              label="Hủy phòng & Quay lại"
              onPress={() => void handleExitActiveRoom()}
              style={{ marginTop: 6 }}
              variant="glass"
            />
          </SurfaceCard>
        </UserScreen>
      );
    }

    // MATCH FINISHED SCREEN
    if (activeRoom.status === "FINISHED") {
      const me = player1;
      const didWin = activeRoom.winnerEmail && activeRoom.winnerEmail.toLowerCase() === myEmail;
      const isDraw = !activeRoom.winnerEmail;
      return (
        <UserScreen hasTabDock={false}>
          <AppHeader
            leftIcon="chevron-back-outline"
            onLeftPress={() => void handleExitActiveRoom()}
            rightSlot={
              <View style={styles.diamondHeaderPill}>
                <Ionicons color="#38BDF8" name="diamond" size={14} />
                <Text style={styles.diamondHeaderText}>{me?.diamonds ?? myDiamonds}</Text>
              </View>
            }
            subtitle={`Hoàn thành trong ${activeRoom.elapsedMatchSeconds}s`}
            title={`Kết quả • Phòng ${activeRoom.roomCode}`}
          />

          <SurfaceCard style={styles.finishCard}>
            <Ionicons
              color={didWin ? "#F59E0B" : isDraw ? colors.primary : "#94A3B8"}
              name={didWin ? "trophy" : isDraw ? "ribbon" : "sparkles"}
              size={48}
            />
            <Text style={[styles.finishTitle, { fontSize: rf(20) }]}>
              {isDraw ? "Hòa ngang tài ngang sức!" : didWin ? "Bạn đã chiến thắng!" : `${activeRoom.winnerName} chiến thắng!`}
            </Text>
            <Text style={styles.finishScoreLine}>
              Tỷ số: {player1?.roundWins ?? 0} - {player2?.roundWins ?? 0} • Tổng thời gian: {activeRoom.elapsedMatchSeconds}s
            </Text>

            <View style={styles.finishStatsGrid}>
              {(orderedPlayers ?? []).map((p) => (
                <View key={p.email} style={styles.finishPlayerCard}>
                  <Text numberOfLines={1} style={styles.finishPlayerName}>{p.fullName}</Text>
                  <Text style={styles.finishStatText}>Đúng: {p.correctCount}/{totalQ} câu</Text>
                  <Text style={styles.finishStatText}>Tốc độ: {formatReactionSeconds(p.totalResponseMs)}</Text>
                  <Text
                    style={[
                      styles.finishDiamondDelta,
                      { color: p.diamondDelta >= 0 ? "#10B981" : "#EF4444" },
                    ]}
                  >
                    {p.diamondDelta >= 0 ? `+${p.diamondDelta}` : p.diamondDelta} 💎 (Hiện có: {p.diamonds} 💎)
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.finishActionRow}>
              <LiquidButton
                label="Tìm trận mới"
                onPress={() => {
                  applyRoomSnapshot(null);
                  void handleFindRandomMatch();
                }}
                style={{ flex: 1 }}
                variant="primary"
              />
              <LiquidButton
                label="Về Sảnh"
                onPress={() => void handleExitActiveRoom()}
                style={{ flex: 1 }}
                variant="glass"
              />
            </View>
          </SurfaceCard>
        </UserScreen>
      );
    }

    // ACTIVE LIVE DUEL (VOCAB BATTLE or TOEIC PART 5)
    const p1ProgressRatio = totalQ > 0 ? Math.min(1, (player1?.roundWins ?? 0) / totalQ) : 0;
    const p2ProgressRatio = totalQ > 0 ? Math.min(1, (player2?.roundWins ?? 0) / totalQ) : 0;
    const hintChars = (currentQ?.hintMask ?? "_".repeat(currentQ?.wordLength || 6)).split("");
    const revealWord = activeRoom.currentRevealWord || "";
    const revealSaved = Boolean(revealWord && savedWordsMap[revealWord.toLowerCase()]);

    return (
      <UserScreen hasTabDock={false}>
        <AppHeader
          leftIcon="chevron-back-outline"
          onLeftPress={() => void handleExitActiveRoom()}
          rightSlot={
            <View
              style={[
                styles.liveTimerBadge,
                displayRemainingSec <= 5 ? styles.liveTimerBadgeUrgent : null,
              ]}
            >
              <Ionicons color={displayRemainingSec <= 5 ? "#DC2626" : "#EA580C"} name="time" size={14} />
              <Text
                style={[
                  styles.liveTimerBadgeText,
                  displayRemainingSec <= 5 ? { color: "#DC2626" } : null,
                ]}
              >
                {displayRemainingSec}s
              </Text>
            </View>
          }
          subtitle={`${isVocabMode ? "Vocab Battle" : "TOEIC Part 5"} • Tổng ${activeRoom.elapsedMatchSeconds}s`}
          title={`Phòng ${activeRoom.roomCode}`}
        />

        {/* Player Comparison HUD Header (like Parroto screenshot 3-5) */}
        <SurfaceCard padding="sm" style={styles.matchHudCard}>
          <View style={styles.matchHudRow}>
            <View style={styles.hudPlayerCol}>
              <UserAvatarWithFrame
                avatarUrl={player1?.avatarUrl}
                frameId={player1?.equippedFrameId}
                fullName={player1?.fullName || "Bạn"}
                level={player1?.level}
                showCornerBadge={false}
                size={36}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.hudPlayerName}>
                  {player1?.fullName || "Bạn"}
                </Text>
                <View style={styles.hudDiamondRow}>
                  <Ionicons color="#0EA5E9" name="diamond" size={12} />
                  <Text style={styles.hudDiamondNum}>{player1?.diamonds ?? 50}</Text>
                </View>
              </View>
            </View>

            <View style={styles.hudCenterScore}>
              <Text style={styles.hudScoreText}>
                <Text style={{ color: "#7C3AED" }}>{player1?.roundWins ?? 0}</Text>
                {" - "}
                <Text style={{ color: "#059669" }}>{player2?.roundWins ?? 0}</Text>
              </Text>
              <Text style={styles.hudScoreCaption}>Score</Text>
            </View>

            <View style={[styles.hudPlayerCol, { justifyContent: "flex-end" }]}>
              <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
                <Text numberOfLines={1} style={styles.hudPlayerName}>
                  {player2?.fullName || "Đối thủ"}
                </Text>
                <View style={styles.hudDiamondRow}>
                  <Text style={styles.hudDiamondNum}>{player2?.diamonds ?? 50}</Text>
                  <Ionicons color="#0EA5E9" name="diamond" size={12} />
                </View>
              </View>
              <UserAvatarWithFrame
                avatarUrl={player2?.avatarUrl}
                frameId={player2?.equippedFrameId}
                fullName={player2?.fullName || "O"}
                level={player2?.level}
                showCornerBadge={false}
                size={36}
              />
            </View>
          </View>
        </SurfaceCard>

        {/* Round badge & live language toggle row */}
        <View style={styles.roundHeaderWrap}>
          <View style={styles.roundInfoRow}>
            <View style={styles.roundPillBadge}>
              <Text style={styles.roundPillText}>
                Round {currentRoundIdx + 1}/{totalQ}
              </Text>
            </View>
            <View style={styles.langSelectorWrap}>
              <Pressable
                accessibilityLabel="Đổi ngôn ngữ hiển thị"
                accessibilityRole="button"
                onPress={() => setLangMenuOpen((prev) => !prev)}
                style={styles.langPillBtn}
              >
                <Text style={styles.langCodeBadge}>
                  {displayLang === "VI" ? "VN" : "GB"}
                </Text>
                <Text style={styles.langPillLabel}>
                  {displayLang === "VI" ? "Tiếng Việt" : "English"}
                </Text>
                <Ionicons
                  color={colors.textMuted}
                  name={langMenuOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                />
              </Pressable>
              {langMenuOpen ? (
                <View style={styles.langDropdownCard}>
                  <Pressable
                    onPress={() => {
                      setDisplayLang("EN");
                      setLangMenuOpen(false);
                    }}
                    style={[
                      styles.langDropdownItem,
                      displayLang === "EN" ? styles.langDropdownItemActive : null,
                    ]}
                  >
                    <Text style={styles.langCodeBadge}>GB</Text>
                    <Text style={styles.langDropdownText}>English</Text>
                    {displayLang === "EN" ? (
                      <Ionicons color={colors.primary} name="checkmark" size={14} />
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setDisplayLang("VI");
                      setLangMenuOpen(false);
                    }}
                    style={[
                      styles.langDropdownItem,
                      displayLang === "VI" ? styles.langDropdownItemActive : null,
                    ]}
                  >
                    <Text style={styles.langCodeBadge}>VN</Text>
                    <Text style={styles.langDropdownText}>Tiếng Việt</Text>
                    {displayLang === "VI" ? (
                      <Ionicons color={colors.primary} name="checkmark" size={14} />
                    ) : null}
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
          {activeRoom.feedbackMessage ? (
            <Text numberOfLines={1} style={styles.roundFeedbackInline}>
              {activeRoom.feedbackMessage}
            </Text>
          ) : (
            <Text style={styles.roundModeSubLabel}>
              {isVocabMode ? "Đoán nhanh nhận +💎" : "Chọn nhanh & chính xác"}
            </Text>
          )}
        </View>

        {/* Battle Arena Split: Vertical Space Race Track + Question Stage Card */}
        <View style={styles.battleArenaRow}>
          {/* Space Race Rocket Track (like screenshots 3-5) */}
          <View style={styles.raceTrackCol}>
            <Ionicons color="#FBBF24" name="flag" size={14} />
            <Text style={styles.raceFinishNum}>{totalQ}</Text>
            <View style={styles.raceLineWrap}>
              <View style={styles.raceDottedLine} />
              <View style={[styles.rocketDot, styles.rocketDotP1, { bottom: `${Math.round(p1ProgressRatio * 82)}%` }]}>
                <Ionicons color="#FFFFFF" name="rocket" size={12} />
              </View>
              <View style={[styles.rocketDot, styles.rocketDotP2, { bottom: `${Math.round(p2ProgressRatio * 82)}%` }]}>
                <Ionicons color="#FFFFFF" name="rocket" size={12} />
              </View>
            </View>
            <Text style={styles.raceStartTxt}>START</Text>
          </View>

          {/* Main Question / Reveal Stage */}
          <SurfaceCard padding="sm" style={styles.questionStageCard}>
            {/* Countdown Shrink Progress Bar */}
            <View style={styles.countdownBarBg}>
              <View
                style={[
                  styles.countdownBarFill,
                  {
                    width: `${timerPct}%`,
                    backgroundColor: displayRemainingSec <= 5 ? "#EF4444" : "#F97316",
                  },
                ]}
              />
            </View>

            {currentQ && isVocabMode ? (
              <View style={styles.vocabStageBody}>
                {isReveal ? (
                  <View style={styles.vocabRevealRow}>
                    <Text style={[styles.revealWordText, { fontSize: rf(22) }]}>
                      {revealWord}
                    </Text>
                    <Pressable
                      onPress={() => void handleSaveRevealWord()}
                      style={[styles.saveNotebookBtn, revealSaved && styles.saveNotebookBtnSaved]}
                    >
                      <Ionicons color="#FFFFFF" name={revealSaved ? "checkmark" : "add"} size={14} />
                      <Text style={styles.saveNotebookText}>
                        {revealSaved ? "Đã lưu" : "Lưu từ"}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.letterTilesWrap}>
                    {hintChars.map((ch, idx) => {
                      const revealed = ch !== "_";
                      return (
                        <View key={idx} style={[styles.letterTileBox, revealed && styles.letterTileRevealed]}>
                          <Text style={[styles.letterTileChar, revealed && styles.letterTileCharRevealed]}>
                            {revealed ? ch : ""}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {!isReveal ? (
                  <View style={{ gap: 4 }}>
                    <View style={styles.vocabInputRow}>
                      <TextInput
                        ref={vocabInputRef}
                        autoCapitalize="none"
                        autoCorrect={false}
                        blurOnSubmit={false}
                        onChangeText={(val) => {
                          setVocabGuess(val);
                          if (wrongGuessAlert) setWrongGuessAlert(false);
                        }}
                        onSubmitEditing={() => void handleSubmitVocab(currentQ.questionId)}
                        placeholder={`Nhập từ tiếng Anh (${currentQ.wordLength ?? hintChars.length} chữ)...`}
                        placeholderTextColor={colors.textMuted}
                        returnKeyType="send"
                        style={[styles.vocabInputBox, wrongGuessAlert && styles.vocabInputBoxError]}
                        value={vocabGuess}
                      />
                      <LiquidButton
                        compact
                        disabled={submittingAnswer || !vocabGuess.trim()}
                        label="Gửi"
                        onPress={() => void handleSubmitVocab(currentQ.questionId)}
                        variant="primary"
                      />
                    </View>
                    {wrongGuessAlert ? (
                      <Text style={styles.wrongGuessHint}>Sai rồi — ô nhập đã xóa, hãy thử lại!</Text>
                    ) : null}
                  </View>
                ) : null}

                {isReveal && activeRoom.currentRevealMeaningVi ? (
                  <View style={styles.revealViBox}>
                    <Text style={styles.revealViText}>🇻🇳 {activeRoom.currentRevealMeaningVi}</Text>
                  </View>
                ) : displayLang === "VI" && currentQ.meaningVi ? (
                  <View style={styles.translationHintBox}>
                    <Ionicons color={colors.isDark ? "#93C5FD" : "#1D4ED8"} name="language" size={16} />
                    <Text style={styles.translationHintText}>
                      <Text style={styles.translationHintLabel}>Translation: </Text>
                      <Text style={styles.translationHintValue}>{currentQ.meaningVi}</Text>
                    </Text>
                  </View>
                ) : null}

                <View style={styles.clueLineRow}>
                  <Ionicons color="#D97706" name="book-outline" size={16} style={{ marginTop: 2 }} />
                  <Text style={styles.clueText}>
                    <Text style={styles.clueLabelOrange}>Explanation: </Text>
                    {displayLang === "VI"
                      ? currentQ.explanationVi || currentQ.explanation || currentQ.questionText
                      : currentQ.explanation || currentQ.questionText}
                  </Text>
                </View>

                {currentQ.maskedExample ? (
                  <View style={styles.clueLineRow}>
                    <Ionicons color="#059669" name="chatbox-ellipses-outline" size={16} style={{ marginTop: 2 }} />
                    <View style={styles.exampleCol}>
                      <Text style={styles.clueText}>
                        <Text style={styles.clueLabelGreen}>Example: </Text>
                        {isReveal && revealWord
                          ? currentQ.maskedExample.replace(/\*+/g, revealWord)
                          : currentQ.maskedExample}
                      </Text>
                      {displayLang === "VI" && currentQ.exampleTranslation ? (
                        <Text style={styles.exampleViSubtext}>
                          {currentQ.exampleTranslation}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                <View style={styles.clueLineRow}>
                  <Ionicons color="#7C3AED" name="pricetag-outline" size={16} style={{ marginTop: 1 }} />
                  <Text style={styles.clueText}>
                    <Text style={styles.clueLabelPurple}>Type: </Text>
                    {currentQ.partOfSpeech || "word"}
                  </Text>
                </View>

                {currentQ.pronunciation && activeRoom.audioHintUnlocked ? (
                  <View style={styles.pronounceUnlockedCard}>
                    <Ionicons color="#E11D48" name="volume-high" size={16} />
                    <Text style={styles.clueText}>
                      <Text style={styles.clueLabelPink}>Pronunciation: </Text>
                      {currentQ.pronunciation}
                    </Text>
                    {activeRoom.audioHintWord || revealWord ? (
                      <Pressable
                        onPress={() => void speakText((activeRoom.audioHintWord || revealWord) ?? "")}
                        style={styles.speakMiniBtn}
                      >
                        <Ionicons color="#E11D48" name="volume-high" size={15} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : !isReveal ? (
                  <View style={styles.pronounceRow}>
                    <Ionicons color={colors.textMuted} name="volume-mute-outline" size={15} />
                    <Text style={styles.pronounceLockedText}>
                      Phiên âm & âm thanh sẽ mở ở {activeRoom.audioHintUnlockAtSeconds || 7}s cuối nếu chưa ai đoán được
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : currentQ ? (
              <View style={styles.vocabStageBody}>
                <Text style={styles.counterText}>
                  Câu {currentRoundIdx + 1}/{totalQ} • TOEIC Part 5
                </Text>
                <Text style={[styles.questionPrompt, { fontSize: rf(15.5), lineHeight: rf(23) }]}>
                  {currentQ.questionText}
                </Text>

                {displayLang === "VI" && currentQ.questionTranslationVi ? (
                  <View style={styles.translationHintBox}>
                    <Ionicons color={colors.isDark ? "#93C5FD" : "#1D4ED8"} name="language" size={15} />
                    <Text style={styles.translationHintText}>
                      <Text style={styles.translationHintLabel}>Dịch câu: </Text>
                      <Text style={styles.translationHintValue}>{currentQ.questionTranslationVi}</Text>
                    </Text>
                  </View>
                ) : null}

                <View style={styles.optionsCol}>
                  {(currentQ.options ?? []).map((opt) => {
                    const picked = pickedPart5ByRound[currentRoundIdx] === opt.optionLabel;
                    const correctOpt = isReveal && activeRoom.currentRevealCorrectLabel === opt.optionLabel;
                    const wrongOpt = isReveal && picked && activeRoom.currentRevealCorrectLabel !== opt.optionLabel;
                    return (
                      <Pressable
                        key={opt.optionLabel}
                        disabled={isReveal || pickedPart5ByRound[currentRoundIdx] !== undefined || submittingAnswer}
                        onPress={() => void handleSubmitPart5(currentQ.questionId, opt.optionLabel)}
                        style={[
                          styles.optionBtn,
                          picked ? styles.optionBtnPicked : null,
                          correctOpt ? styles.optionBtnCorrect : null,
                          wrongOpt ? styles.optionBtnWrong : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.optCircle,
                            picked ? styles.optCirclePicked : null,
                            correctOpt ? styles.optCircleCorrect : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionLabel,
                              picked || correctOpt ? styles.optionLabelPicked : null,
                            ]}
                          >
                            {opt.optionLabel}
                          </Text>
                        </View>
                        <Text style={styles.optionText}>{opt.optionText}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {isReveal && activeRoom.currentRevealExplanation ? (
                  <View style={styles.revealViBox}>
                    <Text style={styles.revealViText}>💡 {activeRoom.currentRevealExplanation}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </SurfaceCard>
        </View>
      </UserScreen>
    );
  }

  // =========================================================================
  // VIEW C: LOBBY (MODE PICKER, RANDOM FIND MATCH, PUBLIC/PRIVATE ROOM, LEADERBOARD)
  // =========================================================================
  const lbEntries = leaderboard?.entries ?? [];

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/home")}
        rightSlot={
          <View style={styles.diamondHeaderPill}>
            <Ionicons color="#38BDF8" name="diamond" size={14} />
            <Text style={styles.diamondHeaderText}>{myDiamonds}</Text>
          </View>
        }
        subtitle="Part 5 & Từ vựng • Tính giây & Kim cương"
        title="Đấu trường 1v1"
      />

      {/* Mode & Question Count Selection */}
      <SurfaceCard style={styles.modeSelectorCard}>
        <Text style={styles.sectionMiniLabel}>Chọn chế độ thi đấu</Text>
        <View style={styles.modeCardsRow}>
          <Pressable
            onPress={() => setSelectedMode("VOCAB")}
            style={[styles.modePickBtn, selectedMode === "VOCAB" && styles.modePickBtnActive]}
          >
            <Ionicons
              color={selectedMode === "VOCAB" ? colors.primary : colors.textMuted}
              name="sparkles"
              size={20}
            />
            <Text style={[styles.modePickTitle, selectedMode === "VOCAB" && { color: colors.primary }]}>
              Từ vựng 1v1
            </Text>
            <Text style={styles.modePickSub}>20s/vòng • Đoán ô chữ</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedMode("PART5")}
            style={[styles.modePickBtn, selectedMode === "PART5" && styles.modePickBtnActive]}
          >
            <Ionicons
              color={selectedMode === "PART5" ? colors.primary : colors.textMuted}
              name="document-text"
              size={20}
            />
            <Text style={[styles.modePickTitle, selectedMode === "PART5" && { color: colors.primary }]}>
              TOEIC Part 5
            </Text>
            <Text style={styles.modePickSub}>15s/vòng • Trắc nghiệm</Text>
          </Pressable>
        </View>

        <View style={styles.countPillsRow}>
          <Text style={styles.countRowLabel}>Số vòng:</Text>
          {[5, 10].map((cnt) => (
            <Pressable
              key={cnt}
              onPress={() => setQuestionCount(cnt)}
              style={[styles.countChip, questionCount === cnt && styles.countChipActive]}
            >
              <Text style={[styles.countChipText, questionCount === cnt && styles.countChipTextActive]}>
                {cnt} câu
              </Text>
            </Pressable>
          ))}
        </View>
      </SurfaceCard>

      {/* Cách 2: Tìm trận ngẫu nhiên (Find Match) */}
      <LiquidCard hero style={styles.findMatchCard}>
        <View style={styles.findMatchTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.lobbyEyebrow}>CÁCH 2 • GHÉP NGẪU NHIÊN</Text>
            <Text style={[styles.lobbyTitle, { fontSize: rf(18) }]}>
              Tìm đối thủ trực tuyến
            </Text>
            <Text style={styles.findMatchDesc}>
              Hai người bấm tìm trận cùng lúc sẽ tự ghép vào phòng đấu {selectedMode === "VOCAB" ? "Từ vựng" : "Part 5"} ngay!
            </Text>
          </View>
        </View>
        <LiquidButton
          label="Tìm trận ngẫu nhiên (Find Match)"
          leftIcon={<Ionicons color={colors.onPrimary} name="flash" size={16} />}
          onPress={() => void handleFindRandomMatch()}
          style={{ marginTop: 12 }}
          variant="accent"
        />
      </LiquidCard>

      {/* Cách 1: Tạo phòng Công khai / Riêng tư (có mật khẩu) & Đợi đối thủ */}
      <SurfaceCard style={styles.createRoomCard}>
        <Text style={styles.sectionMiniLabel}>Cách 1 • Tạo phòng & Đợi đối thủ vô</Text>

        <View style={styles.privacyToggleRow}>
          <Pressable
            onPress={() => setCreatePrivate(false)}
            style={[styles.privacyChoiceBtn, !createPrivate && styles.privacyChoiceBtnActive]}
          >
            <Ionicons color={!createPrivate ? colors.primary : colors.textMuted} name="earth" size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyTitle}>Công khai (Public)</Text>
              <Text style={styles.privacySub}>Ai cũng thấy phòng</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setCreatePrivate(true)}
            style={[styles.privacyChoiceBtn, createPrivate && styles.privacyChoiceBtnActive]}
          >
            <Ionicons color={createPrivate ? colors.primary : colors.textMuted} name="lock-closed" size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.privacyTitle}>Riêng tư (Private)</Text>
              <Text style={styles.privacySub}>Cần mật khẩu</Text>
            </View>
          </Pressable>
        </View>

        {createPrivate ? (
          <TextInput
            onChangeText={setCreatePassword}
            placeholder="Đặt mật khẩu phòng (VD: 1234)"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.roomPasswordInput}
            value={createPassword}
          />
        ) : null}

        <LiquidButton
          label={`Tạo phòng ${createPrivate ? "Riêng tư 🔒" : "Công khai"} (${questionCount} câu)`}
          leftIcon={<Ionicons color={colors.onPrimary} name="add-circle" size={17} />}
          onPress={() => void handleCreateRoom()}
          variant="primary"
        />

        <View style={styles.joinByCodeRow}>
          <TextInput
            autoCapitalize="characters"
            onChangeText={setJoinCode}
            placeholder="Nhập mã phòng (VD: A1B2C3)"
            placeholderTextColor={colors.textMuted}
            style={styles.joinCodeLightInput}
            value={joinCode}
          />
          <LiquidButton
            compact
            label="Vào mã"
            onPress={() => {
              const clean = joinCode.trim().toUpperCase();
              const matched = rooms.find((r) => r.roomCode === clean);
              if (matched?.hasPassword || matched?.isPrivate) {
                setPwdInput("");
                setPwdModalRoomCode(clean);
              } else {
                void attemptJoinRoom(clean);
              }
            }}
            variant="glass"
          />
        </View>
      </SurfaceCard>

      {/* Active Waiting Rooms */}
      <SectionTitle actionLabel="Làm mới" onActionPress={() => void loadLobby()} title="Phòng đang mở" />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : rooms.length === 0 ? (
        <SurfaceCard style={{ marginBottom: 16 }}>
          <Text style={styles.emptyText}>Chưa có phòng chờ nào. Bấm Tạo phòng hoặc Tìm trận ngẫu nhiên!</Text>
        </SurfaceCard>
      ) : (
        <View style={styles.roomList}>
          {rooms.map((r) => (
            <SurfaceCard key={r.roomCode} padding="sm" style={styles.roomRow}>
              <View style={styles.playerInfo}>
                <View style={styles.roomTitleLine}>
                  {r.hasPassword || r.isPrivate ? (
                    <Ionicons color="#F59E0B" name="lock-closed" size={14} />
                  ) : null}
                  <Text numberOfLines={1} style={styles.roomName}>
                    {r.roomCode} • {r.hostName}
                  </Text>
                </View>
                <Text style={styles.roomMeta}>
                  {r.mode === "VOCAB" ? "Từ vựng" : "Part 5"} • {r.players.length}/2 người •{" "}
                  {r.status === "WAITING" ? "Đang đợi" : "Đang đấu"}
                </Text>
              </View>
              <LiquidButton
                compact
                disabled={r.players.length >= 2 && !r.players.some((p) => p.email.toLowerCase() === myEmail)}
                label={r.hasPassword ? "🔒 Vào" : "Tham gia"}
                onPress={() => handleJoinRoomCard(r)}
                variant="primary"
              />
            </SurfaceCard>
          ))}
        </View>
      )}

      {/* Solo ELO Leaderboard (Separate from Weekly Study Diamonds) */}
      <SectionTitle
        actionLabel="BXH Tổng Tuần"
        onActionPress={() => pushRoute("/user/leaderboard")}
        title="Bảng xếp hạng Solo (ELO)"
      />
      <SurfaceCard style={styles.leaderboardCard}>
        {lbEntries.length === 0 ? (
          <Text style={styles.emptyText}>Chưa có dữ liệu bảng xếp hạng Solo.</Text>
        ) : (
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ maxHeight: 280 }}>
            {lbEntries.map((item) => (
              <Pressable
                key={item.userId}
                onPress={() => setInspectUserId(item.userId)}
                style={styles.lbRow}
              >
                <Text style={styles.lbRank}>
                  {item.rank === 1 ? "🥇" : item.rank === 2 ? "🥈" : item.rank === 3 ? "🥉" : `#${item.rank}`}
                </Text>
                <UserAvatarWithFrame
                  avatarUrl={item.avatarUrl}
                  frameId={item.equippedFrameId}
                  fullName={item.fullName}
                  level={item.level}
                  showCornerBadge={false}
                  size={34}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.lbName}>
                    {item.fullName}
                    {item.username ? <Text style={{ color: colors.primary, fontSize: 11.5 }}> @{item.username}</Text> : null}
                  </Text>
                  <Text style={styles.lbMeta}>
                    {item.wins}W - {item.losses}L • {item.winRate}% • 💎 {item.diamonds}
                  </Text>
                </View>
                <View style={styles.eloPill}>
                  <Text style={styles.eloPillText}>{item.elo}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SurfaceCard>

      <PublicProfileModal
        onClose={() => setInspectUserId(null)}
        onStartDirectChat={(peer) => openDirectChat(peer)}
        userId={inspectUserId}
        visible={inspectUserId !== null}
      />

      {/* Password Join Modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setPwdModalRoomCode(null)}
        transparent
        visible={Boolean(pwdModalRoomCode)}
      >
        <View style={styles.modalBackdrop}>
          <SurfaceCard style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Phòng {pwdModalRoomCode} yêu cầu mật khẩu</Text>
            <TextInput
              autoFocus
              onChangeText={setPwdInput}
              placeholder="Nhập mật khẩu phòng..."
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              style={styles.roomPasswordInput}
              value={pwdInput}
            />
            <View style={styles.finishActionRow}>
              <LiquidButton
                disabled={joiningRoom || !pwdInput.trim()}
                label={joiningRoom ? "Đang kiểm tra..." : "Xác nhận vào phòng"}
                onPress={() => void attemptJoinRoom(pwdModalRoomCode ?? "", pwdInput)}
                style={{ flex: 1 }}
                variant="primary"
              />
              <LiquidButton
                label="Đóng"
                onPress={() => setPwdModalRoomCode(null)}
                variant="glass"
              />
            </View>
          </SurfaceCard>
        </View>
      </Modal>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    diamondHeaderPill: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    diamondHeaderText: { color: colors.text, fontSize: 13, fontWeight: "900" },
    modeSelectorCard: { gap: 10, marginBottom: 14 },
    sectionMiniLabel: { color: colors.text, fontSize: 14, fontWeight: "900" },
    modeCardsRow: { flexDirection: "row", gap: 10 },
    modePickBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1.5,
      flex: 1,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    modePickBtnActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 2,
    },
    modePickTitle: { color: colors.text, fontSize: 13.5, fontWeight: "900" },
    modePickSub: { color: colors.textMuted, fontSize: 11, textAlign: "center" },
    countPillsRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    countRowLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
    countChip: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    countChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    countChipText: { color: colors.text, fontSize: 12, fontWeight: "800" },
    countChipTextActive: { color: colors.onPrimary },
    findMatchCard: { marginBottom: 14 },
    findMatchTop: { flexDirection: "row", gap: 10 },
    lobbyEyebrow: {
      color: "rgba(255,255,255,0.88)",
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 1,
      marginBottom: 4,
    },
    lobbyTitle: { color: colors.heroText, fontWeight: "900" },
    findMatchDesc: { color: colors.heroTextMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
    createRoomCard: { gap: 10, marginBottom: 16 },
    privacyToggleRow: { flexDirection: "row", gap: 10 },
    privacyChoiceBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1.25,
      flex: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    privacyChoiceBtnActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1.75 },
    privacyTitle: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    privacySub: { color: colors.textMuted, fontSize: 11 },
    roomPasswordInput: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1.25,
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
      minHeight: 44,
      paddingHorizontal: 12,
    },
    joinByCodeRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 2 },
    joinCodeLightInput: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1.25,
      color: colors.text,
      flex: 1,
      fontSize: 13.5,
      fontWeight: "800",
      minHeight: 42,
      paddingHorizontal: 12,
    },
    centerBox: { alignItems: "center", paddingVertical: 20 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
    roomList: { gap: 10, marginBottom: 18 },
    roomRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
    playerInfo: { flex: 1, minWidth: 0 },
    roomTitleLine: { alignItems: "center", flexDirection: "row", gap: 5 },
    roomName: { color: colors.text, fontSize: 14, fontWeight: "800" },
    roomMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    leaderboardCard: { gap: 8, marginBottom: 24 },
    lbRow: {
      alignItems: "center",
      borderBottomColor: colors.glassBorder,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      paddingVertical: 9,
    },
    lbRank: { color: colors.text, fontSize: 14, fontWeight: "900", width: 28, textAlign: "center" },
    lbName: { color: colors.text, fontSize: 13.5, fontWeight: "800" },
    lbMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 1 },
    eloPill: {
      backgroundColor: "#FEF3C7",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    eloPillText: { color: "#B45309", fontSize: 12, fontWeight: "900" },
    searchingCard: { alignItems: "center", gap: 12, marginTop: 16, paddingVertical: 30 },
    searchingPulseCircle: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderRadius: 999,
      borderWidth: 2,
      height: 86,
      justifyContent: "center",
      width: 86,
    },
    searchingTitle: { color: colors.text, fontWeight: "900" },
    searchingSub: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingHorizontal: 14, textAlign: "center" },
    waitClockPill: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    waitClockText: { color: colors.text, fontSize: 13, fontWeight: "800" },
    waitingHeroCard: { alignItems: "center", gap: 8, marginBottom: 14 },
    waitingBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
    modeTagPill: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.18)",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    modeTagText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "800" },
    waitingCodeBig: { color: "#FFFFFF", fontSize: 28, fontWeight: "900", letterSpacing: 4, marginTop: 4 },
    copyCodeBtn: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.22)",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    copyCodeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
    hostPwdToggle: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 2 },
    hostPwdText: { color: "#E0E7FF", fontSize: 12, fontWeight: "700" },
    waitingMatchCard: { gap: 14 },
    duelSlotRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    duelSlotBox: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 18,
      borderWidth: 1.5,
      flex: 1,
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 16,
    },
    duelSlotEmpty: { borderStyle: "dashed" },
    avatarCirclePrimary: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 999,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    avatarInitial: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
    slotName: { color: colors.text, fontSize: 13.5, fontWeight: "800" },
    slotSub: { color: "#0EA5E9", fontSize: 12.5, fontWeight: "800" },
    slotWaitingText: { color: colors.textMuted, fontSize: 12, fontWeight: "700", textAlign: "center" },
    vsBadge: {
      alignItems: "center",
      backgroundColor: "#FEF3C7",
      borderRadius: 999,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    vsBadgeText: { color: "#B45309", fontSize: 13, fontWeight: "900" },
    waitNote: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: "center" },
    liveTimerBadge: {
      alignItems: "center",
      backgroundColor: "#FFF7ED",
      borderColor: "#FDBA74",
      borderRadius: radius.pill,
      borderWidth: 1.25,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    liveTimerBadgeUrgent: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
    liveTimerBadgeText: { color: "#EA580C", fontSize: 13, fontWeight: "900" },
    matchHudCard: { borderColor: "#E9D5FF", borderWidth: 1.5, marginBottom: 10 },
    matchHudRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    hudPlayerCol: { alignItems: "center", flex: 1, flexDirection: "row", gap: 7, minWidth: 0 },
    hudAvatarPurple: {
      alignItems: "center",
      backgroundColor: "#7C3AED",
      borderRadius: 999,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    hudAvatarGreen: {
      alignItems: "center",
      backgroundColor: "#059669",
      borderRadius: 999,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    hudAvatarTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
    hudPlayerName: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    hudDiamondRow: { alignItems: "center", flexDirection: "row", gap: 3, marginTop: 1 },
    hudDiamondNum: { color: "#0284C7", fontSize: 12.5, fontWeight: "900" },
    hudCenterScore: { alignItems: "center", minWidth: 56 },
    hudScoreText: { color: colors.text, fontSize: 18, fontWeight: "900" },
    hudScoreCaption: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
    roundHeaderWrap: { gap: 4, marginBottom: 10, position: "relative", zIndex: 40 },
    roundInfoRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 8 },
    roundPillBadge: { backgroundColor: "#EDE9FE", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    roundPillText: { color: "#6D28D9", fontSize: 12, fontWeight: "900" },
    roundFeedbackInline: { color: "#0284C7", fontSize: 12, fontWeight: "800" },
    roundModeSubLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    langSelectorWrap: { position: "relative", zIndex: 50 },
    langPillBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    langCodeBadge: {
      color: colors.textMuted,
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 0.4,
    },
    langPillLabel: { color: colors.text, fontSize: 12, fontWeight: "800" },
    langDropdownCard: {
      backgroundColor: colors.backgroundStrong,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      borderWidth: 1,
      elevation: 10,
      minWidth: 140,
      padding: 4,
      position: "absolute",
      right: 0,
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      top: 34,
      zIndex: 60,
    },
    langDropdownItem: {
      alignItems: "center",
      borderRadius: 8,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    langDropdownItemActive: { backgroundColor: colors.primarySoft },
    langDropdownText: { color: colors.text, flex: 1, fontSize: 12.5, fontWeight: "700" },
    battleArenaRow: { alignItems: "stretch", flexDirection: "row", gap: 8 },
    raceTrackCol: {
      alignItems: "center",
      backgroundColor: "#0F172A",
      borderRadius: 18,
      justifyContent: "space-between",
      paddingVertical: 10,
      width: 42,
    },
    raceFinishNum: { color: "#FBBF24", fontSize: 10.5, fontWeight: "900" },
    raceLineWrap: { alignItems: "center", flex: 1, marginVertical: 6, position: "relative", width: "100%" },
    raceDottedLine: { backgroundColor: "rgba(148,163,184,0.35)", height: "100%", width: 2 },
    rocketDot: {
      alignItems: "center",
      borderRadius: 999,
      height: 20,
      justifyContent: "center",
      position: "absolute",
      width: 20,
    },
    rocketDotP1: { backgroundColor: "#8B5CF6", left: 3 },
    rocketDotP2: { backgroundColor: "#EC4899", right: 3 },
    raceStartTxt: { color: "#94A3B8", fontSize: 8.5, fontWeight: "900" },
    questionStageCard: { flex: 1, gap: 10 },
    countdownBarBg: { backgroundColor: "#E2E8F0", borderRadius: 999, height: 6, overflow: "hidden", width: "100%" },
    countdownBarFill: { borderRadius: 999, height: "100%" },
    vocabStageBody: { gap: 8, paddingTop: 2 },
    letterTilesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "center", marginVertical: 2 },
    letterTileBox: {
      alignItems: "center",
      backgroundColor: "#F3E8FF",
      borderColor: "#D8B4FE",
      borderRadius: 8,
      borderWidth: 1.5,
      height: 31,
      justifyContent: "center",
      width: 25,
    },
    letterTileRevealed: { backgroundColor: "#DCFCE7", borderColor: "#22C55E" },
    letterTileChar: { color: "#581C87", fontSize: 14.5, fontWeight: "900" },
    letterTileCharRevealed: { color: "#15803D" },
    vocabRevealRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginVertical: 4 },
    revealWordText: { color: "#16A34A", fontWeight: "900" },
    saveNotebookBtn: {
      alignItems: "center",
      backgroundColor: "#1E293B",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    saveNotebookBtnSaved: { backgroundColor: "#10B981" },
    saveNotebookText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
    revealViBox: {
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    revealViText: { color: colors.text, fontSize: 13, fontWeight: "700" },
    translationHintBox: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(59, 130, 246, 0.16)" : "rgba(37, 99, 235, 0.08)",
      borderColor: colors.isDark ? "rgba(147, 197, 253, 0.35)" : "rgba(37, 99, 235, 0.25)",
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    translationHintText: { flex: 1, fontSize: 13, lineHeight: 19 },
    translationHintLabel: { color: colors.isDark ? "#93C5FD" : "#1D4ED8", fontWeight: "700" },
    translationHintValue: { color: colors.isDark ? "#DBEAFE" : "#1E40AF", fontWeight: "900" },
    exampleCol: { flex: 1, gap: 3 },
    exampleViSubtext: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600", lineHeight: 18 },
    clueLineRow: { alignItems: "flex-start", flexDirection: "row", gap: 7 },
    pronounceRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    pronounceUnlockedCard: {
      alignItems: "center",
      backgroundColor: "rgba(225, 29, 72, 0.09)",
      borderColor: "rgba(225, 29, 72, 0.35)",
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    pronounceLockedText: { color: colors.textMuted, flex: 1, fontSize: 11.5, fontStyle: "italic" },
    clueText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 19 },
    clueLabelOrange: { color: "#D97706", fontWeight: "900" },
    clueLabelGreen: { color: "#059669", fontWeight: "900" },
    clueLabelPurple: { color: "#7C3AED", fontWeight: "900" },
    clueLabelPink: { color: "#E11D48", fontWeight: "900" },
    speakMiniBtn: {
      alignItems: "center",
      backgroundColor: "#FFE4E6",
      borderRadius: 999,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    vocabInputRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 2 },
    vocabInputBox: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.primary,
      borderRadius: 14,
      borderWidth: 1.5,
      color: colors.text,
      flex: 1,
      fontSize: 14.5,
      fontWeight: "800",
      minHeight: 42,
      paddingHorizontal: 12,
    },
    vocabInputBoxError: { borderColor: "#EF4444", backgroundColor: "rgba(239, 68, 68, 0.08)" },
    wrongGuessHint: { color: "#EF4444", fontSize: 11.5, fontWeight: "800", marginLeft: 4 },
    counterText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
    questionPrompt: { color: colors.text, fontWeight: "800" },
    optionsCol: { gap: 8, marginTop: 2 },
    optionBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1.25,
      flexDirection: "row",
      gap: 9,
      minHeight: 46,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    optionBtnPicked: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 1.75 },
    optionBtnCorrect: { backgroundColor: "#DCFCE7", borderColor: "#16A34A", borderWidth: 2 },
    optionBtnWrong: { backgroundColor: "#FEE2E2", borderColor: "#EF4444", borderWidth: 1.75 },
    optCircle: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    optCirclePicked: { backgroundColor: colors.primary, borderColor: colors.primary },
    optCircleCorrect: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
    optionLabel: { color: colors.text, fontSize: 12.5, fontWeight: "900" },
    optionLabelPicked: { color: "#FFFFFF" },
    optionText: { color: colors.text, flex: 1, fontSize: 13.5, fontWeight: "700" },
    finishCard: { alignItems: "center", gap: 12, marginTop: 8, paddingVertical: 22 },
    finishTitle: { color: colors.text, fontWeight: "900", textAlign: "center" },
    finishScoreLine: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    finishStatsGrid: { flexDirection: "row", gap: 10, marginTop: 4, width: "100%" },
    finishPlayerCard: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1.25,
      flex: 1,
      gap: 4,
      padding: 12,
    },
    finishPlayerName: { color: colors.text, fontSize: 13.5, fontWeight: "900" },
    finishStatText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    finishDiamondDelta: { fontSize: 12.5, fontWeight: "900", marginTop: 2 },
    finishActionRow: { flexDirection: "row", gap: 10, marginTop: 6, width: "100%" },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(15,23,42,0.58)",
      flex: 1,
      justifyContent: "center",
      padding: 20,
    },
    modalSheet: { gap: 12, maxWidth: 420, width: "100%" },
    modalTitle: { color: colors.text, fontSize: 15.5, fontWeight: "900" },
  });
