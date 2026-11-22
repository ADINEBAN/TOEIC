import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import React, { Component, ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { radius, spacing } from "@/src/assets/styles/user-theme";
import { resolvePlayableMediaUrl } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { useVoiceSettings } from "@/src/store/voice-store";
import { useResponsiveLayout } from "@/src/utils/responsive";

type QuestionMediaBlockProps = {
  audioUrl?: string | null;
  imageUrl?: string | null;
  passageText?: string | null;
  questionGroupCode?: string | null;
  showTranscript?: boolean;
  transcript?: string | null;
};

function formatSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

class MediaAudioErrorBoundary extends Component<
  { children: ReactNode; fallbackText: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <Text style={{ color: "#DC3545", fontSize: 12 }}>{this.props.fallbackText}</Text>;
    }
    return this.props.children;
  }
}

function NativeAudioControls({ audioUrl }: { audioUrl: string }) {
  "use no memo";
  const { theme } = useAppTheme();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const player = useAudioPlayer(audioUrl, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [localError, setLocalError] = useState<string | null>(null);

  const isPlaying = status.playing;
  const positionSec = status.currentTime ?? 0;
  const durationSec = status.duration ?? 0;
  const audioLoading = status.isBuffering && !status.isLoaded;
  const errorMessage = localError ?? status.error;

  const handleToggle = () => {
    try {
      setLocalError(null);
      if (status.playing) {
        player.pause();
      } else {
        if (durationSec > 0 && positionSec >= durationSec - 0.3) {
          void player.seekTo(0);
        }
        player.play();
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Không thể phát audio TOEIC.");
    }
  };

  const handleReplay = () => {
    try {
      setLocalError(null);
      void player.seekTo(0);
      player.play();
    } catch {
      // Ignore replay error
    }
  };

  return (
    <>
      <View style={styles.nativeAudioRow}>
        <Pressable onPress={handleToggle} style={styles.playBtn}>
          {audioLoading ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Ionicons
              color={colors.onPrimary}
              name={isPlaying ? "pause" : "play"}
              size={17}
            />
          )}
        </Pressable>
        <Pressable onPress={handleReplay} style={styles.replayBtn}>
          <Ionicons color={colors.primaryDark} name="refresh-outline" size={15} />
          <Text style={styles.replayText}>Nghe lại</Text>
        </Pressable>
        <Text style={styles.timeText}>
          {formatSeconds(positionSec)} / {formatSeconds(durationSec)}
        </Text>
      </View>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </>
  );
}

/**
 * Shared TOEIC rich-media renderer supporting Listening audio, Part 1/7 images,
 * grouped reading passages, and collapsible audio transcripts in review mode.
 */
export default function QuestionMediaBlock({
  audioUrl,
  imageUrl,
  passageText,
  questionGroupCode,
  showTranscript = false,
  transcript,
}: QuestionMediaBlockProps) {
  const { theme } = useAppTheme();
  const { height, rf } = useResponsiveLayout();
  const { isSpeaking, speakText, stopSpeaking } = useVoiceSettings();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const [passageCollapsed, setPassageCollapsed] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [activeReadTarget, setActiveReadTarget] = useState<"passage" | "transcript" | null>(null);

  const isReadingPassage = activeReadTarget === "passage" && isSpeaking;
  const isReadingTranscript = activeReadTarget === "transcript" && isSpeaking;

  const toggleReadText = (target: "passage" | "transcript", text: string) => {
    if (isSpeaking && activeReadTarget === target) {
      stopSpeaking();
      setActiveReadTarget(null);
      return;
    }
    setActiveReadTarget(target);
    void speakText(text);
  };

  const resolvedAudioUrl = resolvePlayableMediaUrl(audioUrl);
  const resolvedImageUrl = resolvePlayableMediaUrl(imageUrl);

  const hasContent = Boolean(
    resolvedAudioUrl ||
      resolvedImageUrl ||
      passageText?.trim() ||
      questionGroupCode?.trim() ||
      (showTranscript && transcript?.trim()),
  );

  if (!hasContent) {
    return null;
  }

  const imageHeight = Math.max(150, Math.min(220, Math.round(height * 0.25)));
  const passageMaxH = Math.max(150, Math.min(220, Math.round(height * 0.26)));

  return (
    <View style={styles.container}>
      {questionGroupCode?.trim() ? (
        <View style={styles.groupBadge}>
          <Ionicons color={colors.primaryDark} name="layers-outline" size={14} />
          <Text style={styles.groupBadgeText}>Nhóm ngữ cảnh: {questionGroupCode.trim()}</Text>
        </View>
      ) : null}

      {resolvedAudioUrl ? (
        <View style={styles.audioBox}>
          <View style={styles.mediaHeaderRow}>
            <Ionicons color={colors.primary} name="headset-outline" size={16} />
            <Text style={styles.mediaTitle}>Audio Listening</Text>
          </View>
          {!/^https?:\/\//i.test(resolvedAudioUrl) ? (
            <Text style={styles.errorText}>
              {`Audio chưa được upload lên server (${resolvedAudioUrl}). Vào Admin → Ngân hàng câu hỏi để upload file .mp3 khớp câu hỏi này.`}
            </Text>
          ) : Platform.OS === "web" ? (
            <View style={styles.webAudioWrap}>
              {React.createElement("audio", {
                controls: true,
                preload: "metadata",
                src: resolvedAudioUrl,
                style: { width: "100%", height: 38 },
              })}
            </View>
          ) : (
            <MediaAudioErrorBoundary fallbackText="Không thể phát trực tiếp audio trên thiết bị này.">
              <NativeAudioControls key={resolvedAudioUrl} audioUrl={resolvedAudioUrl} />
            </MediaAudioErrorBoundary>
          )}
        </View>
      ) : null}

      {resolvedImageUrl ? (
        <View style={styles.imageBox}>
          <Image
            resizeMode="contain"
            source={{ uri: resolvedImageUrl }}
            style={[styles.questionImage, { height: imageHeight }]}
          />
        </View>
      ) : null}

      {passageText?.trim() ? (
        <View style={styles.passageBox}>
          <Pressable
            onPress={() => setPassageCollapsed((prev) => !prev)}
            style={styles.passageHeader}
          >
            <View style={styles.mediaHeaderRow}>
              <Ionicons color={colors.primaryDark} name="document-text-outline" size={16} />
              <Text style={styles.mediaTitle}>Đoạn văn / Bài đọc</Text>
            </View>
            <View style={styles.passageHeaderActions}>
              <Pressable
                hitSlop={8}
                onPress={() => toggleReadText("passage", passageText.trim())}
                style={styles.ttsReadPill}
              >
                <Ionicons
                  color={colors.primary}
                  name={isReadingPassage ? "stop-circle-outline" : "volume-high-outline"}
                  size={14}
                />
                <Text style={styles.ttsReadText}>
                  {isReadingPassage ? "Dừng" : "Nghe đọc"}
                </Text>
              </Pressable>
              <Ionicons
                color={colors.textMuted}
                name={passageCollapsed ? "chevron-down" : "chevron-up"}
                size={18}
              />
            </View>
          </Pressable>
          {!passageCollapsed ? (
            <ScrollView nestedScrollEnabled style={[styles.passageScroll, { maxHeight: passageMaxH }]}>
              <Text style={[styles.passageText, { fontSize: rf(14.5), lineHeight: rf(22) }]}>
                {passageText.trim()}
              </Text>
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {showTranscript && transcript?.trim() ? (
        <View style={styles.transcriptBox}>
          <Pressable
            onPress={() => setTranscriptOpen((prev) => !prev)}
            style={styles.passageHeader}
          >
            <View style={styles.mediaHeaderRow}>
              <Ionicons color={colors.success} name="chatbox-ellipses-outline" size={16} />
              <Text style={styles.transcriptTitle}>
                {transcriptOpen ? "Ẩn Audio Transcript" : "Xem Audio Transcript"}
              </Text>
            </View>
            <Ionicons
              color={colors.success}
              name={transcriptOpen ? "chevron-up" : "chevron-down"}
              size={16}
            />
          </Pressable>
          {transcriptOpen ? (
            <>
              <Pressable
                hitSlop={8}
                onPress={() => toggleReadText("transcript", transcript.trim())}
                style={[styles.ttsReadPill, { alignSelf: "flex-start", marginTop: 8 }]}
              >
                <Ionicons
                  color={colors.primary}
                  name={isReadingTranscript ? "stop-circle-outline" : "volume-high-outline"}
                  size={14}
                />
                <Text style={styles.ttsReadText}>
                  {isReadingTranscript ? "Dừng đọc Transcript" : "Đọc bằng Speechify AI"}
                </Text>
              </Pressable>
              <Text style={styles.transcriptText}>{transcript.trim()}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    audioBox: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: spacing.xs,
      padding: 12,
    },
    container: {
      gap: 10,
      marginBottom: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: "600",
    },
    groupBadge: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    groupBadgeText: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "800",
    },
    imageBox: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      overflow: "hidden",
      padding: 6,
    },
    mediaHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    mediaTitle: {
      color: colors.primaryDark,
      fontSize: 13,
      fontWeight: "800",
    },
    nativeAudioRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 4,
    },
    passageBox: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 12,
    },
    passageHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    passageHeaderActions: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    ttsReadPill: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    ttsReadText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
    },
    passageScroll: {
      marginTop: 6,
    },
    passageText: {
      color: colors.text,
    },
    playBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    questionImage: {
      borderRadius: 10,
      width: "100%",
    },
    replayBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    replayText: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "700",
    },
    timeText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginLeft: "auto",
    },
    transcriptBox: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.16)" : "#EEFBF7",
      borderColor: colors.isDark ? "rgba(31,157,108,0.34)" : "#C3EBDD",
      borderRadius: radius.md,
      borderWidth: 1,
      padding: 12,
    },
    transcriptText: {
      color: colors.text,
      fontSize: 13.5,
      lineHeight: 20,
      marginTop: 6,
    },
    transcriptTitle: {
      color: colors.success,
      fontSize: 13,
      fontWeight: "800",
    },
    webAudioWrap: {
      marginTop: 4,
      width: "100%",
    },
  });
