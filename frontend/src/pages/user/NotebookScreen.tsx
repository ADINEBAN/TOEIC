import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LiquidButton } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  createLessonNote,
  deleteVideoNote,
  getMyVideoNotes,
  getUserLessons,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { UserLessonApiItem, VideoNoteApiItem } from "@/src/types/user-api";
import { pushRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export default function NotebookScreen() {
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { height, insets } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<VideoNoteApiItem[]>([]);
  const [lessons, setLessons] = useState<UserLessonApiItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [timestampInput, setTimestampInput] = useState("0");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);

  const loadNotebookData = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setLoading(true);
      const [notesResp, lessonsResp] = await Promise.allSettled([
        getMyVideoNotes(auth.accessToken),
        getUserLessons(auth.accessToken),
      ]);
      if (notesResp.status === "fulfilled") {
        setNotes(notesResp.value.data ?? []);
      }
      if (lessonsResp.status === "fulfilled") {
        const list = lessonsResp.value.data ?? [];
        setLessons(list);
        if (list.length > 0) {
          setSelectedLessonId((prev) => prev ?? list[0].lessonId);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useEffect(() => {
    void loadNotebookData();
  }, [loadNotebookData]);

  const filteredNotes = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.noteText.toLowerCase().includes(q) ||
        (n.lessonTitle ?? "").toLowerCase().includes(q) ||
        (n.moduleTitle ?? "").toLowerCase().includes(q),
    );
  }, [notes, searchText]);

  const handleSaveNote = async () => {
    if (!auth.accessToken || !selectedLessonId || !noteInput.trim()) {
      Alert.alert("Ghi chú", "Vui lòng chọn bài học và nhập nội dung ghi chú.");
      return;
    }
    try {
      setSaving(true);
      await createLessonNote(auth.accessToken, selectedLessonId, {
        noteText: noteInput.trim(),
        timestampSeconds: Math.max(0, Number.parseInt(timestampInput || "0", 10) || 0),
      });
      setNoteInput("");
      setTimestampInput("0");
      setModalVisible(false);
      await loadNotebookData();
    } catch (error) {
      Alert.alert("Ghi chú", error instanceof Error ? error.message : "Không thể lưu ghi chú.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!auth.accessToken) return;
    try {
      await deleteVideoNote(auth.accessToken, noteId);
      setNotes((prev) => prev.filter((item) => item.id !== noteId));
    } catch (error) {
      Alert.alert("Ghi chú", error instanceof Error ? error.message : "Không thể xóa ghi chú.");
    }
  };

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/home")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0] || "U"} />}
        title="Ghi chú bài giảng"
      />

      <View style={styles.toolbarRow}>
        <TextInput
          onChangeText={setSearchText}
          placeholder="Tìm từ khóa hoặc bài học..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          value={searchText}
        />
        <LiquidButton
          compact
          disabled={lessons.length === 0}
          label="Thêm"
          leftIcon={<Ionicons color={colors.onPrimary} name="add" size={16} />}
          onPress={() => setModalVisible(true)}
          variant="primary"
        />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filteredNotes.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <Ionicons color={colors.primary} name="document-text-outline" size={34} />
          <Text style={styles.emptyTitle}>Chưa có ghi chú nào</Text>
          <Text style={styles.emptySub}>
            Lưu lại điểm ngữ pháp hoặc mẹo TOEIC theo đúng giây trong bài giảng video.
          </Text>
        </SurfaceCard>
      ) : (
        <View style={styles.noteList}>
          {filteredNotes.map((item) => (
            <SurfaceCard key={item.id} padding="sm" style={styles.noteCard}>
              <View style={styles.noteCardTop}>
                <View style={styles.timeBadge}>
                  <Text style={styles.timeBadgeText}>{formatClock(item.timestampSeconds)}</Text>
                </View>
                <View style={styles.noteMetaCol}>
                  <Text numberOfLines={1} style={styles.lessonTitle}>
                    {item.lessonTitle ?? `Bài học #${item.lessonId}`}
                  </Text>
                  {item.moduleTitle ? (
                    <Text numberOfLines={1} style={styles.moduleTitle}>
                      {item.moduleTitle}
                    </Text>
                  ) : null}
                </View>
                <Pressable hitSlop={8} onPress={() => void handleDeleteNote(item.id)}>
                  <Ionicons color={colors.danger} name="trash-outline" size={18} />
                </Pressable>
              </View>

              <Text style={styles.noteContent}>{item.noteText}</Text>

              <Pressable
                onPress={() =>
                  pushRoute(
                    `/user/lesson?moduleId=${item.moduleId ?? ""}&lessonId=${item.lessonId}&seekSeconds=${item.timestampSeconds}`,
                  )
                }
                style={styles.jumpBtn}
              >
                <Ionicons color={colors.primaryDark} name="play-circle-outline" size={15} />
                <Text style={styles.jumpBtnText}>Mở bài học này</Text>
              </Pressable>
            </SurfaceCard>
          ))}
        </View>
      )}

      <Modal animationType="slide" onRequestClose={() => setModalVisible(false)} transparent visible={modalVisible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable onPress={() => setModalVisible(false)} style={styles.dismissSpace} />
          <View
            style={[
              styles.bottomSheet,
              {
                maxHeight: Math.round(height * 0.84),
                paddingBottom: Math.max(insets.bottom, 16) + 10,
              },
            ]}
          >
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.grabber} />
              <Text style={styles.sheetTitle}>Thêm ghi chú bài học mới</Text>

              <Text style={styles.inputLabel}>CHỌN BÀI GIẢNG</Text>
              <View style={styles.lessonChips}>
                {lessons.slice(0, 6).map((l) => {
                  const selected = l.lessonId === selectedLessonId;
                  return (
                    <Pressable
                      key={l.lessonId}
                      onPress={() => setSelectedLessonId(l.lessonId)}
                      style={[styles.lessonChip, selected ? styles.lessonChipActive : null]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.lessonChipText, selected ? styles.lessonChipTextActive : null]}
                      >
                        {l.lessonTitle}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>MỐC THỜI GIAN (GIÂY)</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setTimestampInput}
                placeholder="Ví dụ: 95"
                placeholderTextColor={colors.textMuted}
                style={styles.shortInput}
                value={timestampInput}
              />

              <Text style={styles.inputLabel}>NỘI DUNG GHI CHÚ</Text>
              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={setNoteInput}
                placeholder="Nhập ghi chú..."
                placeholderTextColor={colors.textMuted}
                style={styles.textArea}
                value={noteInput}
              />

              <View style={styles.sheetActions}>
                <LiquidButton
                  compact
                  label="Đóng"
                  onPress={() => setModalVisible(false)}
                  style={{ flex: 1 }}
                  variant="glass"
                />
                <LiquidButton
                  compact
                  disabled={saving}
                  label={saving ? "Đang lưu..." : "Lưu ghi chú"}
                  loading={saving}
                  onPress={() => void handleSaveNote()}
                  style={{ flex: 1 }}
                  variant="primary"
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    toolbarRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    searchInput: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1.25,
      color: colors.text,
      flex: 1,
      fontSize: 13.5,
      minHeight: 42,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    centerBox: {
      alignItems: "center",
      paddingVertical: 32,
    },
    emptyCard: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 28,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
    },
    emptySub: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    noteList: {
      gap: 10,
    },
    noteCard: {
      gap: 6,
    },
    noteCardTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    timeBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    timeBadgeText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
    },
    noteMetaCol: {
      flex: 1,
      minWidth: 0,
    },
    lessonTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
    },
    moduleTitle: {
      color: colors.textMuted,
      fontSize: 11.5,
    },
    noteContent: {
      color: colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    jumpBtn: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      marginTop: 4,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    jumpBtnText: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "800",
    },
    modalOverlay: {
      backgroundColor: "rgba(9,16,32,0.48)",
      flex: 1,
      justifyContent: "flex-end",
    },
    dismissSpace: {
      flex: 1,
    },
    bottomSheet: {
      alignSelf: "center",
      backgroundColor: colors.backgroundStrong,
      borderColor: colors.glassBorder,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: 1,
      maxWidth: 620,
      paddingHorizontal: 20,
      paddingTop: 12,
      width: "100%",
    },
    grabber: {
      alignSelf: "center",
      backgroundColor: colors.glassBorder,
      borderRadius: radius.pill,
      height: 5,
      marginBottom: 14,
      width: 56,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginBottom: 8,
    },
    inputLabel: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "800",
      letterSpacing: 0.8,
      marginBottom: 6,
      marginTop: 10,
    },
    lessonChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    lessonChip: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      maxWidth: "100%",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    lessonChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    lessonChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "700",
    },
    lessonChipTextActive: {
      color: colors.onPrimary,
    },
    shortInput: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.text,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    textArea: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      color: colors.text,
      fontSize: 14,
      minHeight: 100,
      padding: 12,
      textAlignVertical: "top",
    },
    sheetActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
    },
  });
