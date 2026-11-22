import { Ionicons } from "@expo/vector-icons";
import { setAudioModeAsync } from "expo-audio";
import { useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VideoPlayer } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import React, { Component, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { showDiamondRewardToast } from "@/src/components/common/DiamondRewardToast";
import { LiquidButton } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import ProgressBar from "@/src/components/user/ProgressBar";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  createLessonNote,
  deleteVideoNote,
  getLessonNotes,
  getUserLessons,
  resolvePlayableMediaUrl,
  updateLessonProgress,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { UserLessonApiItem, VideoNoteApiItem } from "@/src/types/user-api";
import { pushRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";
import { alertCrossPlatform } from "@/src/utils/web-dialog";

type NativeVideoHandle = {
  seekToSeconds: (seconds: number) => void;
};

class VideoErrorBoundary extends Component<
  { children: ReactNode; onOpenExternal: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ alignItems: "center", flex: 1, gap: 10, justifyContent: "center", paddingHorizontal: 16 }}>
          <Ionicons color="#94A3B8" name="videocam-outline" size={28} />
          <Text style={{ color: "#C8D2E8", fontSize: 13, textAlign: "center" }}>
            Trình phát video gặp sự cố trên thiết bị này. Bạn vẫn có thể xem trực tiếp bằng trình duyệt.
          </Text>
          <Pressable
            onPress={this.props.onOpenExternal}
            style={{
              backgroundColor: "rgba(255,255,255,0.16)",
              borderColor: "rgba(255,255,255,0.28)",
              borderRadius: 999,
              borderWidth: 1,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" }}>Mở video</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const LESSON_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0] as const;
const PASS_THRESHOLD_RATIO = 0.8;

function applyLessonPlayerRate(instance: VideoPlayer, rate: number) {
  try {
    instance.playbackRate = rate;
  } catch {
    // Ignore rate error
  }
}

function NativeLessonVideoPlayer({
  durationFallback,
  initialPositionSeconds = 0,
  onOpenExternal,
  onPauseOrEnd,
  onProgress,
  playerHandleRef,
  videoUrl,
}: {
  durationFallback: number;
  initialPositionSeconds?: number;
  onOpenExternal: () => void;
  onPauseOrEnd?: (current: number, duration: number) => void;
  onProgress: (current: number, duration: number) => void;
  playerHandleRef: React.MutableRefObject<NativeVideoHandle | null>;
  videoUrl: string;
}) {
  "use no memo";
  const { theme } = useAppTheme();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const onProgressRef = useRef(onProgress);
  const onPauseOrEndRef = useRef(onPauseOrEnd);
  const initialPositionRef = useRef(initialPositionSeconds);
  const durationFallbackRef = useRef(durationFallback);
  const videoViewRef = useRef<VideoView | null>(null);
  const trackWidthRef = useRef(1);
  const didAutoResumeRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [posSec, setPosSec] = useState(0);
  const [durSec, setDurSec] = useState(durationFallback);
  const [speedIdx, setSpeedIdx] = useState(1);

  const player = useVideoPlayer(videoUrl, (instance) => {
    try {
      instance.timeUpdateEventInterval = 1;
      instance.muted = false;
      instance.volume = 1.0;
      instance.preservesPitch = true;
      instance.audioMixingMode = "doNotMix";
      if (Platform.OS !== "web") {
        void setAudioModeAsync({ playsInSilentMode: true }).catch(() => { });
      }
      instance.play();
    } catch {
      // Ignore native init warning on restricted codecs
    }
  });

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onPauseOrEndRef.current = onPauseOrEnd;
  }, [onPauseOrEnd]);

  useEffect(() => {
    initialPositionRef.current = initialPositionSeconds;
    durationFallbackRef.current = durationFallback;
  }, [durationFallback, initialPositionSeconds]);

  useEffect(() => {
    playerHandleRef.current = {
      seekToSeconds: (seconds: number) => {
        try {
          player.currentTime = Math.max(0, seconds);
          setPosSec(Math.max(0, seconds));
        } catch {
          // Ignore seek errors if player is releasing
        }
      },
    };
    const subTime = player.addListener("timeUpdate", ({ currentTime }) => {
      try {
        const nativeDuration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
        const total = nativeDuration || durationFallbackRef.current;
        setPosSec(currentTime);
        setDurSec(total);
        if (currentTime > 0) {
          setIsBuffering(false);
        }
        onProgressRef.current(currentTime, total);
      } catch {
        // Ignore progress read when player unmounts
      }
    });
    const subPlay = player.addListener("playingChange", ({ isPlaying: nextPlaying }) => {
      setIsPlaying(nextPlaying);
      if (nextPlaying) {
        setIsBuffering(false);
        setPlayerError(null);
      } else {
        try {
          const cur = Number.isFinite(player.currentTime) ? player.currentTime : 0;
          const dur = (Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0) || durationFallbackRef.current;
          onPauseOrEndRef.current?.(cur, dur);
        } catch {
          // Ignore sync read on pause
        }
      }
    });
    const subStatus = player.addListener("statusChange", ({ status, error }) => {
      try {
        if (status === "loading") {
          setIsBuffering(true);
          setPlayerError(null);
        } else if (status === "readyToPlay") {
          setIsBuffering(false);
          setPlayerError(null);
          player.muted = false;
          player.volume = 1.0;
          const initPos = initialPositionRef.current;
          if (!didAutoResumeRef.current && initPos > 5) {
            didAutoResumeRef.current = true;
            const total = (Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0) || durationFallbackRef.current;
            const resumeAt = Math.min(Math.max(0, total - 3), initPos);
            player.currentTime = resumeAt;
            setPosSec(resumeAt);
          }
          if (!player.playing) {
            player.play();
          }
        } else if (status === "error") {
          setIsBuffering(false);
          setPlayerError(error?.message || "Không thể kết nối luồng video.");
        }
      } catch {
        // Ignore transient status listener errors
      }
    });
    return () => {
      try {
        subTime.remove();
      } catch {
        // Ignore listener cleanup errors
      }
      try {
        subPlay.remove();
      } catch {
        // Ignore listener cleanup errors
      }
      try {
        subStatus.remove();
      } catch {
        // Ignore listener cleanup errors
      }
      try {
        player.pause();
      } catch {
        // Ignore pause on released player
      }
      playerHandleRef.current = null;
    };
  }, [player, playerHandleRef]);

  const togglePlay = () => {
    try {
      if (player.playing) {
        player.pause();
      } else {
        setPlayerError(null);
        player.play();
      }
    } catch {
      // Ignore playback toggle error
    }
  };

  const retryPlayback = () => {
    setPlayerError(null);
    setIsBuffering(true);
    try {
      player.replace(videoUrl);
      player.play();
    } catch {
      setPlayerError("Không thể phát lại luồng video trên thiết bị này.");
      setIsBuffering(false);
    }
  };

  const skipBy = (delta: number) => {
    try {
      const next = Math.max(0, Math.min(durSec > 0 ? durSec : posSec + delta, posSec + delta));
      playerHandleRef.current?.seekToSeconds(next);
    } catch {
      // Ignore seek error
    }
  };

  useEffect(() => {
    applyLessonPlayerRate(player, LESSON_SPEEDS[speedIdx]);
  }, [player, speedIdx]);

  const cycleSpeed = () => {
    setSpeedIdx((prev) => (prev + 1) % LESSON_SPEEDS.length);
  };

  const enterLandscapeFullscreen = async () => {
    try {
      if (videoViewRef.current?.enterFullscreen) {
        await videoViewRef.current.enterFullscreen();
      }
    } catch {
      alertCrossPlatform("Xem ngang", "Không thể mở toàn màn hình trên thiết bị này.");
    }
  };

  const progressRatio = durSec > 0 ? Math.max(0, Math.min(1, posSec / durSec)) : 0;

  return (
    <View style={styles.nativeContainer}>
      {/* Clean unobstructed 16:9 video canvas */}
      <View style={styles.videoFrame}>
        <VideoView
          ref={videoViewRef}
          contentFit="contain"
          fullscreenOptions={{
            enable: true,
            orientation: "landscape",
            autoExitOnRotate: false,
          }}
          nativeControls={false}
          player={player}
          style={styles.nativeVideo}
          surfaceType={Platform.OS === "android" ? "textureView" : undefined}
        />

        {/* Tap video surface to toggle play/pause without any permanent bars blocking view */}
        <Pressable
          accessibilityLabel={isPlaying ? "Tạm dừng video" : "Phát video"}
          onPress={togglePlay}
          style={StyleSheet.absoluteFill}
        >
          {!isPlaying && !isBuffering && !playerError ? (
            <View style={styles.centerPausedBadge}>
              <Ionicons color="#FFFFFF" name="play" size={26} style={{ marginLeft: 3 }} />
            </View>
          ) : null}
        </Pressable>

        {isBuffering && !playerError ? (
          <View pointerEvents="none" style={styles.videoStateOverlay}>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <Text style={styles.videoStateText}>Đang tải luồng video...</Text>
          </View>
        ) : null}
        {playerError ? (
          <View style={styles.videoStateOverlay}>
            <Ionicons color="#FCA5A5" name="alert-circle-outline" size={26} />
            <Text numberOfLines={2} style={styles.videoStateText}>
              {playerError}
            </Text>
            <View style={styles.posterBtnRow}>
              <Pressable onPress={retryPlayback} style={styles.posterPrimaryBtn}>
                <Text style={styles.posterPrimaryText}>Thử lại</Text>
              </Pressable>
              <Pressable onPress={onOpenExternal} style={styles.posterSecondaryBtn}>
                <Text style={styles.posterSecondaryText}>Mở trình duyệt</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* External Transport Bar & Seek Scrubber BELOW the video so 0% of video is ever covered */}
      <View style={styles.externalControlDock}>
        <View style={styles.seekTimeRow}>
          <Text style={styles.seekTimeText}>{formatTimestampBadge(posSec)}</Text>
          <Pressable
            hitSlop={8}
            onLayout={(e) => {
              trackWidthRef.current = Math.max(1, e.nativeEvent.layout.width);
            }}
            onPress={(e) => {
              if (durSec <= 0) return;
              const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidthRef.current));
              playerHandleRef.current?.seekToSeconds(ratio * durSec);
            }}
            style={styles.seekTrackHitArea}
          >
            <View style={styles.seekTrackBg}>
              <View
                style={[
                  styles.seekTrackFill,
                  { backgroundColor: colors.primary, width: `${progressRatio * 100}%` },
                ]}
              />
            </View>
          </Pressable>
          <Text style={styles.seekTimeText}>{formatTimestampBadge(durSec)}</Text>
        </View>

        <View style={styles.externalControlsRow}>
          <Pressable hitSlop={8} onPress={() => skipBy(-10)} style={styles.extCtrlPill}>
            <Ionicons color={colors.text} name="play-back" size={14} />
            <Text style={styles.extCtrlPillText}>10s</Text>
          </Pressable>

          <Pressable
            hitSlop={8}
            onPress={togglePlay}
            style={[styles.extPlayCircle, { backgroundColor: colors.primary }]}
          >
            <Ionicons color="#FFFFFF" name={isPlaying ? "pause" : "play"} size={18} />
          </Pressable>

          <Pressable hitSlop={8} onPress={() => skipBy(10)} style={styles.extCtrlPill}>
            <Text style={styles.extCtrlPillText}>10s</Text>
            <Ionicons color={colors.text} name="play-forward" size={14} />
          </Pressable>

          <Pressable hitSlop={6} onPress={cycleSpeed} style={styles.extCtrlPill}>
            <Text style={styles.extCtrlPillText}>{LESSON_SPEEDS[speedIdx]}x</Text>
          </Pressable>

          <Pressable
            hitSlop={6}
            onPress={() => void enterLandscapeFullscreen()}
            style={[styles.landscapeBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
          >
            <Ionicons color={colors.primary} name="scan-outline" size={15} />
            <Text style={[styles.landscapeBtnText, { color: colors.primary }]}>Xem ngang</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function formatTimestampBadge(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export default function LessonScreen() {
  const { auth, isHydrated, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ moduleId?: string; lessonId?: string; seekSeconds?: string }>();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lessons, setLessons] = useState<UserLessonApiItem[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [updatingProgress, setUpdatingProgress] = useState(false);
  const [notes, setNotes] = useState<VideoNoteApiItem[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [livePlaybackState, setLivePlaybackState] = useState<{
    lessonId: number;
    watchedSeconds: number;
    durationSeconds: number;
    currentSecond: number;
  } | null>(null);
  const [webSpeedIdx, setWebSpeedIdx] = useState(1);
  const [nativePlayerReady, setNativePlayerReady] = useState(false);
  const watchedSecondsRef = useRef(0);
  const lastSyncedWatchedRef = useRef(0);
  const prevTickRef = useRef<{ lessonId: number; position: number } | null>(null);
  const syncInFlightRef = useRef(false);
  const webResumedLessonIdRef = useRef<number | null>(null);
  const completionNotifiedLessonRef = useRef<number | null>(null);
  const initializedLessonIdRef = useRef<number | null>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const nativeVideoRef = useRef<NativeVideoHandle | null>(null);

  const selectedModuleId = useMemo(() => {
    if (!params.moduleId) return undefined;
    const parsed = Number(params.moduleId);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [params.moduleId]);

  const requestedLessonId = useMemo(() => {
    if (!params.lessonId) return undefined;
    const parsed = Number(params.lessonId);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [params.lessonId]);

  const loadLessons = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      const payload = await getUserLessons(auth.accessToken, selectedModuleId);
      const records = payload.data ?? [];
      setLessons(records);
      setSelectedLessonId((current) => {
        if (requestedLessonId && records.some((item) => item.lessonId === requestedLessonId)) {
          return requestedLessonId;
        }
        if (current && records.some((item) => item.lessonId === current)) return current;
        return records.find((item) => item.progressStatus === "IN_PROGRESS")?.lessonId ?? records[0]?.lessonId ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải danh sách bài học.");
      setLessons([]);
      setSelectedLessonId(null);
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, requestedLessonId, selectedModuleId]);

  useEffect(() => {
    if (!isHydrated || !auth.accessToken) return;
    const timer = setTimeout(() => {
      void loadLessons();
    }, 0);
    return () => clearTimeout(timer);
  }, [auth.accessToken, isHydrated, loadLessons]);

  const currentLesson = lessons.find((item) => item.lessonId === selectedLessonId) ?? lessons[0] ?? null;
  const activeLivePlayback =
    currentLesson && livePlaybackState?.lessonId === currentLesson.lessonId ? livePlaybackState : null;
  const effectiveDuration = Math.max(
    1,
    activeLivePlayback && activeLivePlayback.durationSeconds > 0
      ? activeLivePlayback.durationSeconds
      : (currentLesson?.durationSeconds ?? 1),
  );
  const currentSecond = activeLivePlayback
    ? activeLivePlayback.currentSecond
    : Math.max(0, currentLesson?.lastPositionSeconds ?? 0);
  const persistedWatched =
    currentLesson && typeof currentLesson.watchedSeconds === "number" && currentLesson.watchedSeconds > 0
      ? currentLesson.watchedSeconds
      : Math.round(((currentLesson?.completionPercent ?? 0) / 100) * Math.max(1, currentLesson?.durationSeconds ?? 1));
  const displayedWatchedSeconds = Math.max(
    persistedWatched,
    activeLivePlayback?.watchedSeconds ?? 0,
  );
  const completionValue =
    currentLesson?.progressStatus === "COMPLETED"
      ? 100
      : Math.max(
        0,
        Math.min(
          100,
          Math.max(
            Math.round(currentLesson?.completionPercent ?? 0),
            Math.round((displayedWatchedSeconds / effectiveDuration) * 100),
          ),
        ),
      );
  const allLessonsCompleted = lessons.length > 0 && lessons.every((lesson) => lesson.progressStatus === "COMPLETED");

  useEffect(() => {
    if (!currentLesson || initializedLessonIdRef.current === currentLesson.lessonId) return;
    initializedLessonIdRef.current = currentLesson.lessonId;
    const dur = Math.max(1, currentLesson.durationSeconds || 1);
    const seedWatched =
      typeof currentLesson.watchedSeconds === "number" && currentLesson.watchedSeconds > 0
        ? currentLesson.watchedSeconds
        : Math.round(((currentLesson.completionPercent ?? 0) / 100) * dur);
    watchedSecondsRef.current = seedWatched;
    lastSyncedWatchedRef.current = seedWatched;
    prevTickRef.current = null;
    webResumedLessonIdRef.current = null;
    // Refs only: UI progress derives livePlaybackState keyed by lessonId without effect setState
  }, [currentLesson]);

  const loadNotes = useCallback(
    async (lessonId: number) => {
      if (!auth.accessToken) return;
      try {
        const res = await getLessonNotes(auth.accessToken, lessonId);
        setNotes(res.data ?? []);
      } catch {
        setNotes([]);
      }
    },
    [auth.accessToken],
  );

  useEffect(() => {
    if (!currentLesson?.lessonId) return;
    const lessonId = currentLesson.lessonId;
    const timer = setTimeout(() => {
      void loadNotes(lessonId);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentLesson?.lessonId, loadNotes]);

  const handleSeekToSecond = async (seconds: number) => {
    const target = Math.max(0, Math.floor(seconds));
    if (currentLesson) {
      setLivePlaybackState({
        lessonId: currentLesson.lessonId,
        watchedSeconds: Math.floor(watchedSecondsRef.current),
        durationSeconds: effectiveDuration,
        currentSecond: target,
      });
    }
    if (Platform.OS === "web" && webVideoRef.current) {
      webVideoRef.current.currentTime = target;
      void webVideoRef.current.play().catch(() => { });
      return;
    }
    if (nativeVideoRef.current?.seekToSeconds) {
      try {
        nativeVideoRef.current.seekToSeconds(target);
      } catch {
        // Ignore seek failure
      }
    }
  };

  const handleSaveNote = async () => {
    if (!auth.accessToken || !currentLesson || !noteText.trim() || savingNote) return;
    try {
      setSavingNote(true);
      await createLessonNote(auth.accessToken, currentLesson.lessonId, {
        noteText: noteText.trim(),
        timestampSeconds: currentSecond,
      });
      setNoteText("");
      await loadNotes(currentLesson.lessonId);
    } catch (error) {
      alertCrossPlatform("Ghi chú", error instanceof Error ? error.message : "Không lưu được ghi chú.");
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!auth.accessToken || !currentLesson) return;
    try {
      await deleteVideoNote(auth.accessToken, noteId);
      await loadNotes(currentLesson.lessonId);
    } catch (error) {
      alertCrossPlatform("Ghi chú", error instanceof Error ? error.message : "Không xóa được ghi chú.");
    }
  };

  const formatDuration = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} phút`;
  const formatStatus = (status: string) => {
    if (status === "COMPLETED") return "Hoàn thành";
    if (status === "IN_PROGRESS") return "Đang học";
    return "Chưa học";
  };

  const openVideoUrl = async () => {
    const resolved = resolvePlayableMediaUrl(currentLesson?.videoUrl);
    if (!resolved) return;
    try {
      await WebBrowser.openBrowserAsync(resolved);
    } catch (error) {
      alertCrossPlatform("Video", error instanceof Error ? error.message : "Không mở được video.");
    }
  };

  const syncProgressToServer = useCallback(
    async (positionSec: number, durationSec: number, force = false, markCompleted = false) => {
      if (!auth.accessToken || !currentLesson || syncInFlightRef.current) return;
      const safeDuration = Math.max(1, Math.floor(durationSec || currentLesson.durationSeconds || 1));
      const clampedPos = Math.min(safeDuration, Math.max(0, Math.floor(positionSec)));
      const clampedWatched = Math.min(safeDuration, Math.max(0, Math.floor(watchedSecondsRef.current)));
      const ratio = clampedWatched / safeDuration;
      const shouldComplete = markCompleted || ratio >= PASS_THRESHOLD_RATIO;
      const gainedSinceSync = clampedWatched - lastSyncedWatchedRef.current;

      const needsCompletionSync = shouldComplete && currentLesson.progressStatus !== "COMPLETED";
      const needsPeriodicSync = gainedSinceSync >= 10;
      const needsPauseSync = force && (gainedSinceSync > 0 || (clampedPos > 0 && currentLesson.progressStatus === "NOT_STARTED"));

      if (!needsCompletionSync && !needsPeriodicSync && !needsPauseSync && !markCompleted) {
        return;
      }

      syncInFlightRef.current = true;
      lastSyncedWatchedRef.current = clampedWatched;
      try {
        const res = await updateLessonProgress(auth.accessToken, currentLesson.lessonId, {
          completionPercent: shouldComplete ? 100 : Math.min(100, ratio * 100),
          lastPositionSeconds: clampedPos,
          status: shouldComplete ? "COMPLETED" : "IN_PROGRESS",
          watchedSeconds: shouldComplete ? Math.max(clampedWatched, safeDuration) : clampedWatched,
        });
        if (res.data) {
          const updated = res.data;
          setLessons((prev) =>
            prev.map((item) =>
              item.lessonId === updated.lessonId
                ? {
                  ...item,
                  completionPercent: updated.lessonCompletionPercent,
                  lastPositionSeconds: force ? updated.lastPositionSeconds : item.lastPositionSeconds,
                  watchedSeconds: updated.watchedSeconds,
                  progressStatus: updated.lessonStatus,
                }
                : item,
            ),
          );
          if (auth.user && typeof updated.currentDiamonds === "number") {
            updateUserProfile({ ...auth.user, diamonds: updated.currentDiamonds });
          }
          if (
            updated.lessonStatus === "COMPLETED" &&
            (updated.diamondsEarned ?? 0) > 0 &&
            completionNotifiedLessonRef.current !== updated.lessonId
          ) {
            completionNotifiedLessonRef.current = updated.lessonId;
            showDiamondRewardToast(updated.diamondsEarned ?? 0, "Hoàn thành bài học");
          }
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Không thể đồng bộ tiến độ bài học.",
        );
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [auth.accessToken, auth.user, currentLesson, updateUserProfile],
  );

  const handlePlaybackTick = useCallback(
    (seconds: number, duration: number) => {
      if (!currentLesson || !Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) {
        return;
      }
      const pos = Math.max(0, seconds);
      const lessonId = currentLesson.lessonId;
      const prevTick = prevTickRef.current;
      prevTickRef.current = { lessonId, position: pos };

      // Only count normal forward playback deltas (<= 3.5s/tick covers up to 2.0x speed, skips manual scrubs)
      if (prevTick && prevTick.lessonId === lessonId) {
        const delta = pos - prevTick.position;
        if (delta > 0 && delta <= 3.5) {
          watchedSecondsRef.current = Math.min(duration, watchedSecondsRef.current + delta);
        }
      }

      const nextSecond = Math.floor(pos);
      const nextDur = Math.floor(duration);
      const nextWatched = Math.floor(watchedSecondsRef.current);
      setLivePlaybackState((prev) => {
        if (
          prev &&
          prev.lessonId === lessonId &&
          prev.currentSecond === nextSecond &&
          prev.durationSeconds === nextDur &&
          prev.watchedSeconds === nextWatched
        ) {
          return prev;
        }
        return {
          lessonId,
          watchedSeconds: nextWatched,
          durationSeconds: nextDur,
          currentSecond: nextSecond,
        };
      });

      void syncProgressToServer(pos, duration, false, false);
    },
    [currentLesson, syncProgressToServer],
  );

  const handleManualCompleteLesson = async () => {
    if (!auth.accessToken || !currentLesson || updatingProgress) return;
    try {
      setUpdatingProgress(true);
      await syncProgressToServer(effectiveDuration, effectiveDuration, true, true);
    } finally {
      setUpdatingProgress(false);
    }
  };

  const handleRestartFromBeginning = async () => {
    prevTickRef.current = currentLesson ? { lessonId: currentLesson.lessonId, position: 0 } : null;
    await handleSeekToSecond(0);
  };

  const cycleWebSpeed = () => {
    const nextIdx = (webSpeedIdx + 1) % LESSON_SPEEDS.length;
    setWebSpeedIdx(nextIdx);
    if (webVideoRef.current) {
      webVideoRef.current.playbackRate = LESSON_SPEEDS[nextIdx];
    }
  };

  const handleCompleteVideosAndGoCards = async () => {
    if (!currentLesson?.moduleId) return;
    await loadLessons();
    pushRoute(`/user/cards?moduleId=${currentLesson.moduleId}`);
  };

  const renderVideoPlayer = () => {
    const safeUrl = resolvePlayableMediaUrl(currentLesson?.videoUrl);
    if (!safeUrl) {
      return (
        <View style={styles.videoFrame}>
          <View style={styles.placeholderWrap}>
            <Ionicons color="#94A3B8" name="videocam-off-outline" size={28} />
            <Text style={styles.placeholderText}>Bài học này chưa có video.</Text>
          </View>
        </View>
      );
    }

    if (!/^https?:\/\//i.test(safeUrl)) {
      return (
        <View style={styles.videoFrame}>
          <View style={styles.placeholderWrap}>
            <Ionicons color="#94A3B8" name="videocam-outline" size={28} />
            <Text style={styles.placeholderText}>Liên kết video không hợp lệ.</Text>
          </View>
        </View>
      );
    }

    const isYoutubeUrl = /(?:youtube\.com|youtu\.be)/i.test(safeUrl);

    if (isYoutubeUrl) {
      return (
        <View style={styles.videoFrame}>
          <View style={styles.placeholderWrap}>
            <Ionicons color="#FF4B4B" name="logo-youtube" size={34} />
            <Text style={styles.placeholderText}>
              Video bài giảng YouTube: Mở Thư viện Video Song ngữ hoặc xem trực tiếp.
            </Text>
            <View style={styles.posterBtnRow}>
              <Pressable
                onPress={() => pushRoute("/user/youtube-studio")}
                style={styles.posterPrimaryBtn}
              >
                <Ionicons color="#FFFFFF" name="library-outline" size={14} />
                <Text style={styles.posterPrimaryText}>Thư viện Video AI</Text>
              </Pressable>
              <Pressable onPress={() => void openVideoUrl()} style={styles.posterSecondaryBtn}>
                <Text style={styles.posterSecondaryText}>Mở trình duyệt</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    if (Platform.OS === "web") {
      return (
        <View style={styles.nativeContainer}>
          <View style={styles.videoFrame}>
            {React.createElement("video", {
              ref: webVideoRef,
              controls: true,
              src: safeUrl,
              style: styles.webVideo as unknown as object,
              onLoadedMetadata: (event: any) => {
                const videoEl = event?.currentTarget as HTMLVideoElement | undefined;
                if (!videoEl || !currentLesson) return;
                const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? Math.floor(videoEl.duration) : 0;
                videoEl.playbackRate = LESSON_SPEEDS[webSpeedIdx];
                let initialSec = Math.floor(videoEl.currentTime || 0);
                if (
                  webResumedLessonIdRef.current !== currentLesson.lessonId &&
                  currentLesson.lastPositionSeconds > 5 &&
                  currentLesson.progressStatus !== "COMPLETED"
                ) {
                  webResumedLessonIdRef.current = currentLesson.lessonId;
                  const target = dur > 0 ? Math.min(Math.max(0, dur - 3), currentLesson.lastPositionSeconds) : currentLesson.lastPositionSeconds;
                  prevTickRef.current = { lessonId: currentLesson.lessonId, position: target };
                  videoEl.currentTime = target;
                  initialSec = Math.floor(target);
                }
                setLivePlaybackState({
                  lessonId: currentLesson.lessonId,
                  watchedSeconds: Math.floor(watchedSecondsRef.current),
                  durationSeconds: dur > 0 ? dur : Math.max(1, currentLesson.durationSeconds || 1),
                  currentSecond: initialSec,
                });
              },
              onTimeUpdate: (event: any) => {
                const current = Number(event?.currentTarget?.currentTime ?? 0);
                const duration = Number(event?.currentTarget?.duration ?? currentLesson?.durationSeconds ?? 0);
                handlePlaybackTick(current, duration);
              },
              onPause: (event: any) => {
                const current = Number(event?.currentTarget?.currentTime ?? 0);
                const duration = Number(event?.currentTarget?.duration ?? currentLesson?.durationSeconds ?? 0);
                void syncProgressToServer(current, duration, true, false);
              },
              onEnded: (event: any) => {
                const duration = Number(event?.currentTarget?.duration ?? currentLesson?.durationSeconds ?? 0);
                void syncProgressToServer(duration, duration, true, false);
              },
            })}
          </View>
          <View style={styles.externalControlsRow}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Pressable onPress={cycleWebSpeed} style={styles.extCtrlPill}>
                <Text style={styles.extCtrlPillText}>{LESSON_SPEEDS[webSpeedIdx]}x</Text>
              </Pressable>
              {currentSecond > 10 ? (
                <Pressable onPress={() => void handleRestartFromBeginning()} style={styles.extCtrlPill}>
                  <Ionicons color={colors.text} name="refresh" size={13} />
                  <Text style={styles.extCtrlPillText}>Từ đầu</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => void webVideoRef.current?.requestFullscreen?.()}
              style={[styles.landscapeBtn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
            >
              <Ionicons color={colors.primary} name="scan-outline" size={15} />
              <Text style={[styles.landscapeBtnText, { color: colors.primary }]}>Xem ngang / Toàn màn hình</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (!nativePlayerReady) {
      return (
        <View style={styles.videoFrame}>
          <View style={styles.placeholderWrap}>
            <View style={styles.posterPlayIcon}>
              <Ionicons color="#FFFFFF" name="play" size={26} style={{ marginLeft: 2 }} />
            </View>
            <Text numberOfLines={2} style={styles.placeholderText}>
              {currentLesson?.lessonTitle ?? "Sẵn sàng phát bài giảng video"}
            </Text>
            <View style={styles.posterBtnRow}>
              <Pressable onPress={() => setNativePlayerReady(true)} style={styles.posterPrimaryBtn}>
                <Ionicons color="#FFFFFF" name="play-circle" size={16} />
                <Text style={styles.posterPrimaryText}>Phát trong App</Text>
              </Pressable>
              <Pressable onPress={() => void openVideoUrl()} style={styles.posterSecondaryBtn}>
                <Ionicons color="#E2E8F0" name="open-outline" size={14} />
                <Text style={styles.posterSecondaryText}>Mở trình phát ngoài</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    const durationFallback = currentLesson?.durationSeconds && currentLesson.durationSeconds > 0 ? currentLesson.durationSeconds : 1;

    return (
      <VideoErrorBoundary onOpenExternal={() => void openVideoUrl()}>
        <NativeLessonVideoPlayer
          key={`${currentLesson?.lessonId ?? "v"}-${safeUrl}`}
          durationFallback={durationFallback}
          initialPositionSeconds={
            currentLesson && currentLesson.progressStatus !== "COMPLETED"
              ? currentLesson.lastPositionSeconds
              : 0
          }
          onOpenExternal={() => void openVideoUrl()}
          onPauseOrEnd={(current, duration) => {
            void syncProgressToServer(current, duration, true, false);
          }}
          onProgress={(current, duration) => {
            handlePlaybackTick(current, duration);
          }}
          playerHandleRef={nativeVideoRef}
          videoUrl={safeUrl}
        />
      </VideoErrorBoundary>
    );
  };

  const isYoutubeLesson = /(?:youtube\.com|youtu\.be)/i.test(
    resolvePlayableMediaUrl(currentLesson?.videoUrl),
  );

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack(selectedModuleId ? `/user/roadmap?moduleId=${selectedModuleId}` : "/user/practice")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0]?.toUpperCase() || "U"} />}
        subtitle={currentLesson?.moduleTitle ?? "Bài giảng Video"}
        title={currentLesson?.lessonTitle ?? "Video Lesson"}
      />

      <SurfaceCard padding="sm" style={styles.playerCard}>
        {renderVideoPlayer()}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {currentLesson ? formatDuration(effectiveDuration) : "--"} •{" "}
            {formatStatus(currentLesson?.progressStatus ?? "NOT_STARTED")}
          </Text>
          <Text style={styles.percentText}>{completionValue}%</Text>
        </View>

        <ProgressBar accentColor={colors.success} value={completionValue} />

        {currentLesson && !isYoutubeLesson ? (
          <Text style={styles.watchRuleHint}>
            Đã xem thực tế {formatTimestampBadge(displayedWatchedSeconds)} / {formatTimestampBadge(effectiveDuration)} •{" "}
            {currentLesson.progressStatus === "COMPLETED"
              ? "Đã đạt yêu cầu qua bài ✓"
              : "Đạt ≥80% thời lượng thực để qua bài (kéo tua không tính giờ)"}
          </Text>
        ) : null}

        {currentLesson?.lessonDescription ? (
          <Text style={styles.descText}>{currentLesson.lessonDescription}</Text>
        ) : null}

        <View style={[styles.actionRow, { flexWrap: "wrap" }]}>
          <Pressable onPress={openVideoUrl} style={styles.toolBtn}>
            <Ionicons color={colors.primaryDark} name="open-outline" size={15} />
            <Text style={styles.toolBtnText}>Mở link</Text>
          </Pressable>
          <Pressable onPress={() => pushRoute("/user/youtube-studio")} style={styles.toolBtn}>
            <Ionicons color="#E53935" name="logo-youtube" size={15} />
            <Text style={styles.toolBtnText}>Thư viện Video</Text>
          </Pressable>
          <Pressable onPress={() => pushRoute("/user/notebook")} style={styles.toolBtn}>
            <Ionicons color={colors.primaryDark} name="bookmarks-outline" size={15} />
            <Text style={styles.toolBtnText}>Sổ tay</Text>
          </Pressable>
          {(isYoutubeLesson || (completionValue >= 80 && currentLesson?.progressStatus !== "COMPLETED")) &&
            currentLesson?.progressStatus !== "COMPLETED" ? (
            <LiquidButton
              compact
              disabled={updatingProgress}
              label="Hoàn thành bài"
              onPress={() => void handleManualCompleteLesson()}
              style={{ flex: 1, minWidth: 130 }}
              variant="primary"
            />
          ) : null}
        </View>
      </SurfaceCard>

      {currentLesson ? (
        <SurfaceCard style={styles.notesCard}>
          <View style={styles.notesHeader}>
            <Text style={styles.notesTitle}>Ghi chú @ {formatTimestampBadge(currentSecond)}</Text>
            <Text style={styles.notesCount}>{notes.length} mục</Text>
          </View>

          <View style={styles.noteInputRow}>
            <TextInput
              onChangeText={setNoteText}
              placeholder="Thêm ghi chú tại mốc giây này..."
              placeholderTextColor={colors.textMuted}
              style={styles.noteInput}
              value={noteText}
            />
            <Pressable
              disabled={savingNote || !noteText.trim()}
              onPress={() => void handleSaveNote()}
              style={[styles.saveNoteBtn, !noteText.trim() ? { opacity: 0.5 } : null]}
            >
              <Text style={styles.saveNoteBtnText}>{savingNote ? "..." : "Lưu"}</Text>
            </Pressable>
          </View>

          {notes.map((n) => (
            <View key={n.id} style={styles.noteRow}>
              <Pressable onPress={() => void handleSeekToSecond(n.timestampSeconds)} style={styles.noteChip}>
                <Text style={styles.noteChipText}>{formatTimestampBadge(n.timestampSeconds)}</Text>
              </Pressable>
              <Text style={styles.noteBodyText}>{n.noteText}</Text>
              <Pressable hitSlop={8} onPress={() => void handleDeleteNote(n.id)}>
                <Ionicons color={colors.danger} name="trash-outline" size={16} />
              </Pressable>
            </View>
          ))}
        </SurfaceCard>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <SectionTitle title="Danh sách bài học" />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh sách bài học...</Text>
        </View>
      ) : null}

      {!loading && lessons.length === 0 ? (
        <SurfaceCard>
          <Text style={styles.emptyText}>Module này chưa có bài học video.</Text>
        </SurfaceCard>
      ) : (
        <View style={styles.lessonList}>
          {lessons.map((lesson, idx) => {
            const active = lesson.lessonId === currentLesson?.lessonId;
            const userTier = (auth.user?.planTier ?? (auth.user?.premium ? "PRO" : "FREE")).toUpperCase();
            const isLockedForFree =
              userTier === "FREE" && idx > 0 && lesson.free === false;
            return (
              <Pressable
                key={lesson.lessonId}
                onPress={() => {
                  if (isLockedForFree) {
                    alertCrossPlatform(
                      "Bài giảng dành cho gói PLUS / PRO",
                      "Bài giảng video nâng cao này yêu cầu nâng cấp gói PLUS (10.000đ/30 ngày) hoặc PRO. Đang chuyển tới trang nâng cấp..."
                    );
                    pushRoute("/user/subscription");
                    return;
                  }
                  setNativePlayerReady(false);
                  setSelectedLessonId(lesson.lessonId);
                }}
                style={[styles.lessonRow, active ? styles.lessonRowActive : null]}
              >
                <View style={[styles.orderTag, active ? styles.orderTagActive : null]}>
                  <Text style={[styles.orderTagText, active ? styles.orderTagTextActive : null]}>
                    #{lesson.sortOrder}
                  </Text>
                </View>
                <View style={styles.lessonInfo}>
                  <Text numberOfLines={1} style={[styles.lessonTitle, { fontSize: rf(14) }]}>
                    {lesson.lessonTitle}
                  </Text>
                  <Text style={styles.lessonSub}>
                    {isLockedForFree
                      ? "🔒 Gói PLUS / PRO"
                      : formatStatus(lesson.progressStatus)}{" "}
                    • {formatDuration(lesson.durationSeconds)}
                  </Text>
                </View>
                {isLockedForFree ? (
                  <Ionicons color="#7C3AED" name="lock-closed" size={17} />
                ) : lesson.progressStatus === "COMPLETED" ? (
                  <Ionicons color={colors.success} name="checkmark-circle" size={18} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {allLessonsCompleted ? (
        <LiquidButton
          disabled={!currentLesson || updatingProgress}
          label="Hoàn thành video • Sang luyện từ vựng"
          onPress={handleCompleteVideosAndGoCards}
          style={{ marginTop: 14 }}
          variant="primary"
        />
      ) : (
        <Text style={styles.requirementHint}>
          Xem tất cả video trong module ({"\u2265"}80%) để mở khóa bước từ vựng.
        </Text>
      )}
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    playerCard: {
      gap: 10,
      marginBottom: 14,
    },
    videoFrame: {
      aspectRatio: 16 / 9,
      backgroundColor: "#0B1220",
      borderRadius: 14,
      overflow: "hidden",
      width: "100%",
    },
    webVideo: {
      backgroundColor: "#000",
      height: "100%",
      width: "100%",
    },
    nativeContainer: {
      gap: 8,
      width: "100%",
    },
    nativeVideo: {
      backgroundColor: "#000",
      height: "100%",
      position: "relative",
      width: "100%",
    },
    centerPausedBadge: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: "rgba(15, 23, 42, 0.56)",
      borderColor: "rgba(255,255,255,0.4)",
      borderRadius: 999,
      borderWidth: 1.5,
      height: 52,
      justifyContent: "center",
      margin: "auto",
      width: 52,
    },
    videoStateOverlay: {
      alignItems: "center",
      backgroundColor: "rgba(11, 18, 32, 0.84)",
      bottom: 0,
      gap: 8,
      justifyContent: "center",
      left: 0,
      paddingHorizontal: 16,
      position: "absolute",
      right: 0,
      top: 0,
    },
    videoStateText: {
      color: "#E2E8F0",
      fontSize: 12.5,
      fontWeight: "700",
      textAlign: "center",
    },
    externalControlDock: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    seekTimeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    seekTimeText: {
      color: colors.textMuted,
      fontSize: 11,
      fontVariant: ["tabular-nums"],
      fontWeight: "800",
      minWidth: 36,
    },
    seekTrackHitArea: {
      flex: 1,
      height: 22,
      justifyContent: "center",
    },
    seekTrackBg: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 99,
      height: 5,
      overflow: "hidden",
      width: "100%",
    },
    seekTrackFill: {
      borderRadius: 99,
      height: "100%",
    },
    externalControlsRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      justifyContent: "space-between",
    },
    extCtrlPill: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 3,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    extCtrlPillText: {
      color: colors.text,
      fontSize: 11.5,
      fontWeight: "800",
    },
    extPlayCircle: {
      alignItems: "center",
      borderRadius: 999,
      elevation: 3,
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    landscapeBtn: {
      alignItems: "center",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    landscapeBtnText: {
      fontSize: 11.5,
      fontWeight: "900",
    },
    placeholderWrap: {
      alignItems: "center",
      flex: 1,
      gap: 8,
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    placeholderText: {
      color: "#C8D2E8",
      fontSize: 13.5,
      textAlign: "center",
    },
    posterPlayIcon: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 999,
      height: 52,
      justifyContent: "center",
      width: 52,
    },
    posterBtnRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
      marginTop: 4,
    },
    posterPrimaryBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 999,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    posterPrimaryText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "900",
    },
    posterSecondaryBtn: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderColor: "rgba(255,255,255,0.28)",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    posterSecondaryText: {
      color: "#F8FAFC",
      fontSize: 12,
      fontWeight: "800",
    },
    metaRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    metaText: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: "700",
    },
    percentText: {
      color: colors.success,
      fontSize: 13,
      fontWeight: "900",
    },
    descText: {
      color: colors.text,
      fontSize: 13.5,
      lineHeight: 20,
    },
    watchRuleHint: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    actionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    toolBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      minHeight: 40,
      paddingHorizontal: 12,
    },
    toolBtnText: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "800",
    },
    notesCard: {
      gap: 8,
      marginBottom: 16,
    },
    notesHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    notesTitle: {
      color: colors.text,
      fontSize: 14.5,
      fontWeight: "900",
    },
    notesCount: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    noteInputRow: {
      flexDirection: "row",
      gap: 8,
    },
    noteInput: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.text,
      flex: 1,
      fontSize: 13.5,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    saveNoteBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 12,
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    saveNoteBtnText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "900",
    },
    noteRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      padding: 8,
    },
    noteChip: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    noteChipText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
    },
    noteBodyText: {
      color: colors.text,
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    errorText: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.16)" : "rgba(249,112,102,0.1)",
      borderColor: colors.isDark ? "rgba(248,113,113,0.34)" : "rgba(249,112,102,0.24)",
      borderRadius: 12,
      borderWidth: 1,
      color: colors.danger,
      fontSize: 13,
      marginBottom: 12,
      padding: 12,
    },
    loadingWrap: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      textAlign: "center",
    },
    lessonList: {
      gap: 8,
    },
    lessonRow: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1.25,
      flexDirection: "row",
      gap: 10,
      padding: 12,
    },
    lessonRowActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    orderTag: {
      backgroundColor: colors.glassFill,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    orderTagActive: {
      backgroundColor: colors.primary,
    },
    orderTagText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "900",
    },
    orderTagTextActive: {
      color: colors.onPrimary,
    },
    lessonInfo: {
      flex: 1,
      minWidth: 0,
    },
    lessonTitle: {
      color: colors.text,
      fontWeight: "800",
    },
    lessonSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    requirementHint: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 14,
      textAlign: "center",
    },
  });
