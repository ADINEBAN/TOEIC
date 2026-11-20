import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname } from "expo-router";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
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

import { LiquidCard } from "@/src/components/ui/LiquidGlass";
import PublicProfileModal from "@/src/components/user/PublicProfileModal";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import { useAuth } from "@/src/hooks/use-auth";
import {
  acceptFriendRequest,
  getChatFriends,
  getCommunityChatMessages,
  getDirectChatMessages,
  removeFriendship,
  searchChatUsers,
  sendCommunityChatMessage,
  sendDirectChatMessage,
  sendFriendRequest,
  unblockChatUser,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { ChatFriendsData, ChatMessageItem, FriendPerson } from "@/src/types/user-api";
import { useResponsiveLayout } from "@/src/utils/responsive";

type PeerStub = {
  userId: number;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  equippedFrameId?: string | null;
  level: number;
};

type ChatOverlayContextValue = {
  openCommunityChat: () => void;
  openDirectChat: (peer: PeerStub) => void;
  fabVisible: boolean;
  setFabVisible: (visible: boolean) => void;
};

const ChatOverlayContext = createContext<ChatOverlayContextValue>({
  openCommunityChat: () => {},
  openDirectChat: () => {},
  fabVisible: true,
  setFabVisible: () => {},
});

export function useFloatingChat() {
  return useContext(ChatOverlayContext);
}

const HUB_ROUTES_WITH_FAB = new Set([
  "/user/home",
  "/user/practice",
  "/user/cards",
  "/user/test",
  "/user/profile",
  "/user/leaderboard",
  "/user/shop",
]);

const QUICK_EMOJIS = ["👋", "🔥", "🎉", "💪", "🏆", "💎", "❤️", "😄"];
const FAB_SIZE = 52;
const FAB_POS_STORAGE_KEY = "toeic_chat_fab_pos_v1";
const FAB_VISIBLE_STORAGE_KEY = "toeic_chat_fab_visible_v1";

function clamp(val: number, min: number, max: number) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, val));
}

function formatRelativeTime(isoString?: string | null) {
  if (!isoString) return "";
  const time = new Date(isoString).getTime();
  if (Number.isNaN(time)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return "vừa xong";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function FloatingChatProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const pathname = usePathname();
  const { theme } = useAppTheme();
  const { dockBottom, dockHeight, height, screenPadding, width } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [open, setOpen] = useState(false);
  const [fabVisible, setFabVisibleState] = useState<boolean>(() => {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(FAB_VISIBLE_STORAGE_KEY);
        if (stored === "false") return false;
      } catch {
        // ignore
      }
    }
    return true;
  });
  const [tab, setTab] = useState<"COMMUNITY" | "FRIENDS">("COMMUNITY");
  const [activePeer, setActivePeer] = useState<PeerStub | null>(null);

  const [communityMsgs, setCommunityMsgs] = useState<ChatMessageItem[]>([]);
  const [directMsgs, setDirectMsgs] = useState<ChatMessageItem[]>([]);
  const [friendsData, setFriendsData] = useState<ChatFriendsData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendPerson[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [showEmojiStrip, setShowEmojiStrip] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const [inspectUserId, setInspectUserId] = useState<number | null>(null);

  const communityListRef = useRef<FlatList<ChatMessageItem>>(null);
  const directListRef = useRef<FlatList<ChatMessageItem>>(null);

  const initialBounds = {
    minX: 8,
    maxX: Math.max(8, width - screenPadding - FAB_SIZE),
    minY: 54,
    maxY: Math.max(54, height - dockBottom - dockHeight - FAB_SIZE - 12),
  };
  const boundsRef = useRef(initialBounds);

  const computeInitialPos = () => {
    const defX = Math.max(8, width - screenPadding - FAB_SIZE);
    const defY = Math.max(54, height - dockBottom - dockHeight - FAB_SIZE - 12);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(FAB_POS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { x?: number; y?: number };
          if (typeof parsed.x === "number" && typeof parsed.y === "number") {
            return {
              x: clamp(parsed.x, 8, defX),
              y: clamp(parsed.y, 54, defY),
            };
          }
        }
      } catch {
        // ignore
      }
    }
    return { x: defX, y: defY };
  };

  const [initialPos] = useState(computeInitialPos);
  const posRef = useRef(initialPos);
  const dragStartRef = useRef({ pageX: 0, pageY: 0 });
  const [pan] = useState(() => new Animated.ValueXY(initialPos));

  useEffect(() => {
    const nextBounds = {
      minX: 8,
      maxX: Math.max(8, width - screenPadding - FAB_SIZE),
      minY: 54,
      maxY: Math.max(54, height - dockBottom - dockHeight - FAB_SIZE - 12),
    };
    boundsRef.current = nextBounds;
    const clampedX = clamp(posRef.current.x, nextBounds.minX, nextBounds.maxX);
    const clampedY = clamp(posRef.current.y, nextBounds.minY, nextBounds.maxY);
    if (clampedX !== posRef.current.x || clampedY !== posRef.current.y) {
      posRef.current = { x: clampedX, y: clampedY };
      pan.setValue(posRef.current);
    }
  }, [dockBottom, dockHeight, height, pan, screenPadding, width]);

  const setFabVisible = useCallback((visible: boolean) => {
    setFabVisibleState(visible);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(FAB_VISIBLE_STORAGE_KEY, String(visible));
      } catch {
        // ignore
      }
    }
  }, []);

  const loadCommunity = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      const res = await getCommunityChatMessages(auth.accessToken, 60);
      setCommunityMsgs(res.data ?? []);
    } catch {
      // ignore polling glitch
    }
  }, [auth.accessToken]);

  const loadFriends = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      const res = await getChatFriends(auth.accessToken);
      setFriendsData(res.data ?? null);
    } catch {
      // ignore transient error
    }
  }, [auth.accessToken]);

  const loadDirect = useCallback(
    async (peerId: number) => {
      if (!auth.accessToken) return;
      try {
        const res = await getDirectChatMessages(auth.accessToken, peerId, 60);
        setDirectMsgs(res.data ?? []);
      } catch (err) {
        Alert.alert("Tin nhắn", err instanceof Error ? err.message : "Không thể tải đoạn chat.");
        setActivePeer(null);
      }
    },
    [auth.accessToken],
  );

  useEffect(() => {
    if (!open || !auth.accessToken) return;
    const initTimer = setTimeout(() => {
      setLoadingMsgs(true);
      const initialLoad = async () => {
        if (tab === "COMMUNITY") {
          await loadCommunity();
        } else if (activePeer) {
          await loadDirect(activePeer.userId);
        } else {
          await loadFriends();
        }
        setLoadingMsgs(false);
      };
      void initialLoad();
    }, 0);

    const timer = setInterval(() => {
      if (tab === "COMMUNITY") {
        void loadCommunity();
      } else if (activePeer) {
        void loadDirect(activePeer.userId);
      } else {
        void loadFriends();
      }
    }, 3200);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, [activePeer, auth.accessToken, loadCommunity, loadDirect, loadFriends, open, tab]);

  useEffect(() => {
    if (!open || tab !== "FRIENDS" || !auth.accessToken) return;
    const trimmed = searchQuery.trim();
    const handle = setTimeout(() => {
      if (!auth.accessToken) return;
      if (!trimmed) {
        setSearchResults([]);
        return;
      }
      setSearchingUsers(true);
      void searchChatUsers(auth.accessToken, trimmed)
        .then((res) => setSearchResults(res.data ?? []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchingUsers(false));
    }, trimmed ? 280 : 0);
    return () => clearTimeout(handle);
  }, [auth.accessToken, open, searchQuery, tab]);

  const openCommunityChat = useCallback(() => {
    setTab("COMMUNITY");
    setActivePeer(null);
    setOpen(true);
  }, []);

  const openDirectChat = useCallback((peer: PeerStub) => {
    setTab("FRIENDS");
    setActivePeer(peer);
    setOpen(true);
  }, []);

  const handleSend = async () => {
    if (!auth.accessToken || !draft.trim() || sending) return;
    const text = draft.trim();
    try {
      setSending(true);
      setDraft("");
      if (tab === "COMMUNITY") {
        const res = await sendCommunityChatMessage(auth.accessToken, text);
        if (res.data) {
          setCommunityMsgs((prev) => [...prev, res.data]);
          setTimeout(() => communityListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      } else if (activePeer) {
        const res = await sendDirectChatMessage(auth.accessToken, activePeer.userId, text);
        if (res.data) {
          setDirectMsgs((prev) => [...prev, res.data]);
          setTimeout(() => directListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      }
    } catch (err) {
      setDraft(text);
      Alert.alert("Chat", err instanceof Error ? err.message : "Không thể gửi tin nhắn.");
    } finally {
      setSending(false);
    }
  };

  const handleAddFriend = async (targetUserId: number) => {
    if (!auth.accessToken) return;
    try {
      const res = await sendFriendRequest(auth.accessToken, { targetUserId });
      setFriendsData(res.data ?? null);
      if (searchQuery.trim()) {
        const searchRes = await searchChatUsers(auth.accessToken, searchQuery.trim());
        setSearchResults(searchRes.data ?? []);
      }
    } catch (err) {
      Alert.alert("Kết bạn", err instanceof Error ? err.message : "Thao tác thất bại.");
    }
  };

  const handleAccept = async (targetUserId: number) => {
    if (!auth.accessToken) return;
    try {
      const res = await acceptFriendRequest(auth.accessToken, targetUserId);
      setFriendsData(res.data ?? null);
    } catch (err) {
      Alert.alert("Bạn bè", err instanceof Error ? err.message : "Không thể chấp nhận.");
    }
  };

  const handleRemove = async (targetUserId: number) => {
    if (!auth.accessToken) return;
    try {
      const res = await removeFriendship(auth.accessToken, targetUserId);
      setFriendsData(res.data ?? null);
    } catch (err) {
      Alert.alert("Bạn bè", err instanceof Error ? err.message : "Thao tác thất bại.");
    }
  };

  const handleUnblock = async (targetUserId: number) => {
    if (!auth.accessToken) return;
    try {
      const res = await unblockChatUser(auth.accessToken, targetUserId);
      setFriendsData(res.data ?? null);
    } catch (err) {
      Alert.alert("Bạn bè", err instanceof Error ? err.message : "Thao tác thất bại.");
    }
  };

  const showFab = Boolean(auth.accessToken) && fabVisible && HUB_ROUTES_WITH_FAB.has(pathname);

  const renderMessageRow = ({ item }: { item: ChatMessageItem }) => {
    if (item.messageType === "SYSTEM_MILESTONE") {
      return (
        <View style={styles.systemRow}>
          <Ionicons color={colors.textMuted} name="information-circle-outline" size={16} />
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    const isMine = Boolean(
      item.mine || (auth.user?.id != null && item.senderId != null && item.senderId === auth.user.id),
    );

    if (isMine) {
      return (
        <View style={styles.msgRowMine}>
          <Pressable
            onPress={() => item.senderId && setInspectUserId(item.senderId)}
            style={styles.msgAvatarWrap}
          >
            <UserAvatarWithFrame
              avatarUrl={item.senderAvatarUrl ?? auth.user?.avatarUrl}
              frameId={item.senderEquippedFrameId ?? auth.user?.equippedFrameId}
              fullName={item.senderFullName || auth.user?.fullName}
              level={item.senderLevel || auth.user?.level || 1}
              size={30}
            />
          </Pressable>
          <View style={styles.msgColMine}>
            <View style={styles.msgMetaRowMine}>
              <Text style={styles.msgTime}>{formatRelativeTime(item.createdAt)}</Text>
              <Text style={styles.msgMineLabel}>Bạn</Text>
            </View>
            <LinearGradient
              colors={[colors.primaryGradient[0], colors.primaryGradient[1]]}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={styles.bubbleMine}
            >
              <Text style={styles.msgContentMine}>{item.content}</Text>
            </LinearGradient>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.msgRowOther}>
        <Pressable
          onPress={() => item.senderId && setInspectUserId(item.senderId)}
          style={styles.msgAvatarWrap}
        >
          <UserAvatarWithFrame
            avatarUrl={item.senderAvatarUrl}
            frameId={item.senderEquippedFrameId}
            fullName={item.senderFullName}
            level={item.senderLevel}
            size={32}
          />
        </Pressable>
        <View style={styles.msgColOther}>
          <View style={styles.msgMetaRowOther}>
            <Pressable onPress={() => item.senderId && setInspectUserId(item.senderId)}>
              <Text style={styles.msgSenderHandle}>@{item.senderUsername}</Text>
            </Pressable>
            <Text style={styles.msgTime}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
          <View style={styles.bubbleOther}>
            <Text style={styles.msgContentOther}>{item.content}</Text>
          </View>
        </View>
      </View>
    );
  };

  const contextValue = useMemo<ChatOverlayContextValue>(
    () => ({ openCommunityChat, openDirectChat, fabVisible, setFabVisible }),
    [fabVisible, openCommunityChat, openDirectChat, setFabVisible],
  );

  return (
    <ChatOverlayContext.Provider value={contextValue}>
      {children}

      {showFab ? (
        <Animated.View
          onMoveShouldSetResponderCapture={(e) => {
            const dx = e.nativeEvent.pageX - dragStartRef.current.pageX;
            const dy = e.nativeEvent.pageY - dragStartRef.current.pageY;
            return Math.abs(dx) > 6 || Math.abs(dy) > 6;
          }}
          onResponderGrant={() => {
            pan.setOffset({ x: posRef.current.x, y: posRef.current.y });
            pan.setValue({ x: 0, y: 0 });
          }}
          onResponderMove={(e) => {
            const dx = e.nativeEvent.pageX - dragStartRef.current.pageX;
            const dy = e.nativeEvent.pageY - dragStartRef.current.pageY;
            const b = boundsRef.current;
            const clampedDx = clamp(posRef.current.x + dx, b.minX, b.maxX) - posRef.current.x;
            const clampedDy = clamp(posRef.current.y + dy, b.minY, b.maxY) - posRef.current.y;
            pan.setValue({ x: clampedDx, y: clampedDy });
          }}
          onResponderRelease={(e) => {
            const dx = e.nativeEvent.pageX - dragStartRef.current.pageX;
            const dy = e.nativeEvent.pageY - dragStartRef.current.pageY;
            pan.flattenOffset();
            const b = boundsRef.current;
            const nextX = clamp(posRef.current.x + dx, b.minX, b.maxX);
            const nextY = clamp(posRef.current.y + dy, b.minY, b.maxY);
            posRef.current = { x: nextX, y: nextY };
            pan.setValue({ x: nextX, y: nextY });
            if (Platform.OS === "web" && typeof localStorage !== "undefined") {
              try {
                localStorage.setItem(FAB_POS_STORAGE_KEY, JSON.stringify({ x: nextX, y: nextY }));
              } catch {
                // ignore
              }
            }
          }}
          onResponderTerminate={() => {
            pan.flattenOffset();
            pan.setValue(posRef.current);
          }}
          onStartShouldSetResponderCapture={(e) => {
            dragStartRef.current = {
              pageX: e.nativeEvent.pageX,
              pageY: e.nativeEvent.pageY,
            };
            return false;
          }}
          style={[
            styles.fabCluster,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Ẩn nút chat nổi (mở lại ở mục Hồ sơ)"
            hitSlop={6}
            onPress={() => setFabVisible(false)}
            style={styles.fabCloseMini}
          >
            <Ionicons color="#EF4444" name="close" size={11} />
          </Pressable>
          <Pressable
            accessibilityLabel="Mở Chat Cộng đồng (kéo để di chuyển)"
            onPress={openCommunityChat}
            style={({ pressed }) => [
              styles.fabButton,
              pressed ? { transform: [{ scale: 0.94 }] } : null,
            ]}
          >
            <LinearGradient
              colors={["#312E81", "#1E1B4B"]}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 99 }]}
            />
            <Ionicons color="#FFFFFF" name="chatbubble-ellipses" size={22} />
          </Pressable>
        </Animated.View>
      ) : null}

      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modalBackdrop, { paddingHorizontal: Math.min(screenPadding, 14) }]}
        >
          <LiquidCard style={[styles.chatSheet, { height: Math.min(640, Math.round(height * 0.8)) }]}>
            {/* Header Tabs */}
            <View style={styles.drawerHeader}>
              <View style={styles.segmentedBar}>
                <Pressable
                  onPress={() => {
                    setTab("COMMUNITY");
                    setActivePeer(null);
                  }}
                  style={[styles.segBtn, tab === "COMMUNITY" ? styles.segBtnActive : null]}
                >
                  <Text style={[styles.segText, tab === "COMMUNITY" ? styles.segTextActive : null]}>
                    CỘNG ĐỒNG
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setTab("FRIENDS");
                    setActivePeer(null);
                  }}
                  style={[styles.segBtn, tab === "FRIENDS" ? styles.segBtnActive : null]}
                >
                  <Text style={[styles.segText, tab === "FRIENDS" ? styles.segTextActive : null]}>
                    BẠN BÈ
                    {friendsData?.incomingRequests?.length
                      ? ` (${friendsData.incomingRequests.length})`
                      : ""}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.headerIcons}>
                <Pressable
                  hitSlop={6}
                  onPress={() => {
                    if (tab === "COMMUNITY") void loadCommunity();
                    else if (activePeer) void loadDirect(activePeer.userId);
                    else void loadFriends();
                  }}
                  style={styles.iconBtn}
                >
                  <Ionicons color={colors.textMuted} name="refresh" size={18} />
                </Pressable>
                <Pressable hitSlop={6} onPress={() => setOpen(false)} style={styles.iconBtn}>
                  <Ionicons color={colors.text} name="close" size={20} />
                </Pressable>
              </View>
            </View>

            {/* Body */}
            {tab === "COMMUNITY" ? (
              <View style={styles.chatPane}>
                {loadingMsgs && communityMsgs.length === 0 ? (
                  <View style={styles.centerBox}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <FlatList
                    ref={communityListRef}
                    contentContainerStyle={styles.msgListContent}
                    data={communityMsgs}
                    keyExtractor={(item) => String(item.id)}
                    onContentSizeChange={() => {
                      if (!showJumpBottom) {
                        communityListRef.current?.scrollToEnd({ animated: false });
                      }
                    }}
                    onScroll={(e) => {
                      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                      const nearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 90;
                      setShowJumpBottom(!nearBottom);
                    }}
                    renderItem={renderMessageRow}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <Text style={styles.emptyText}>Hãy gửi lời chào đầu tiên tới cộng đồng TOEIC!</Text>
                    }
                  />
                )}

                {showJumpBottom ? (
                  <Pressable
                    onPress={() => {
                      setShowJumpBottom(false);
                      communityListRef.current?.scrollToEnd({ animated: true });
                    }}
                    style={styles.jumpDownBtn}
                  >
                    <Ionicons color="#FFFFFF" name="chevron-down" size={18} />
                  </Pressable>
                ) : null}
              </View>
            ) : activePeer ? (
              <View style={styles.chatPane}>
                <View style={styles.dmBanner}>
                  <Pressable onPress={() => setActivePeer(null)} style={styles.dmBackBtn}>
                    <Ionicons color={colors.text} name="arrow-back" size={18} />
                  </Pressable>
                  <UserAvatarWithFrame
                    avatarUrl={activePeer.avatarUrl}
                    frameId={activePeer.equippedFrameId}
                    fullName={activePeer.fullName}
                    level={activePeer.level}
                    size={32}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.dmName}>
                      {activePeer.fullName}
                    </Text>
                    <Text numberOfLines={1} style={styles.dmHandle}>
                      @{activePeer.username}
                    </Text>
                  </View>
                  <Pressable onPress={() => setInspectUserId(activePeer.userId)} style={styles.iconBtn}>
                    <Ionicons color={colors.primary} name="person-circle-outline" size={20} />
                  </Pressable>
                </View>

                <FlatList
                  ref={directListRef}
                  contentContainerStyle={styles.msgListContent}
                  data={directMsgs}
                  keyExtractor={(item) => String(item.id)}
                  onContentSizeChange={() => directListRef.current?.scrollToEnd({ animated: false })}
                  renderItem={renderMessageRow}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <Text style={styles.emptyText}>Bắt đầu trò chuyện cùng @{activePeer.username}!</Text>
                  }
                />
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.friendsScroll} showsVerticalScrollIndicator={false}>
                {/* Search @username */}
                <View style={styles.searchWrap}>
                  <Ionicons color={colors.textMuted} name="search" size={16} />
                  <TextInput
                    autoCapitalize="none"
                    onChangeText={setSearchQuery}
                    placeholder="Tìm bạn theo @username..."
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                    value={searchQuery}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery("")}>
                      <Ionicons color={colors.textMuted} name="close-circle" size={16} />
                    </Pressable>
                  ) : null}
                </View>

                {searchQuery.trim() ? (
                  <View style={styles.friendSection}>
                    <Text style={styles.friendSectionTitle}>KẾT QUẢ TÌM KIẾM</Text>
                    {searchingUsers ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : searchResults.length === 0 ? (
                      <Text style={styles.emptySmall}>Không tìm thấy học viên nào khớp từ khóa: {searchQuery}.</Text>
                    ) : (
                      searchResults.map((p) => (
                        <View key={p.userId} style={styles.friendRow}>
                          <UserAvatarWithFrame
                            avatarUrl={p.avatarUrl}
                            frameId={p.equippedFrameId}
                            fullName={p.fullName}
                            level={p.level}
                            size={36}
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={styles.friendName}>{p.fullName}</Text>
                            <Text numberOfLines={1} style={styles.friendHandle}>@{p.username}</Text>
                          </View>
                          {p.relationStatus === "ACCEPTED" ? (
                            <Pressable
                              onPress={() =>
                                setActivePeer({
                                  userId: p.userId,
                                  fullName: p.fullName,
                                  username: p.username,
                                  avatarUrl: p.avatarUrl,
                                  equippedFrameId: p.equippedFrameId,
                                  level: p.level,
                                })
                              }
                              style={styles.pillPrimary}
                            >
                              <Text style={styles.pillPrimaryTxt}>Nhắn tin</Text>
                            </Pressable>
                          ) : p.relationStatus === "PENDING_OUTGOING" ? (
                            <Text style={styles.statusMuted}>Đã gửi</Text>
                          ) : p.relationStatus === "PENDING_INCOMING" ? (
                            <Pressable onPress={() => void handleAccept(p.userId)} style={styles.pillPrimary}>
                              <Text style={styles.pillPrimaryTxt}>Chấp nhận</Text>
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => void handleAddFriend(p.userId)} style={styles.pillPrimary}>
                              <Text style={styles.pillPrimaryTxt}>+ Kết bạn</Text>
                            </Pressable>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                ) : null}

                {/* Blocked accordion */}
                <Pressable onPress={() => setShowBlocked((b) => !b)} style={styles.blockedToggle}>
                  <Ionicons color={colors.textMuted} name={showBlocked ? "chevron-down" : "chevron-forward"} size={14} />
                  <Ionicons color={colors.textMuted} name="ban-outline" size={14} />
                  <Text style={styles.blockedLabel}>
                    ĐÃ CHẶN ({friendsData?.blockedUsers.length ?? 0})
                  </Text>
                </Pressable>
                {showBlocked ? (
                  <View style={styles.friendSection}>
                    {(friendsData?.blockedUsers ?? []).length === 0 ? (
                      <Text style={styles.emptySmall}>Chưa chặn người dùng nào.</Text>
                    ) : (
                      friendsData?.blockedUsers.map((b) => (
                        <View key={b.userId} style={styles.friendRow}>
                          <Text style={[styles.friendName, { flex: 1 }]}>@{b.username}</Text>
                          <Pressable onPress={() => void handleUnblock(b.userId)} style={styles.pillSecondary}>
                            <Text style={styles.pillSecondaryTxt}>Bỏ chặn</Text>
                          </Pressable>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}

                {/* Incoming requests */}
                {(friendsData?.incomingRequests ?? []).length > 0 ? (
                  <View style={styles.friendSection}>
                    <Text style={styles.friendSectionTitle}>LỜI MỜI KẾT BẠN</Text>
                    {friendsData?.incomingRequests.map((p) => (
                      <View key={p.userId} style={styles.friendRow}>
                        <UserAvatarWithFrame
                          avatarUrl={p.avatarUrl}
                          frameId={p.equippedFrameId}
                          fullName={p.fullName}
                          level={p.level}
                          size={36}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={styles.friendName}>{p.fullName}</Text>
                          <Text numberOfLines={1} style={styles.friendHandle}>@{p.username}</Text>
                        </View>
                        <Pressable onPress={() => void handleAccept(p.userId)} style={styles.pillPrimary}>
                          <Text style={styles.pillPrimaryTxt}>Đồng ý</Text>
                        </Pressable>
                        <Pressable onPress={() => void handleRemove(p.userId)} style={styles.pillSecondary}>
                          <Text style={styles.pillSecondaryTxt}>Từ chối</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Friends list */}
                <View style={styles.friendSection}>
                  <Text style={styles.friendSectionTitle}>BẠN BÈ ({friendsData?.friends.length ?? 0})</Text>
                  {(friendsData?.friends ?? []).length === 0 ? (
                    <Text style={styles.emptyText}>Chưa có bạn bè nào — hãy tìm theo @username ở trên!</Text>
                  ) : (
                    friendsData?.friends.map((f) => (
                      <Pressable
                        key={f.userId}
                        onPress={() =>
                          setActivePeer({
                            userId: f.userId,
                            fullName: f.fullName,
                            username: f.username,
                            avatarUrl: f.avatarUrl,
                            equippedFrameId: f.equippedFrameId,
                            level: f.level,
                          })
                        }
                        style={styles.friendRow}
                      >
                        <UserAvatarWithFrame
                          avatarUrl={f.avatarUrl}
                          frameId={f.equippedFrameId}
                          fullName={f.fullName}
                          level={f.level}
                          size={38}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={styles.friendName}>
                            {f.fullName} <Text style={styles.friendHandle}>@{f.username}</Text>
                          </Text>
                          <Text numberOfLines={1} style={styles.emptySmall}>
                            {f.lastMessagePreview || "Nhấn để trò chuyện 1-1"}
                          </Text>
                        </View>
                        <Ionicons color={colors.primary} name="chatbubble-outline" size={18} />
                      </Pressable>
                    ))
                  )}
                </View>
              </ScrollView>
            )}

            {/* Message composer (Community or Active DM) */}
            {(tab === "COMMUNITY" || activePeer) ? (
              <View style={styles.composerWrap}>
                {showEmojiStrip ? (
                  <View style={styles.emojiStrip}>
                    {QUICK_EMOJIS.map((em) => (
                      <Pressable
                        key={em}
                        onPress={() => setDraft((prev) => `${prev}${em}`)}
                        style={styles.emojiBtn}
                      >
                        <Text style={{ fontSize: 18 }}>{em}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.composerRow}>
                  <TextInput
                    onChangeText={setDraft}
                    onSubmitEditing={() => void handleSend()}
                    placeholder={activePeer ? `Nhắn cho @${activePeer.username}...` : "Nhập tin nhắn cộng đồng..."}
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="send"
                    style={styles.composerInput}
                    value={draft}
                  />
                  <Pressable onPress={() => setShowEmojiStrip((s) => !s)} style={styles.emojiToggleBtn}>
                    <Ionicons color={colors.textMuted} name="happy-outline" size={20} />
                  </Pressable>
                  <Pressable
                    disabled={!draft.trim() || sending}
                    onPress={() => void handleSend()}
                    style={[
                      styles.sendBtn,
                      { backgroundColor: draft.trim() ? colors.primary : colors.surfaceMuted },
                    ]}
                  >
                    <Ionicons color="#FFFFFF" name="send" size={16} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </LiquidCard>
        </KeyboardAvoidingView>
      </Modal>

      <PublicProfileModal
        onClose={() => setInspectUserId(null)}
        onStartDirectChat={(peer) => openDirectChat(peer)}
        userId={inspectUserId}
        visible={inspectUserId !== null}
      />
    </ChatOverlayContext.Provider>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    fabCluster: {
      left: 0,
      position: "absolute",
      top: 0,
      zIndex: 60,
    },
    fabCloseMini: {
      alignItems: "center",
      backgroundColor: "#FFFFFF",
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      elevation: 4,
      height: 18,
      justifyContent: "center",
      left: -4,
      position: "absolute",
      top: -4,
      width: 18,
      zIndex: 2,
    },
    fabButton: {
      alignItems: "center",
      borderColor: "rgba(255,255,255,0.34)",
      borderRadius: 99,
      borderWidth: 1.5,
      elevation: 8,
      height: FAB_SIZE,
      justifyContent: "center",
      overflow: "hidden",
      shadowColor: "#1E1B4B",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.34,
      shadowRadius: 10,
      width: FAB_SIZE,
    },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(15, 23, 42, 0.56)",
      flex: 1,
      justifyContent: "flex-end",
      paddingBottom: 16,
    },
    chatSheet: {
      maxWidth: 460,
      padding: 0,
      width: "100%",
      overflow: "hidden",
    },
    drawerHeader: {
      alignItems: "center",
      borderBottomColor: colors.glassBorder,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    segmentedBar: {
      backgroundColor: colors.glassFill,
      borderRadius: 99,
      flexDirection: "row",
      padding: 3,
    },
    segBtn: { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
    segBtnActive: { backgroundColor: colors.backgroundStrong, elevation: 2 },
    segText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "800" },
    segTextActive: { color: colors.text, fontWeight: "900" },
    headerIcons: { alignItems: "center", flexDirection: "row", gap: 6 },
    iconBtn: { padding: 5 },
    chatPane: { flex: 1, position: "relative" },
    centerBox: { alignItems: "center", flex: 1, justifyContent: "center" },
    msgListContent: { gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
    msgRowOther: {
      alignItems: "flex-end",
      alignSelf: "flex-start",
      flexDirection: "row",
      gap: 8,
      maxWidth: "84%",
    },
    msgRowMine: {
      alignItems: "flex-end",
      alignSelf: "flex-end",
      flexDirection: "row-reverse",
      gap: 8,
      maxWidth: "84%",
    },
    msgAvatarWrap: { paddingBottom: 2 },
    msgColOther: { alignItems: "flex-start", flexShrink: 1, gap: 3 },
    msgColMine: { alignItems: "flex-end", flexShrink: 1, gap: 3 },
    msgMetaRowOther: { alignItems: "center", flexDirection: "row", gap: 6, paddingLeft: 2 },
    msgMetaRowMine: { alignItems: "center", flexDirection: "row", gap: 6, paddingRight: 2 },
    msgSenderHandle: { color: colors.text, fontSize: 11.5, fontWeight: "900" },
    msgMineLabel: { color: colors.primary, fontSize: 11.5, fontWeight: "900" },
    msgTime: { color: colors.textMuted, fontSize: 10.5, fontWeight: "600" },
    bubbleOther: {
      backgroundColor: colors.glassFillStrong,
      borderBottomLeftRadius: 5,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    bubbleMine: {
      borderBottomRightRadius: 5,
      borderRadius: 16,
      elevation: 2,
      paddingHorizontal: 13,
      paddingVertical: 9,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 5,
    },
    msgContentOther: { color: colors.text, fontSize: 13.5, lineHeight: 19 },
    msgContentMine: { color: "#FFFFFF", fontSize: 13.5, lineHeight: 19, fontWeight: "600" },
    systemRow: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: colors.glassFill,
      borderRadius: 12,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    systemText: { color: colors.textMuted, fontSize: 12, fontStyle: "italic", lineHeight: 17, textAlign: "center" },
    emptyText: { color: colors.textMuted, fontSize: 13, paddingVertical: 32, textAlign: "center" },
    emptySmall: { color: colors.textMuted, fontSize: 12 },
    jumpDownBtn: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: colors.primary,
      borderRadius: 99,
      bottom: 10,
      elevation: 4,
      height: 32,
      justifyContent: "center",
      position: "absolute",
      width: 32,
    },
    dmBanner: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderBottomColor: colors.glassBorder,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    dmBackBtn: { padding: 4 },
    dmName: { color: colors.text, fontSize: 13.5, fontWeight: "900" },
    dmHandle: { color: colors.primary, fontSize: 11.5, fontWeight: "700" },
    friendsScroll: { gap: 12, padding: 12 },
    searchWrap: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      borderWidth: 1.25,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    searchInput: { color: colors.text, flex: 1, fontSize: 13.5, minHeight: 30, paddingVertical: 0 },
    blockedToggle: { alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 4 },
    blockedLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: "800" },
    friendSection: { gap: 8 },
    friendSectionTitle: { color: colors.textMuted, fontSize: 11.5, fontWeight: "900", letterSpacing: 0.5 },
    friendRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 8,
    },
    friendName: { color: colors.text, fontSize: 13.5, fontWeight: "800" },
    friendHandle: { color: colors.primary, fontSize: 12, fontWeight: "700" },
    pillPrimary: { backgroundColor: colors.primary, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
    pillPrimaryTxt: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "800" },
    pillSecondary: { backgroundColor: colors.glassFillStrong, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
    pillSecondaryTxt: { color: colors.text, fontSize: 11.5, fontWeight: "800" },
    statusMuted: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    composerWrap: {
      borderTopColor: colors.glassBorder,
      borderTopWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    emojiStrip: { flexDirection: "row", gap: 10, justifyContent: "space-around", marginBottom: 6 },
    emojiBtn: { padding: 4 },
    composerRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    composerInput: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      color: colors.text,
      flex: 1,
      fontSize: 13.5,
      minHeight: 38,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    emojiToggleBtn: { padding: 6 },
    sendBtn: {
      alignItems: "center",
      borderRadius: 99,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
  });
