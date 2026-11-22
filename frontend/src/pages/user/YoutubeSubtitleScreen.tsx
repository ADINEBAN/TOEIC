import { Ionicons } from "@expo/vector-icons";
import { setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VideoPlayer, VideoSource } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import React, { Component, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius } from "@/src/assets/styles/user-theme";
import { showDiamondRewardToast } from "@/src/components/common/DiamondRewardToast";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  addVideoBookmark,
  buildVideoMediaProxyUrl,
  cancelPersonalVideoJob,
  createMyFlashcard,
  deletePersonalVideo,
  deleteVideoBookmark,
  exportVideoSubtitlesText,
  getMyFlashcards,
  getPersonalVideoJobStatus,
  getPublishedVideoDetail,
  getPublishedVideos,
  importPersonalVideo,
  lookupYoutubeWord,
  refreshVideoStream,
  resolvePlayableMediaUrl,
  retryPersonalVideoJob,
  updateVideoLearningState,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { useVoiceSettings } from "@/src/store/voice-store";
import {
  ImportedVideoDetailData,
  VideoBookmarkItem,
  VideoProcessingJobItem,
  VideoSubtitleSegmentItem,
  YoutubeExerciseItem,
  YoutubeWordLookupData,
} from "@/src/types/user-api";
import { safeBack } from "@/src/utils/navigation";
import { cleanMeaningText, cleanStudyText } from "@/src/utils/text-clean";

const LEVEL_FILTERS = ["Tất cả", "A2", "B1", "B2", "C1"] as const;
const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;
const FONT_SIZES = [
  { key: "S", size: 13.5 },
  { key: "M", size: 15.5 },
  { key: "L", size: 17.5 },
  { key: "XL", size: 20 },
] as const;

type ViewMode = "hub" | "player";
type StudioTab = "subtitles" | "listening" | "shadowing" | "vocabulary" | "exercises" | "bookmarks";
type SubtitleDisplayFilter = "en-vi" | "en-only" | "vi-only" | "en-note";

type NativePlayerControlHandle = {
  seekTo: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  enterFullscreen: () => void;
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
        <View style={{ alignItems: "center", flex: 1, gap: 8, justifyContent: "center", paddingHorizontal: 18 }}>
          <Ionicons color="#38BDF8" name="play-circle-outline" size={34} />
          <Text style={{ color: "#E2E8F0", fontSize: 12.5, fontWeight: "700", textAlign: "center" }}>
            Không thể khởi tạo trình phát trực tiếp. Bạn có thể mở nguồn video trên trình duyệt.
          </Text>
          <Pressable
            onPress={this.props.onOpenExternal}
            style={{
              backgroundColor: "rgba(56,189,248,0.22)",
              borderColor: "rgba(56,189,248,0.45)",
              borderRadius: 999,
              borderWidth: 1,
              paddingHorizontal: 14,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: "#38BDF8", fontSize: 12, fontWeight: "800" }}>Mở nguồn video</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function applyNativePlayerState(
  instance: VideoPlayer,
  muted: boolean,
  rate: number,
  playing: boolean,
) {
  try {
    instance.muted = Boolean(muted);
    instance.volume = muted ? 0 : 1.0;
    instance.playbackRate = rate;
    if (playing && !instance.playing) {
      instance.play();
    } else if (!playing && instance.playing) {
      instance.pause();
    }
  } catch {
    // Ignore transient native player state errors while source is loading
  }
}

function InlineStudioVideoSurface({
  accessToken,
  controlRef,
  initialSeekSec = 0,
  isPlaying,
  muted,
  onNativeReady,
  onNativeTimeUpdate,
  onPlaybackError,
  playbackSpeed = 1,
  videoUrl,
}: {
  accessToken?: string | null;
  controlRef: React.MutableRefObject<NativePlayerControlHandle | null>;
  initialSeekSec?: number;
  isPlaying: boolean;
  muted: boolean;
  onNativeReady?: () => void;
  onNativeTimeUpdate: (timeSec: number, durationSec: number) => void;
  onPlaybackError?: (message: string) => void;
  playbackSpeed?: number;
  videoUrl: string;
}) {
  "use no memo";
  const callbackRef = useRef(onNativeTimeUpdate);
  const errorCallbackRef = useRef(onPlaybackError);
  const readyCallbackRef = useRef(onNativeReady);
  const videoViewRef = useRef<VideoView | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const mutedRef = useRef(muted);
  const speedRef = useRef(playbackSpeed);
  const desiredSeekRef = useRef(initialSeekSec);
  const appliedInitialSeekRef = useRef(false);

  const videoSource: VideoSource = useMemo(() => {
    const clean = videoUrl?.trim() || "";
    if (!clean) return null;
    if (Platform.OS !== "web" && accessToken && clean.includes("/api/users/videos/") && clean.includes("/media")) {
      return {
        uri: clean,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };
    }
    return clean;
  }, [accessToken, videoUrl]);

  const player = useVideoPlayer(videoSource, (instance) => {
    try {
      instance.timeUpdateEventInterval = 0.25;
      instance.muted = Boolean(muted);
      instance.volume = muted ? 0 : 1.0;
      instance.preservesPitch = true;
      instance.audioMixingMode = "doNotMix";
    } catch {
      // Ignore native init warning
    }
  });

  useEffect(() => {
    callbackRef.current = onNativeTimeUpdate;
    errorCallbackRef.current = onPlaybackError;
    readyCallbackRef.current = onNativeReady;
    isPlayingRef.current = isPlaying;
    mutedRef.current = muted;
    speedRef.current = playbackSpeed;
  }, [isPlaying, muted, onNativeReady, onNativeTimeUpdate, onPlaybackError, playbackSpeed]);

  useEffect(() => {
    desiredSeekRef.current = initialSeekSec;
    appliedInitialSeekRef.current = false;
  }, [initialSeekSec, videoUrl]);

  useEffect(() => {
    if (Platform.OS !== "web" && isPlaying && !muted) {
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
        // Ignore audio mode config failures on unsupported devices
      });
    }
    applyNativePlayerState(player, muted, playbackSpeed, isPlaying);
  }, [isPlaying, muted, playbackSpeed, player]);

  useEffect(() => {
    controlRef.current = {
      seekTo: (seconds: number) => {
        const target = Math.max(0, seconds);
        desiredSeekRef.current = target;
        appliedInitialSeekRef.current = true;
        try {
          player.currentTime = target;
        } catch {
          // Ignore seek errors on release
        }
      },
      setPlaying: (playing: boolean) => {
        isPlayingRef.current = playing;
        if (Platform.OS !== "web" && playing && !mutedRef.current) {
          void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
            // Ignore audio mode config failures
          });
        }
        try {
          player.muted = Boolean(mutedRef.current);
          player.volume = mutedRef.current ? 0 : 1.0;
          if (playing) {
            player.play();
          } else {
            player.pause();
          }
        } catch {
          // Ignore playback state errors
        }
      },
      setRate: (rate: number) => {
        speedRef.current = rate;
        try {
          player.playbackRate = rate;
        } catch {
          // Ignore rate errors
        }
      },
      enterFullscreen: () => {
        try {
          void videoViewRef.current?.enterFullscreen();
        } catch {
          // Ignore fullscreen error
        }
      },
    };

    const subTime = player.addListener("timeUpdate", ({ currentTime }) => {
      try {
        const dur = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
        callbackRef.current(currentTime, dur);
      } catch {
        // Ignore listener errors
      }
    });

    const subStatus = player.addListener("statusChange", ({ status, error }) => {
      try {
        if (status === "readyToPlay") {
          player.muted = Boolean(mutedRef.current);
          player.volume = mutedRef.current ? 0 : 1.0;
          player.playbackRate = speedRef.current;
          if (!appliedInitialSeekRef.current && desiredSeekRef.current > 0.5) {
            if (Math.abs((player.currentTime || 0) - desiredSeekRef.current) > 1.2) {
              player.currentTime = desiredSeekRef.current;
            }
            appliedInitialSeekRef.current = true;
          }
          if (isPlayingRef.current && !player.playing) {
            player.play();
          }
          readyCallbackRef.current?.();
        } else if (status === "error") {
          errorCallbackRef.current?.(error?.message || "VIDEO_STREAM_ERROR");
        }
      } catch {
        // Ignore listener status errors
      }
    });

    return () => {
      try {
        subTime.remove();
        subStatus.remove();
      } catch {
        // Ignore cleanup errors
      }
      controlRef.current = null;
    };
  }, [controlRef, player]);

  if (!videoUrl) {
    return (
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <Ionicons color="#38BDF8" name="musical-notes-outline" size={32} />
        <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 6 }}>
          Đang phát đồng bộ phụ đề & giọng đọc AI
        </Text>
      </View>
    );
  }

  return (
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
      style={StyleSheet.absoluteFill}
      surfaceType={Platform.OS === "android" ? "textureView" : undefined}
    />
  );
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs < 10 ? "0" : ""}${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }
  return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function tokenizeSentence(sentence: string): string[] {
  if (!sentence) return [];
  return sentence.trim().split(/\s+/).filter((t) => t.length > 0);
}

function cleanWordToken(raw: string): string {
  return raw.replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, "").trim();
}

const SUBTITLE_NOISE_TAG_RE =
  /\s*[\[(]\s*(?:music|âm\s*nhạc|nhạc|applause|vỗ\s*tay|laughter|tiếng\s*cười|cheering|sil|silence|noise|âm\s*thanh|intro|outro)\s*[\])]\s*/gi;
const SUBTITLE_MARKER_RE = /(?:&gt;|>){2,}|[♪♫]+/g;

function cleanSubtitleText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(SUBTITLE_NOISE_TAG_RE, " ")
    .replace(SUBTITLE_MARKER_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type SubtitleSentenceRowProps = {
  seg: VideoSubtitleSegmentItem;
  isCurrent: boolean;
  activeWordIdx: number;
  currentClockLabel: string;
  isSpeaking: boolean;
  subtitleFilter: SubtitleDisplayFilter;
  activeFontSize: number;
  asrEngine: string;
  savedWordsMap: Record<string, boolean>;
  onSeekSegment: (startTime: number) => void;
  onSpeakSegment: (seg: VideoSubtitleSegmentItem) => void;
  onPressWord: (token: string, seg: VideoSubtitleSegmentItem) => void;
  styles: ReturnType<typeof createStyles>;
};

const SubtitleSentenceRow = React.memo(function SubtitleSentenceRow({
  seg,
  isCurrent,
  activeWordIdx,
  currentClockLabel,
  isSpeaking,
  subtitleFilter,
  activeFontSize,
  asrEngine,
  savedWordsMap,
  onSeekSegment,
  onSpeakSegment,
  onPressWord,
  styles,
}: SubtitleSentenceRowProps) {
  const words = tokenizeSentence(seg.englishText);

  return (
    <View style={[styles.subtitleSentenceCard, isCurrent && styles.subtitleSentenceCardActive]}>
      <Pressable onPress={() => onSeekSegment(seg.startTime)} style={styles.subtitleCardTopRow}>
        <View style={isCurrent ? styles.speakingNowPill : styles.inactiveTimestampPill}>
          <Text style={isCurrent ? styles.speakingNowPillText : styles.inactiveTimestampText}>
            {isCurrent ? `● ĐANG NÓI ${currentClockLabel}` : `▶ ${seg.rangeLabel}`}
          </Text>
        </View>

        {seg.uncertain ? (
          <View style={styles.uncertainBadge}>
            <Text style={styles.uncertainBadgeText}>⚠ Khó nghe</Text>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        <Pressable hitSlop={8} onPress={() => onSpeakSegment(seg)} style={styles.roundSpeakerBtn}>
          <Ionicons
            color="#38BDF8"
            name={isSpeaking ? "stop" : "volume-high-outline"}
            size={17}
          />
        </Pressable>
      </Pressable>

      {subtitleFilter !== "vi-only" ? (
        isCurrent ? (
          <View style={styles.wordChipsWrap}>
            {words.map((token, tokIdx) => {
              const cleaned = cleanWordToken(token).toLowerCase();
              const saved = Boolean(cleaned && savedWordsMap[cleaned]);
              const activeWord = tokIdx === activeWordIdx;
              return (
                <Pressable
                  key={`${seg.sequenceNumber}-${tokIdx}`}
                  onPress={() => onPressWord(token, seg)}
                  style={[
                    styles.wordChipItem,
                    saved && styles.wordChipItemSaved,
                    activeWord && styles.wordChipItemSpokenNow,
                  ]}
                >
                  <Text
                    style={[
                      styles.wordChipLabel,
                      { fontSize: activeFontSize },
                      saved && styles.wordChipLabelSaved,
                      activeWord && styles.wordChipLabelSpokenNow,
                    ]}
                  >
                    {token}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.inlineSentenceParagraph, { fontSize: activeFontSize }]}>
            {words.map((token, tokIdx) => {
              const cleaned = cleanWordToken(token).toLowerCase();
              const saved = Boolean(cleaned && savedWordsMap[cleaned]);
              return (
                <Text
                  key={`${seg.sequenceNumber}-${tokIdx}`}
                  onPress={() => onPressWord(token, seg)}
                  style={saved ? styles.inlineWordSaved : undefined}
                >
                  {tokIdx > 0 ? " " : ""}
                  {token}
                </Text>
              );
            })}
          </Text>
        )
      ) : null}

      {subtitleFilter === "en-vi" || subtitleFilter === "vi-only" ? (
        <Pressable onPress={() => onSeekSegment(seg.startTime)}>
          <Text
            style={[
              styles.vietnameseTranslationLine,
              { fontSize: Math.max(13, activeFontSize - 1) },
              isCurrent && styles.vietnameseTranslationLineActive,
            ]}
          >
            🇻🇳 {seg.vietnameseText}
          </Text>
        </Pressable>
      ) : null}

      {subtitleFilter === "en-note" ? (
        <Text style={styles.vietnameseTranslationLine}>
          Engine: {asrEngine || "ASR"} • Tin cậy: {Math.round((seg.confidence ?? 0.9) * 100)}%
          {seg.englishNote ? ` • ${seg.englishNote}` : ""}
        </Text>
      ) : null}
    </View>
  );
});

export default function YoutubeSubtitleScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { speakText, stopSpeaking } = useVoiceSettings();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  // Navigation & Filters
  const [viewMode, setViewMode] = useState<ViewMode>("hub");
  const [studioTab, setStudioTab] = useState<StudioTab>("subtitles");
  const [subtitleFilter, setSubtitleFilter] = useState<SubtitleDisplayFilter>("en-vi");
  const [fontSizeIdx, setFontSizeIdx] = useState(1);
  const [autoFollowSubtitle, setAutoFollowSubtitle] = useState(true);

  // Library Search & Filters (Learner-only Published Video Library)
  const [selectedLevel, setSelectedLevel] = useState<string>("Tất cả");
  const [selectedTopic, setSelectedTopic] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  // Persistent Published Video Library
  const [videoLibrary, setVideoLibrary] = useState<ImportedVideoDetailData[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(() => Boolean(auth?.accessToken));
  const [activeVideo, setActiveVideo] = useState<ImportedVideoDetailData | null>(null);

  // Player Synchronization State
  const playerControlRef = useRef<NativePlayerControlHandle | null>(null);
  const subtitleListRef = useRef<FlatList<VideoSubtitleSegmentItem> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [loopCurrentSentence, setLoopCurrentSentence] = useState(false);
  const [playbackSpeedIdx, setPlaybackSpeedIdx] = useState(2); // 1.0x default
  const [ccEnabled, setCcEnabled] = useState(true);
  const [ttsSyncEnabled, setTtsSyncEnabled] = useState(false);
  const [expandedVideoHeight, setExpandedVideoHeight] = useState(false);
  const [speakingSegSeq, setSpeakingSegSeq] = useState<number | null>(null);
  const lastAutoSpokenSeqRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const lastNativePosRef = useRef(-1);
  const nativeActiveAtRef = useRef(0);
  const isPlayingRef = useRef(false);
  const speakingSegSeqRef = useRef<number | null>(null);

  useEffect(() => {
    currentTimeRef.current = currentTimeSec;
  }, [currentTimeSec]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speakingSegSeqRef.current = speakingSegSeq;
  }, [speakingSegSeq]);

  // Word Lookup & Flashcards State
  const [selectedWordToken, setSelectedWordToken] = useState<string | null>(null);
  const [wordLookupData, setWordLookupData] = useState<YoutubeWordLookupData | null>(null);
  const [loadingWordLookup, setLoadingWordLookup] = useState(false);
  const [wordModalVisible, setWordModalVisible] = useState(false);
  const [speakingWordModal, setSpeakingWordModal] = useState(false);
  const [savedWordsMap, setSavedWordsMap] = useState<Record<string, boolean>>({});
  const [savingFavorite, setSavingFavorite] = useState(false);

  // Export & Bookmarks State
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [bookmarkLabelInput, setBookmarkLabelInput] = useState("");
  const [bookmarkNoteInput, setBookmarkNoteInput] = useState("");

  // Listening Drill & Shadowing & Exercises State
  const [drillIdx, setDrillIdx] = useState(0);
  const [drillRevealText, setDrillRevealText] = useState(false);
  const [drillSelectedOption, setDrillSelectedOption] = useState<string | null>(null);
  const [shadowingStep, setShadowingStep] = useState<"idle" | "listening" | "repeating" | "done">("idle");
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<number, number>>({});

  // Personal Video Link Import State
  const [importPanelOpen, setImportPanelOpen] = useState(true);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const [customTitleInput, setCustomTitleInput] = useState("");
  const [importingPersonal, setImportingPersonal] = useState(false);
  const [activeJob, setActiveJob] = useState<VideoProcessingJobItem | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);

  const playbackSpeed = PLAYBACK_SPEEDS[playbackSpeedIdx] ?? 1.0;
  const activeFontSize = FONT_SIZES[fontSizeIdx]?.size ?? 15.5;

  const reloadPublishedLibrary = useCallback(async () => {
    const token = auth?.accessToken;
    if (!token) return;
    try {
      setLoadingLibrary(true);
      const res = await getPublishedVideos(token);
      setVideoLibrary(res.data ?? []);
    } catch {
      // Keep existing list on transient error
    } finally {
      setLoadingLibrary(false);
    }
  }, [auth?.accessToken]);

  // Initial load of published video library & saved flashcards
  useEffect(() => {
    const token = auth?.accessToken;
    if (!token) {
      return;
    }
    let mounted = true;
    Promise.allSettled([getPublishedVideos(token), getMyFlashcards(token)])
      .then(([vidsRes, cardsRes]) => {
        if (!mounted) return;
        if (vidsRes.status === "fulfilled") {
          const items = vidsRes.value.data ?? [];
          setVideoLibrary(items);
          const pendingPersonal = items.find(
            (v) =>
              !v.published &&
              v.latestJob &&
              ["QUEUED", "FETCHING_METADATA", "DOWNLOADING", "EXTRACTING_AUDIO", "TRANSCRIBING", "TRANSLATING", "SAVING"].includes(
                v.latestJob.status,
              ),
          );
          if (pendingPersonal?.latestJob) {
            setActiveJob(pendingPersonal.latestJob);
          }
        }
        if (cardsRes.status === "fulfilled") {
          const map: Record<string, boolean> = {};
          for (const c of cardsRes.value.data ?? []) {
            if (c?.englishWord) {
              map[c.englishWord.trim().toLowerCase()] = true;
            }
          }
          setSavedWordsMap(map);
        }
      })
      .finally(() => {
        if (mounted) setLoadingLibrary(false);
      });

    return () => {
      mounted = false;
      stopSpeaking();
    };
  }, [auth?.accessToken, stopSpeaking]);

  const [streamMode, setStreamMode] = useState<"direct" | "refreshed" | "proxy" | "failed">("direct");
  const [streamRecovering, setStreamRecovering] = useState(false);
  const [streamErrorDetail, setStreamErrorDetail] = useState<string | null>(null);
  const [streamSeekAnchorSec, setStreamSeekAnchorSec] = useState(0);
  const streamRecoveryInFlightRef = useRef<string | null>(null);

  const openVideoInStudio = useCallback(
    (detail: ImportedVideoDetailData) => {
      stopSpeaking();
      setActiveVideo(detail);
      setStreamMode("direct");
      setStreamRecovering(false);
      setStreamErrorDetail(null);
      streamRecoveryInFlightRef.current = null;
      const resumePos = detail.lastPositionSeconds && detail.lastPositionSeconds > 0 ? detail.lastPositionSeconds : 0;
      setStreamSeekAnchorSec(resumePos);
      const savedSpeedIdx = PLAYBACK_SPEEDS.findIndex((s) => Math.abs(s - (detail.playbackSpeed || 1)) < 0.05);
      setPlaybackSpeedIdx(savedSpeedIdx >= 0 ? savedSpeedIdx : 2);
      lastNativePosRef.current = resumePos;
      nativeActiveAtRef.current = 0;
      setCurrentTimeSec(resumePos);
      setDrillIdx(0);
      setExerciseAnswers({});
      setAutoFollowSubtitle(true);
      setStudioTab("subtitles");
      setViewMode("player");
      setIsPlaying(false);
      setTimeout(() => {
        playerControlRef.current?.seekTo(resumePos);
        playerControlRef.current?.setRate(PLAYBACK_SPEEDS[savedSpeedIdx >= 0 ? savedSpeedIdx : 2]);
      }, 200);
    },
    [stopSpeaking],
  );

  const resolvedActiveStreamUrl = useMemo(() => {
    if (!activeVideo) return "";
    if (streamMode === "failed") return "";
    if (streamMode === "proxy" && activeVideo.id) {
      return buildVideoMediaProxyUrl(activeVideo.id);
    }
    const candidate = resolvePlayableMediaUrl(activeVideo.streamVideoUrl);
    if (!candidate || /(?:youtube\.com\/(?:watch|shorts|live|embed)|youtu\.be\/)/i.test(candidate)) {
      return activeVideo.id ? buildVideoMediaProxyUrl(activeVideo.id) : "";
    }
    return candidate;
  }, [activeVideo, streamMode]);

  const handleStreamPlaybackError = useCallback(
    async (errMsg?: string) => {
      if (!activeVideo?.id) return;
      const guardKey = `${activeVideo.id}:${streamMode}`;
      if (streamRecoveryInFlightRef.current === guardKey) {
        return;
      }
      streamRecoveryInFlightRef.current = guardKey;
      setStreamSeekAnchorSec(currentTimeRef.current);

      try {
        if (streamMode === "direct") {
          if (auth?.accessToken) {
            setStreamRecovering(true);
            setStreamErrorDetail(null);
            try {
              const res = await refreshVideoStream(auth.accessToken, activeVideo.id);
              const nextUrl = resolvePlayableMediaUrl(res.data?.streamVideoUrl);
              const curUrl = resolvePlayableMediaUrl(activeVideo.streamVideoUrl);
              if (res.data) {
                setActiveVideo((prev) =>
                  prev && prev.id === res.data.id
                    ? { ...prev, ...res.data, streamVideoUrl: res.data.streamVideoUrl || prev.streamVideoUrl }
                    : prev,
                );
              }
              if (nextUrl && nextUrl !== curUrl && !/(?:youtube\.com\/watch|youtu\.be\/)/i.test(nextUrl)) {
                setStreamMode("refreshed");
                return;
              }
            } catch {
              // Fall through directly to backend media proxy
            }
          }
          setStreamRecovering(true);
          setStreamMode("proxy");
          return;
        }

        if (streamMode === "refreshed") {
          setStreamRecovering(true);
          setStreamMode("proxy");
          return;
        }

        if (streamMode === "proxy") {
          setStreamRecovering(false);
          setStreamMode("failed");
          setStreamErrorDetail(errMsg || "Không thể phát luồng video & âm thanh.");
        }
      } finally {
        if (streamRecoveryInFlightRef.current === guardKey) {
          streamRecoveryInFlightRef.current = null;
        }
      }
    },
    [activeVideo?.id, activeVideo?.streamVideoUrl, auth?.accessToken, streamMode],
  );

  const handleRetryVideoStream = useCallback(() => {
    streamRecoveryInFlightRef.current = null;
    setStreamErrorDetail(null);
    setStreamRecovering(true);
    setStreamMode("direct");
    setIsPlaying(true);
    if (!resolvedActiveStreamUrl && activeVideo?.id) {
      void handleStreamPlaybackError("RETRY_STREAM");
    }
  }, [activeVideo?.id, handleStreamPlaybackError, resolvedActiveStreamUrl]);

  useEffect(() => {
    if (viewMode !== "player" || !activeVideo?.id) return;
    if (streamMode === "direct" && !resolvedActiveStreamUrl) {
      void handleStreamPlaybackError("MISSING_OR_WATCH_STREAM_URL");
    }
  }, [activeVideo?.id, handleStreamPlaybackError, resolvedActiveStreamUrl, streamMode, viewMode]);

  const segments: VideoSubtitleSegmentItem[] = useMemo(() => {
    const raw = activeVideo?.segments ?? [];
    return raw
      .map((seg) => ({
        ...seg,
        englishText: cleanSubtitleText(seg.englishText),
        vietnameseText: cleanSubtitleText(seg.vietnameseText),
      }))
      .filter((seg) => seg.englishText.length > 0);
  }, [activeVideo]);

  const totalDurationSec = useMemo(() => {
    if (activeVideo?.durationSeconds && activeVideo.durationSeconds > 0) {
      return activeVideo.durationSeconds;
    }
    if (segments.length > 0) {
      return Math.max(10, Math.ceil(segments[segments.length - 1].endTime));
    }
    return 180;
  }, [activeVideo, segments]);

  // Synchronized active subtitle segment
  const activeSegIndex = useMemo(() => {
    if (segments.length === 0) return 0;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      if (currentTimeSec >= seg.startTime && currentTimeSec < seg.endTime) {
        return i;
      }
    }
    // Nearest segment fallback on seek
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      if (currentTimeSec >= segments[i].startTime) {
        return i;
      }
    }
    return 0;
  }, [currentTimeSec, segments]);

  const activeSegment = segments[activeSegIndex];

  const activeWordIdx = useMemo(() => {
    if (!activeSegment) return -1;
    const tokens = tokenizeSentence(activeSegment.englishText);
    if (tokens.length === 0) return -1;
    const span = Math.max(0.8, activeSegment.endTime - activeSegment.startTime);
    const ratio = Math.max(0, Math.min(0.999, (currentTimeSec - activeSegment.startTime) / span));
    return Math.floor(ratio * tokens.length);
  }, [activeSegment, currentTimeSec]);

  // Master playback timer supporting 0.5x - 2.0x speeds & Repeat Current Subtitle
  useEffect(() => {
    if (!isPlaying || viewMode !== "player" || streamRecovering) return;
    const tickMs = 300;
    const timer = setInterval(() => {
      setCurrentTimeSec((prev) => {
        let next = prev + (tickMs / 1000) * playbackSpeed;
        if (Date.now() - nativeActiveAtRef.current < 900 && lastNativePosRef.current > 0) {
          const maxLead = lastNativePosRef.current + 0.45 * playbackSpeed;
          if (next > maxLead) {
            next = maxLead;
          }
        }
        if (loopCurrentSentence && activeSegment) {
          if (next >= activeSegment.endTime) {
            playerControlRef.current?.seekTo(activeSegment.startTime);
            lastNativePosRef.current = activeSegment.startTime;
            return activeSegment.startTime;
          }
        }
        if (next >= totalDurationSec) {
          playerControlRef.current?.seekTo(0);
          lastNativePosRef.current = 0;
          return 0;
        }
        return next;
      });
    }, tickMs);
    return () => clearInterval(timer);
  }, [activeSegment, isPlaying, loopCurrentSentence, playbackSpeed, streamRecovering, totalDurationSec, viewMode]);

  const handleNativeTimeUpdate = useCallback(
    (nativeTimeSec: number) => {
      if (!Number.isFinite(nativeTimeSec) || nativeTimeSec < 0) return;
      if (loopCurrentSentence && activeSegment && nativeTimeSec >= activeSegment.endTime) {
        playerControlRef.current?.seekTo(activeSegment.startTime);
        lastNativePosRef.current = activeSegment.startTime;
        setCurrentTimeSec(activeSegment.startTime);
        return;
      }
      if (Math.abs(nativeTimeSec - lastNativePosRef.current) > 0.02) {
        lastNativePosRef.current = nativeTimeSec;
        nativeActiveAtRef.current = Date.now();
        if (Math.abs(nativeTimeSec - currentTimeRef.current) > 0.32) {
          setCurrentTimeSec(nativeTimeSec);
        }
      }
    },
    [activeSegment, loopCurrentSentence],
  );

  // Auto-scroll active subtitle card smoothly into upper viewport whenever spoken sentence advances
  useEffect(() => {
    if (viewMode !== "player" || studioTab !== "subtitles" || !autoFollowSubtitle || segments.length === 0) {
      return;
    }
    const targetIdx = Math.max(0, Math.min(segments.length - 1, activeSegIndex));
    subtitleListRef.current?.scrollToIndex({
      index: targetIdx,
      viewPosition: 0.14,
      animated: true,
    });
  }, [activeSegIndex, autoFollowSubtitle, segments.length, studioTab, viewMode]);

  // Auto-save resume playback position every 8 seconds while playing
  useEffect(() => {
    const token = auth?.accessToken;
    const videoId = activeVideo?.id;
    if (!token || !videoId || !isPlaying || viewMode !== "player") return;

    const timer = setInterval(() => {
      void updateVideoLearningState(token, videoId, {
        lastPositionSeconds: currentTimeRef.current,
        playbackSpeed,
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [activeVideo?.id, auth?.accessToken, isPlaying, playbackSpeed, viewMode]);

  // Sync Speechify TTS with current sentence when audio-sync enabled
  useEffect(() => {
    if (!isPlaying || !ttsSyncEnabled || !activeSegment) return;
    if (lastAutoSpokenSeqRef.current === activeSegment.sequenceNumber) return;
    lastAutoSpokenSeqRef.current = activeSegment.sequenceNumber;
    void speakText(activeSegment.englishText);
  }, [activeSegment, isPlaying, speakText, ttsSyncEnabled]);

  const persistProgressSnapshot = (posSec: number, speed: number, extras?: { completed?: boolean; favorite?: boolean }) => {
    if (!auth?.accessToken || !activeVideo?.id) return;
    void updateVideoLearningState(auth.accessToken, activeVideo.id, {
      lastPositionSeconds: posSec,
      playbackSpeed: speed,
      ...extras,
    }).then((res) => {
      if (res.data) {
        if (auth.user && typeof res.data.currentDiamonds === "number") {
          updateUserProfile({ ...auth.user, diamonds: res.data.currentDiamonds });
        }
        if ((res.data.diamondsEarned ?? 0) > 0) {
          showDiamondRewardToast(res.data.diamondsEarned ?? 0, "Hoàn thành Video AI");
        }
        setActiveVideo((prev) =>
          prev
            ? {
                ...res.data,
                streamVideoUrl: res.data.streamVideoUrl || prev.streamVideoUrl,
              }
            : res.data,
        );
        setVideoLibrary((prev) =>
          prev.map((item) =>
            item.id === res.data.id
              ? { ...item, ...res.data, streamVideoUrl: res.data.streamVideoUrl || item.streamVideoUrl }
              : item,
          ),
        );
      }
    });
  };

  const handleToggleCardFavorite = async (video: ImportedVideoDetailData) => {
    if (!auth?.accessToken) return;
    const nextFav = !video.favorite;
    setVideoLibrary((prev) => prev.map((item) => (item.id === video.id ? { ...item, favorite: nextFav } : item)));
    try {
      const res = await updateVideoLearningState(auth.accessToken, video.id, { favorite: nextFav });
      if (res.data) {
        setVideoLibrary((prev) => prev.map((item) => (item.id === video.id ? { ...item, ...res.data } : item)));
      }
    } catch {
      setVideoLibrary((prev) => prev.map((item) => (item.id === video.id ? { ...item, favorite: video.favorite } : item)));
    }
  };

  const handleOpenLibraryVideo = async (summary: ImportedVideoDetailData) => {
    if (!summary.published && summary.latestJob && !["COMPLETED", "FAILED", "CANCELLED"].includes(summary.latestJob.status)) {
      setActiveJob(summary.latestJob);
      Alert.alert(
        "Video đang được xử lý",
        summary.latestJob.currentStageMessage || `Tiến độ hiện tại: ${summary.latestJob.overallProgress}%`,
      );
      return;
    }
    if (!summary.published && summary.latestJob?.status === "FAILED") {
      setActiveJob(summary.latestJob);
      Alert.alert(
        "Video xử lý lỗi",
        summary.latestJob.errorMessage || "Bạn có thể nhấn nút Thử lại hoặc Xóa video này.",
      );
      return;
    }
    if (!auth?.accessToken) {
      openVideoInStudio(summary);
      return;
    }
    try {
      const res = await getPublishedVideoDetail(auth.accessToken, summary.id);
      if (res.data) {
        if ((res.data.segments?.length ?? 0) === 0 && res.data.latestJob && res.data.latestJob.status !== "COMPLETED") {
          setActiveJob(res.data.latestJob);
          Alert.alert(
            "Video chưa sẵn sàng",
            res.data.latestJob.currentStageMessage || "Đang xử lý phụ đề video...",
          );
          return;
        }
        openVideoInStudio(res.data);
      }
    } catch {
      openVideoInStudio(summary);
    }
  };

  useEffect(() => {
    const token = auth?.accessToken;
    const job = activeJob;
    if (!token || !job) return;
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getPersonalVideoJobStatus(token, job.jobId);
        if (cancelled || !res.data) return;
        const nextJob = res.data;
        setActiveJob(nextJob);
        if (nextJob.status === "COMPLETED") {
          await reloadPublishedLibrary();
          setYoutubeUrlInput("");
          setCustomTitleInput("");
          try {
            const detailRes = await getPublishedVideoDetail(token, nextJob.videoId);
            if (!cancelled && detailRes.data && (detailRes.data.segments?.length ?? 0) > 0) {
              openVideoInStudio(detailRes.data);
            }
          } catch {
            // Library refreshed even if auto-open skipped
          }
        } else if (nextJob.status === "FAILED") {
          setImportErrorMsg(nextJob.errorMessage || nextJob.currentStageMessage || "Xử lý video thất bại.");
          void reloadPublishedLibrary();
        } else if (nextJob.status === "CANCELLED") {
          void reloadPublishedLibrary();
        }
      } catch {
        // Retry next interval cleanly
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeJob, auth?.accessToken, openVideoInStudio, reloadPublishedLibrary]);

  const handleImportPersonalUrl = async () => {
    const trimmedUrl = youtubeUrlInput.trim();
    if (!trimmedUrl) {
      Alert.alert("Thiếu link video", "Hãy dán link video YouTube bạn muốn học.");
      return;
    }
    if (!auth?.accessToken) {
      Alert.alert("Cần đăng nhập", "Vui lòng đăng nhập để nhập link video cá nhân.");
      return;
    }
    try {
      setImportingPersonal(true);
      setImportErrorMsg(null);
      const res = await importPersonalVideo(auth.accessToken, {
        videoUrl: trimmedUrl,
        title: customTitleInput.trim() || undefined,
      });
      if (res.data) {
        const imported = res.data;
        await reloadPublishedLibrary();
        if ((imported.segments?.length ?? 0) > 0) {
          setYoutubeUrlInput("");
          setCustomTitleInput("");
          setActiveJob(null);
          openVideoInStudio(imported);
        } else if (imported.latestJob) {
          setActiveJob(imported.latestJob);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể nhập link video này.";
      setImportErrorMsg(msg);
      Alert.alert("Nhập video thất bại", msg);
    } finally {
      setImportingPersonal(false);
    }
  };

  const handleCancelPersonalJob = async () => {
    if (!auth?.accessToken || !activeJob) return;
    try {
      const res = await cancelPersonalVideoJob(auth.accessToken, activeJob.jobId);
      if (res.data) {
        setActiveJob(res.data);
      }
      await reloadPublishedLibrary();
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể hủy tác vụ.");
    }
  };

  const handleRetryPersonalJob = async (jobId: number) => {
    if (!auth?.accessToken) return;
    try {
      setImportErrorMsg(null);
      const res = await retryPersonalVideoJob(auth.accessToken, jobId);
      if (res.data) {
        setActiveJob(res.data);
      }
      await reloadPublishedLibrary();
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể thử lại.");
    }
  };

  const handleDeletePersonalCard = (video: ImportedVideoDetailData) => {
    Alert.alert("Xóa video cá nhân", `Bạn có chắc muốn xóa "${video.title}" khỏi danh sách cá nhân?`, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: () => {
          if (!auth?.accessToken) return;
          void deletePersonalVideo(auth.accessToken, video.id)
            .then(() => {
              if (activeJob?.videoId === video.id) {
                setActiveJob(null);
              }
              return reloadPublishedLibrary();
            })
            .catch((err) => {
              Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể xóa video.");
            });
        },
      },
    ]);
  };

  const handleTogglePlay = () => {
    const next = !isPlayingRef.current;
    setIsPlaying(next);
    playerControlRef.current?.setPlaying(next);
    if (!next) {
      stopSpeaking();
      persistProgressSnapshot(currentTimeRef.current, playbackSpeed);
    }
  };

  const handleSeekTo = useCallback(
    (sec: number, autoPlay = false) => {
      const clamped = Math.max(0, Math.min(totalDurationSec, sec));
      setCurrentTimeSec(clamped);
      lastNativePosRef.current = clamped;
      playerControlRef.current?.seekTo(clamped);
      lastAutoSpokenSeqRef.current = null;
      if (autoPlay && !isPlayingRef.current) {
        setIsPlaying(true);
        playerControlRef.current?.setPlaying(true);
      }
    },
    [totalDurationSec],
  );

  const handleSeekSegment = useCallback(
    (startTime: number) => {
      setAutoFollowSubtitle(true);
      handleSeekTo(startTime, true);
    },
    [handleSeekTo],
  );

  const handleCycleSpeed = () => {
    const nextIdx = (playbackSpeedIdx + 1) % PLAYBACK_SPEEDS.length;
    const nextRate = PLAYBACK_SPEEDS[nextIdx];
    setPlaybackSpeedIdx(nextIdx);
    playerControlRef.current?.setRate(nextRate);
    persistProgressSnapshot(currentTimeRef.current, nextRate);
  };

  const handleSpeakSegment = useCallback(
    (seg: VideoSubtitleSegmentItem) => {
      if (speakingSegSeqRef.current === seg.sequenceNumber) {
        stopSpeaking();
        setSpeakingSegSeq(null);
        return;
      }
      handleSeekTo(seg.startTime, false);
      setSpeakingSegSeq(seg.sequenceNumber);
      void speakText(seg.englishText).finally(() => {
        setSpeakingSegSeq((cur) => (cur === seg.sequenceNumber ? null : cur));
      });
    },
    [handleSeekTo, speakText, stopSpeaking],
  );

  const handleReplayCurrentSentence = () => {
    if (!activeSegment) return;
    setAutoFollowSubtitle(true);
    handleSeekTo(activeSegment.startTime, true);
    if (ttsSyncEnabled || !resolvedActiveStreamUrl || streamMode === "failed") {
      void speakText(activeSegment.englishText);
    }
  };

  const handlePressWord = useCallback(
    async (rawToken: string, seg: VideoSubtitleSegmentItem) => {
      const cleaned = cleanWordToken(rawToken);
      if (!cleaned) return;

      if (isPlayingRef.current) {
        setIsPlaying(false);
        playerControlRef.current?.setPlaying(false);
      }
      setSelectedWordToken(cleaned);
      setWordModalVisible(true);

      const localMatch = (activeVideo?.vocabulary || []).find(
        (v) =>
          v.word.toLowerCase() === cleaned.toLowerCase() ||
          v.normalizedWord.toLowerCase() === cleaned.toLowerCase(),
      );
      if (localMatch) {
        setWordLookupData(localMatch);
        setLoadingWordLookup(false);
        return;
      }

      if (!auth?.accessToken) return;
      try {
        setLoadingWordLookup(true);
        setWordLookupData(null);
        const res = await lookupYoutubeWord(auth.accessToken, {
          word: cleaned,
          contextSentence: seg.englishText,
          videoTitle: activeVideo?.title,
        });
        if (res.data) {
          setWordLookupData(res.data);
        }
      } catch {
        setWordLookupData({
          word: cleaned,
          normalizedWord: cleaned.toLowerCase(),
          pronunciation: `/${cleaned.toLowerCase()}/`,
          partOfSpeech: "Từ vựng ngữ cảnh",
          meaningVi: `Từ "${cleaned}" trong câu: "${seg.vietnameseText}"`,
          meaningEn: seg.englishText,
          exampleSentence: seg.englishText,
          exampleTranslation: seg.vietnameseText,
          grammarNote: "Chạm Yêu thích để lưu vào Flashcards.",
          source: "CONTEXT",
        });
      } finally {
        setLoadingWordLookup(false);
      }
    },
    [activeVideo, auth],
  );

  const handleSaveWordToFlashcards = async (item: YoutubeWordLookupData) => {
    if (!auth?.accessToken) return;
    const key = (item.normalizedWord || item.word).trim().toLowerCase();
    if (savedWordsMap[key]) {
      Alert.alert("Đã lưu", `Từ "${item.word}" đã nằm trong Flashcards.`);
      return;
    }
    try {
      setSavingFavorite(true);
      const cleanedMeaning = cleanMeaningText(item.meaningVi) || item.word.trim();
      const rawCombinedEx = item.exampleTranslation
        ? `${item.exampleSentence} — ${item.exampleTranslation}`
        : item.exampleSentence;
      const cleanedExample = cleanStudyText(rawCombinedEx);
      await createMyFlashcard(auth.accessToken, {
        englishWord: item.word.slice(0, 140),
        meaningVi: cleanedMeaning.slice(0, 240),
        pronunciation: (item.pronunciation || "").slice(0, 95),
        exampleSentence: cleanedExample ? cleanedExample.slice(0, 480) : undefined,
      });
      setSavedWordsMap((prev) => ({
        ...prev,
        [key]: true,
        [item.word.trim().toLowerCase()]: true,
      }));
      Alert.alert("Đã lưu vào Flashcards!", `Từ "${item.word}" đã được thêm vào mục Ôn tập.`);
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể lưu từ.");
    } finally {
      setSavingFavorite(false);
    }
  };

  const handleAddBookmark = async () => {
    if (!auth?.accessToken || !activeVideo?.id) return;
    try {
      const label = bookmarkLabelInput.trim() || activeSegment?.englishText.slice(0, 45) || `Mốc ${formatClock(currentTimeSec)}`;
      const res = await addVideoBookmark(auth.accessToken, activeVideo.id, {
        timestampSeconds: currentTimeSec,
        label,
        note: bookmarkNoteInput.trim(),
      });
      if (res.data) {
        setActiveVideo((prev) =>
          prev
            ? { ...prev, bookmarks: [...(prev.bookmarks || []), res.data].sort((a, b) => a.timestampSeconds - b.timestampSeconds) }
            : prev,
        );
        setBookmarkLabelInput("");
        setBookmarkNoteInput("");
        Alert.alert("Đã đánh dấu!", `Đã lưu bookmark tại mốc ${res.data.timestampLabel}`);
      }
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể lưu bookmark.");
    }
  };

  const handleDeleteBookmark = async (bm: VideoBookmarkItem) => {
    if (!auth?.accessToken || !activeVideo?.id) return;
    try {
      await deleteVideoBookmark(auth.accessToken, activeVideo.id, bm.id);
      setActiveVideo((prev) =>
        prev ? { ...prev, bookmarks: (prev.bookmarks || []).filter((item) => item.id !== bm.id) } : prev,
      );
    } catch {
      // Ignore error
    }
  };

  const handleExportSubtitles = async (format: "srt_en" | "srt_vi" | "srt_bilingual" | "vtt" | "json") => {
    if (!auth?.accessToken || !activeVideo?.id) return;
    try {
      setExportingFormat(format);
      const content = await exportVideoSubtitlesText(auth.accessToken, activeVideo.id, format);
      const ext = format === "vtt" ? "vtt" : format === "json" ? "json" : "srt";
      const fileName = `${activeVideo.videoUid}_${format}.${ext}`;

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        setExportModalVisible(false);
        return;
      }

      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true });
      await file.write(content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert("Đã xuất tệp UTF-8", `Đã lưu tại: ${file.uri}`);
      }
      setExportModalVisible(false);
    } catch (err) {
      Alert.alert("Xuất phụ đề thất bại", err instanceof Error ? err.message : "Lỗi hệ thống.");
    } finally {
      setExportingFormat(null);
    }
  };

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const v of videoLibrary) {
      if (v.topic?.trim()) {
        set.add(v.topic.trim());
      }
    }
    return ["Tất cả", ...Array.from(set)];
  }, [videoLibrary]);

  const filteredLibrary = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videoLibrary.filter((v) => {
      if (onlyFavorites && !v.favorite) return false;
      if (selectedLevel !== "Tất cả" && (v.level || "").toUpperCase() !== selectedLevel.toUpperCase()) {
        return false;
      }
      if (selectedTopic !== "Tất cả" && (v.topic || "").toLowerCase() !== selectedTopic.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        v.title.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q) ||
        (v.authorName || "").toLowerCase().includes(q) ||
        (v.level || "").toLowerCase().includes(q) ||
        (v.topic || "").toLowerCase().includes(q)
      );
    });
  }, [onlyFavorites, searchQuery, selectedLevel, selectedTopic, videoLibrary]);

  const currentDrillSeg = segments[drillIdx] || segments[0];
  const drillData = useMemo(() => {
    if (!currentDrillSeg) return { masked: "", target: "", options: [] as string[] };
    const tokens = tokenizeSentence(currentDrillSeg.englishText);
    const idx = Math.max(0, tokens.findIndex((t) => cleanWordToken(t).length >= 5));
    const target = cleanWordToken(tokens[idx] || "english");
    const masked = tokens.map((t, i) => (i === idx ? " [ _____ ] " : t)).join(" ");
    const pool = ["schedule", "fluently", "priority", "consistent", "management", "negotiate"].filter(
      (w) => w.toLowerCase() !== target.toLowerCase(),
    );
    return { masked, target, options: [target, ...pool.slice(0, 3)].sort() };
  }, [currentDrillSeg]);

  const progressRatio = totalDurationSec > 0 ? Math.max(0, Math.min(1, currentTimeSec / totalDurationSec)) : 0;
  const activeClockLabel = formatClock(currentTimeSec);

  const renderSubtitleItem = useCallback(
    ({ item, index }: { item: VideoSubtitleSegmentItem; index: number }) => {
      const isCurrent = index === activeSegIndex;
      return (
        <SubtitleSentenceRow
          activeFontSize={activeFontSize}
          activeWordIdx={isCurrent ? activeWordIdx : -1}
          asrEngine={activeVideo?.asrEngine || "ASR"}
          currentClockLabel={isCurrent ? activeClockLabel : ""}
          isCurrent={isCurrent}
          isSpeaking={speakingSegSeq === item.sequenceNumber}
          onPressWord={handlePressWord}
          onSeekSegment={handleSeekSegment}
          onSpeakSegment={handleSpeakSegment}
          savedWordsMap={savedWordsMap}
          seg={item}
          subtitleFilter={subtitleFilter}
          styles={styles}
        />
      );
    },
    [
      activeClockLabel,
      activeFontSize,
      activeSegIndex,
      activeVideo?.asrEngine,
      activeWordIdx,
      handlePressWord,
      handleSeekSegment,
      handleSpeakSegment,
      savedWordsMap,
      speakingSegSeq,
      styles,
      subtitleFilter,
    ],
  );

  return (
    <>
      <StatusBar
        barStyle={viewMode === "player" && activeVideo ? "light-content" : theme.colors.isDark ? "light-content" : "dark-content"}
      />
      {viewMode === "hub" ? (
        <UserScreen contentStyle={styles.screenContent} scrollable>
          {/* ============================================================================
           * VIEW 1: PUBLISHED USER VIDEO LEARNING LIBRARY
           * ============================================================================ */}
          <View style={styles.hubContainer}>
          <View style={styles.hubHeaderRow}>
            <Pressable onPress={() => safeBack("/user/home")} style={styles.hubBackBtn}>
              <Ionicons color={theme.colors.text} name="arrow-back" size={20} />
            </Pressable>
            <Text numberOfLines={1} style={styles.hubHeaderTitle}>
              Thư viện Video Song ngữ
            </Text>
            <Pressable
              onPress={() => void reloadPublishedLibrary()}
              style={styles.hubActionIconBtn}
            >
              <Ionicons color={theme.colors.primary} name="refresh-outline" size={19} />
            </Pressable>
          </View>

          {/* Curated Library Banner + User Personal Video Import */}
          <View style={styles.importCard}>
            <Pressable
              onPress={() => setImportPanelOpen((prev) => !prev)}
              style={styles.importCardHeader}
            >
              <View style={styles.youtubeBadgeBox}>
                <View style={styles.youtubePlayCircle}>
                  <Ionicons color="#FFFFFF" name="play" size={16} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.importCardTitle}>Video Song ngữ & Nhập link cá nhân</Text>
                <Text style={styles.importCardSubtitle}>
                  Học video do Admin biên tập hoặc dán link YouTube riêng để AI tạo phụ đề ngắn gọn, sạch & đồng bộ.
                </Text>
              </View>
              <Ionicons
                color={theme.colors.textMuted}
                name={importPanelOpen ? "chevron-up" : "chevron-down"}
                size={20}
              />
            </Pressable>

            {importPanelOpen ? (
              <View style={{ gap: 10, paddingTop: 2 }}>
                <View style={styles.urlRow}>
                  <View style={styles.urlInputBox}>
                    <Ionicons color="#EF4444" name="logo-youtube" size={18} />
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setYoutubeUrlInput}
                      placeholder="Dán link YouTube (https://youtu.be/...)"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.urlTextInput}
                      value={youtubeUrlInput}
                    />
                    {youtubeUrlInput.length > 0 ? (
                      <Pressable onPress={() => setYoutubeUrlInput("")}>
                        <Ionicons color={theme.colors.textMuted} name="close-circle" size={17} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.urlInputBox}>
                  <Ionicons color={theme.colors.primary} name="create-outline" size={17} />
                  <TextInput
                    onChangeText={setCustomTitleInput}
                    placeholder="Tiêu đề tùy chọn (bỏ trống AI tự tóm tắt)"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.urlTextInput}
                    value={customTitleInput}
                  />
                </View>

                <Pressable
                  disabled={importingPersonal}
                  onPress={() => void handleImportPersonalUrl()}
                  style={[styles.redImportBtn, importingPersonal && { opacity: 0.7 }]}
                >
                  {importingPersonal ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Ionicons color="#FFFFFF" name="sparkles" size={18} />
                  )}
                  <Text style={styles.redImportBtnText}>
                    {importingPersonal ? "Đang gửi xử lý AI..." : "Nhập link & Tạo phụ đề song ngữ"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {activeJob ? (
            <View style={styles.jobProgressCard}>
              <View style={styles.jobHeaderRow}>
                <Text style={styles.jobTitleText}>
                  {activeJob.status === "COMPLETED"
                    ? "✓ Hoàn tất xử lý video cá nhân"
                    : activeJob.status === "FAILED"
                      ? "✕ Xử lý video gặp lỗi"
                      : activeJob.status === "CANCELLED"
                        ? "Đã hủy xử lý video"
                        : `Đang xử lý video cá nhân (${activeJob.overallProgress}%)`}
                </Text>
                <Text style={styles.jobChunkText}>{activeJob.status}</Text>
              </View>
              <View style={styles.jobBarTrack}>
                <View style={[styles.jobBarFill, { width: `${Math.max(4, activeJob.overallProgress || 0)}%` }]} />
              </View>
              {activeJob.currentStageMessage ? (
                <Text style={styles.jobMessageText}>{activeJob.currentStageMessage}</Text>
              ) : null}
              {importErrorMsg || activeJob.errorMessage ? (
                <Text style={styles.jobErrorText}>{importErrorMsg || activeJob.errorMessage}</Text>
              ) : null}
              <View style={styles.jobBtnRow}>
                {!["COMPLETED", "FAILED", "CANCELLED"].includes(activeJob.status) ? (
                  <Pressable onPress={() => void handleCancelPersonalJob()} style={styles.jobCancelBtn}>
                    <Text style={styles.jobBtnText}>Hủy xử lý</Text>
                  </Pressable>
                ) : activeJob.status === "FAILED" ? (
                  <Pressable onPress={() => void handleRetryPersonalJob(activeJob.jobId)} style={styles.jobRetryBtn}>
                    <Text style={styles.jobBtnText}>Thử lại</Text>
                  </Pressable>
                ) : null}
                {["COMPLETED", "FAILED", "CANCELLED"].includes(activeJob.status) ? (
                  <Pressable onPress={() => setActiveJob(null)} style={styles.jobRetryBtn}>
                    <Text style={styles.jobBtnText}>Ẩn thông báo</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Search & Video Bookmark Filter */}
          <View style={styles.searchFilterRow}>
            <View style={styles.searchInputWrap}>
              <Ionicons color={theme.colors.primary} name="search-outline" size={18} />
              <TextInput
                onChangeText={setSearchQuery}
                placeholder="Tìm tiêu đề, mô tả, kênh, chủ đề..."
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchTextInput}
                value={searchQuery}
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Ionicons color={theme.colors.textMuted} name="close-circle" size={17} />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setOnlyFavorites((prev) => !prev)}
              style={[styles.favoriteFilterBtn, onlyFavorites && styles.favoriteFilterBtnActive]}
            >
              <Ionicons color="#F43F5E" name={onlyFavorites ? "bookmark" : "bookmark-outline"} size={16} />
              <Text style={styles.favoriteFilterText}>Đã lưu</Text>
            </Pressable>
          </View>

          {/* Level & Topic Filter Chips */}
          <ScrollView
            contentContainerStyle={{ alignItems: "center", gap: 8, paddingVertical: 2 }}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 0 }}
          >
            {LEVEL_FILTERS.map((lvl) => {
              const active = selectedLevel === lvl;
              return (
                <Pressable
                  key={lvl}
                  onPress={() => setSelectedLevel(lvl)}
                  style={[
                    styles.dropdownPill,
                    { flex: 0, height: 36, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 0 },
                    active && { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.dropdownPillText,
                      active && { color: theme.colors.primary, fontWeight: "800" },
                    ]}
                  >
                    {lvl === "Tất cả" ? "Mọi trình độ" : `Level ${lvl}`}
                  </Text>
                </Pressable>
              );
            })}
            {availableTopics
              .filter((t) => t !== "Tất cả")
              .map((tp) => {
                const active = selectedTopic === tp;
                return (
                  <Pressable
                    key={tp}
                    onPress={() => setSelectedTopic(active ? "Tất cả" : tp)}
                    style={[
                      styles.dropdownPill,
                      { flex: 0, height: 36, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 0 },
                      active && {
                        backgroundColor: theme.colors.isDark ? "rgba(16,185,129,0.22)" : "#DCFCE7",
                        borderColor: "#10B981",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownPillText,
                        active && { color: theme.colors.isDark ? "#34D399" : "#047857", fontWeight: "800" },
                      ]}
                    >
                      {tp}
                    </Text>
                  </Pressable>
                );
              })}
          </ScrollView>

          {loadingLibrary ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 20 }} />
          ) : filteredLibrary.length === 0 ? (
            <View style={styles.videoOfTheDayCard}>
              <Text style={styles.vodTitle}>Chưa có video phù hợp trong thư viện</Text>
              <Text style={styles.vodSourceMeta}>
                {videoLibrary.length === 0
                  ? "Các bài học video sẽ xuất hiện tại đây ngay sau khi Ban quản trị duyệt và xuất bản."
                  : "Hãy thử xóa từ khóa tìm kiếm hoặc chọn lại bộ lọc trình độ / chủ đề."}
              </Text>
            </View>
          ) : (
            filteredLibrary.map((video) => {
              const watchPct =
                video.completed
                  ? 100
                  : video.durationSeconds > 0
                    ? Math.min(99, Math.round((video.lastPositionSeconds / video.durationSeconds) * 100))
                    : 0;
              return (
                <Pressable
                  key={video.id}
                  onPress={() => void handleOpenLibraryVideo(video)}
                  style={styles.videoOfTheDayCard}
                >
                  {video.thumbnailUrl ? (
                    <View style={{ borderRadius: 14, height: 164, overflow: "hidden", position: "relative", width: "100%" }}>
                      <Image
                        resizeMode="cover"
                        source={{ uri: video.thumbnailUrl }}
                        style={{ height: "100%", width: "100%" }}
                      />
                      <View
                        style={{
                          backgroundColor: "rgba(8,14,30,0.82)",
                          borderRadius: 8,
                          bottom: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          position: "absolute",
                          right: 8,
                        }}
                      >
                        <Text style={{ color: "#F8FAFC", fontSize: 11.5, fontWeight: "900" }}>
                          {video.durationLabel || formatClock(video.durationSeconds)}
                        </Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation();
                          void handleToggleCardFavorite(video);
                        }}
                        style={{
                          alignItems: "center",
                          backgroundColor: "rgba(8,14,30,0.75)",
                          borderRadius: 999,
                          height: 34,
                          justifyContent: "center",
                          position: "absolute",
                          right: 8,
                          top: 8,
                          width: 34,
                        }}
                      >
                        <Ionicons
                          color={video.favorite ? "#F43F5E" : "#F8FAFC"}
                          name={video.favorite ? "bookmark" : "bookmark-outline"}
                          size={17}
                        />
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.vodTopBadgesRow}>
                    <View style={styles.vodFireBadge}>
                      <Text style={styles.vodFireBadgeText}>
                        {!video.published
                          ? video.latestJob && !["COMPLETED", "FAILED", "CANCELLED"].includes(video.latestJob.status)
                            ? `CÁ NHÂN • ${video.latestJob.overallProgress}%`
                            : video.latestJob?.status === "FAILED"
                              ? "CÁ NHÂN • LỖI"
                              : "VIDEO CỦA TÔI"
                          : video.completed
                            ? "✓ ĐÃ HOÀN THÀNH"
                            : video.topic || "General English"}
                      </Text>
                    </View>

                    <View style={styles.vodRightMetaRow}>
                      {!video.published && video.latestJob?.status === "FAILED" ? (
                        <Pressable
                          hitSlop={6}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (video.latestJob?.jobId) {
                              void handleRetryPersonalJob(video.latestJob.jobId);
                            }
                          }}
                          style={styles.jobRetryBtn}
                        >
                          <Text style={styles.jobBtnText}>Thử lại</Text>
                        </Pressable>
                      ) : null}
                      {!video.published ? (
                        <Pressable
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeletePersonalCard(video);
                          }}
                        >
                          <Ionicons color="#EF4444" name="trash-outline" size={17} />
                        </Pressable>
                      ) : null}
                      <View style={styles.vodLevelBadge}>
                        <Text style={styles.vodLevelBadgeText}>{video.level || "B1"}</Text>
                      </View>
                      {!video.thumbnailUrl ? (
                        <Text style={styles.vodDurationText}>
                          {video.durationLabel || formatClock(video.durationSeconds)}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.vodTitle}>{video.title}</Text>
                  {video.description ? (
                    <Text numberOfLines={2} style={styles.vodSourceMeta}>
                      {cleanSubtitleText(video.description)}
                    </Text>
                  ) : null}
                  <Text style={styles.vodSourceMeta}>
                    {video.authorName || video.platform} • Đã học{" "}
                    {formatClock(video.lastPositionSeconds)} / {formatClock(video.durationSeconds)} ({watchPct}%)
                  </Text>
                  <View style={styles.jobBarTrack}>
                    <View style={[styles.jobBarFill, { width: `${watchPct}%` }]} />
                  </View>
                </Pressable>
              );
            })
          )}
          </View>
        </UserScreen>
      ) : activeVideo ? (
        /* ============================================================================
         * VIEW 2: IN-APP FULL-LENGTH PLAYER & STUDIO (TRUE EDGE-TO-EDGE FULLSCREEN)
         * ============================================================================ */
        <View style={[styles.playerStudioContainer, { paddingBottom: insets.bottom }]}>
          <View style={[styles.studioTopBar, { paddingTop: Math.max(insets.top, 8) + 4 }]}>
            <Pressable
              onPress={() => {
                setIsPlaying(false);
                playerControlRef.current?.setPlaying(false);
                stopSpeaking();
                persistProgressSnapshot(currentTimeRef.current, playbackSpeed);
                setViewMode("hub");
              }}
              style={styles.studioTopIconBtn}
            >
              <Ionicons color="#F8FAFC" name="arrow-back" size={22} />
            </Pressable>

            <Text numberOfLines={1} style={styles.studioTopTitle}>
              {activeVideo.title}
            </Text>

            <Pressable onPress={() => setExportModalVisible(true)} style={styles.studioTopIconBtn}>
              <Ionicons color="#38BDF8" name="download-outline" size={21} />
            </Pressable>

            <Pressable
              onPress={() => persistProgressSnapshot(currentTimeRef.current, playbackSpeed, { favorite: !activeVideo.favorite })}
              style={styles.studioTopIconBtn}
            >
              <Ionicons
                color={activeVideo.favorite ? "#F43F5E" : "#CBD5E1"}
                name={activeVideo.favorite ? "heart" : "heart-outline"}
                size={21}
              />
            </Pressable>

            <Pressable
              onPress={() => persistProgressSnapshot(currentTimeRef.current, playbackSpeed, { completed: !activeVideo.completed })}
              style={styles.studioTopIconBtn}
            >
              <Ionicons
                color={activeVideo.completed ? "#10B981" : "#CBD5E1"}
                name={activeVideo.completed ? "checkmark-circle" : "checkmark-circle-outline"}
                size={21}
              />
            </Pressable>
          </View>

          {/* 16:9 In-App Video Surface */}
          <View style={[styles.videoFrameContainer, expandedVideoHeight && styles.videoFrameExpanded]}>
            <VideoErrorBoundary
              onOpenExternal={() => {
                const target = activeVideo.canonicalUrl || activeVideo.sourceUrl;
                if (target) void WebBrowser.openBrowserAsync(target);
              }}
            >
              <InlineStudioVideoSurface
                key={`${activeVideo.id}-${streamMode}-${resolvedActiveStreamUrl}`}
                accessToken={auth?.accessToken}
                controlRef={playerControlRef}
                initialSeekSec={streamSeekAnchorSec}
                isPlaying={isPlaying}
                muted={ttsSyncEnabled}
                onNativeReady={() => {
                  setStreamRecovering(false);
                  setStreamErrorDetail(null);
                }}
                onNativeTimeUpdate={handleNativeTimeUpdate}
                onPlaybackError={(msg) => void handleStreamPlaybackError(msg)}
                playbackSpeed={playbackSpeed}
                videoUrl={resolvedActiveStreamUrl}
              />
            </VideoErrorBoundary>

            {streamRecovering && streamMode !== "failed" ? (
              <View style={styles.streamStatusPill}>
                <ActivityIndicator color="#38BDF8" size="small" />
                <Text style={styles.streamStatusPillText}>Đang làm mới luồng video & âm thanh...</Text>
              </View>
            ) : null}

            {streamMode === "failed" ? (
              <View style={styles.streamErrorOverlay}>
                <Ionicons color="#38BDF8" name="cloud-offline-outline" size={26} />
                <Text style={styles.streamErrorTitle}>Chưa phát được video gốc trực tiếp</Text>
                <Text numberOfLines={2} style={styles.streamErrorSub}>
                  {streamErrorDetail || "Luồng phát tạm gián đoạn. Bạn có thể thử lại hoặc nghe giọng đọc AI đồng bộ phụ đề."}
                </Text>
                <View style={styles.streamErrorBtnRow}>
                  <Pressable onPress={handleRetryVideoStream} style={styles.streamRetryBtn}>
                    <Ionicons color="#082F49" name="refresh" size={14} />
                    <Text style={styles.streamRetryBtnText}>Thử phát lại</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      lastAutoSpokenSeqRef.current = null;
                      setTtsSyncEnabled(true);
                      setIsPlaying(true);
                    }}
                    style={styles.streamAiVoiceBtn}
                  >
                    <Ionicons color="#F8FAFC" name="volume-high" size={14} />
                    <Text style={styles.streamAiVoiceBtnText}>Nghe giọng AI</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {!isPlaying && currentTimeSec < 1 && activeVideo.thumbnailUrl ? (
              <Pressable onPress={handleTogglePlay} style={StyleSheet.absoluteFill}>
                <Image resizeMode="contain" source={{ uri: activeVideo.thumbnailUrl }} style={styles.videoPosterImage} />
                <View style={styles.videoPosterPlayOverlay}>
                  <View style={styles.videoBigPlayCircle}>
                    <Ionicons color="#082F49" name="play" size={28} />
                  </View>
                </View>
              </Pressable>
            ) : null}

            <Pressable onPress={() => setCcEnabled((prev) => !prev)} style={styles.ccOverlayBadge}>
              <Text style={styles.ccOverlayBadgeText}>{ccEnabled ? "CC Bật" : "CC Tắt"}</Text>
            </Pressable>

            {ccEnabled && activeSegment ? (
              <View pointerEvents="none" style={styles.onVideoSubtitleBox}>
                <Text numberOfLines={2} style={styles.onVideoSubtitleEn}>
                  {activeSegment.englishText}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Scrubber & Transport Controls */}
          <View style={styles.transportSection}>
            <View style={styles.scrubberRow}>
              <Text style={styles.scrubberTimeText}>{formatClock(currentTimeSec)}</Text>
              <View style={styles.scrubberBarTrackWrap}>
                <View style={styles.scrubberTrackBg}>
                  <View style={[styles.scrubberTrackFill, { width: `${Math.round(progressRatio * 100)}%` }]} />
                </View>
                <View
                  style={[
                    styles.scrubberThumbDot,
                    { left: `${Math.max(0, Math.min(96, Math.round(progressRatio * 100)))}%` },
                  ]}
                />
                <View style={styles.scrubberTapLayer}>
                  {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((ratio) => (
                    <Pressable key={ratio} onPress={() => handleSeekTo(ratio * totalDurationSec, true)} style={{ flex: 1, height: 28 }} />
                  ))}
                </View>
              </View>
              <Text style={styles.scrubberTimeText}>{formatClock(totalDurationSec)}</Text>
            </View>

            <View style={styles.transportControlsRow}>
              <Pressable onPress={() => handleSeekTo(currentTimeSec - 10)} style={styles.transportIconBtn}>
                <Ionicons color="#E2E8F0" name="play-back-outline" size={17} />
                <Text style={styles.transportSeekSubText}>10</Text>
              </Pressable>

              <Pressable onPress={handleTogglePlay} style={styles.transportPlayCircleBtn}>
                <Ionicons color="#082F49" name={isPlaying ? "pause" : "play"} size={21} />
              </Pressable>

              <Pressable onPress={() => handleSeekTo(currentTimeSec + 10)} style={styles.transportIconBtn}>
                <Ionicons color="#E2E8F0" name="play-forward-outline" size={17} />
                <Text style={styles.transportSeekSubText}>10</Text>
              </Pressable>

              <Pressable onPress={handleReplayCurrentSentence} style={styles.speedPillBtn}>
                <Text style={styles.speedPillText}>⟲ Câu</Text>
              </Pressable>

              <Pressable
                onPress={() => setLoopCurrentSentence((prev) => !prev)}
                style={[styles.loopSentenceBtn, loopCurrentSentence && styles.loopSentenceBtnActive]}
              >
                <Ionicons color={loopCurrentSentence ? "#F59E0B" : "#94A3B8"} name="repeat" size={15} />
                <Text style={[styles.loopSentenceText, loopCurrentSentence && styles.loopSentenceTextActive]}>Lặp</Text>
              </Pressable>

              <Pressable onPress={handleCycleSpeed} style={styles.speedPillBtn}>
                <Text style={styles.speedPillText}>{playbackSpeed}x</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const next = !ttsSyncEnabled;
                  lastAutoSpokenSeqRef.current = null;
                  setTtsSyncEnabled(next);
                  if (!next) stopSpeaking();
                }}
                style={styles.transportIconBtn}
              >
                <Ionicons
                  color={ttsSyncEnabled ? "#38BDF8" : "#E2E8F0"}
                  name={ttsSyncEnabled ? "headset" : "volume-high"}
                  size={18}
                />
              </Pressable>

              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web" && resolvedActiveStreamUrl && playerControlRef.current?.enterFullscreen) {
                    playerControlRef.current.enterFullscreen();
                  } else {
                    setExpandedVideoHeight((prev) => !prev);
                  }
                }}
                style={styles.transportIconBtn}
              >
                <Ionicons color="#E2E8F0" name={expandedVideoHeight ? "contract-outline" : "scan-outline"} size={17} />
              </Pressable>
            </View>
          </View>

          {/* 6 Studio Tabs */}
          <View style={styles.studioTabsBarWrap}>
            <ScrollView contentContainerStyle={styles.studioTabsBar} horizontal showsHorizontalScrollIndicator={false}>
              {[
                { key: "subtitles" as const, icon: "albums-outline" as const, label: `Phụ đề (${segments.length})` },
                { key: "listening" as const, icon: "ear-outline" as const, label: "Luyện nghe" },
                { key: "shadowing" as const, icon: "mic-outline" as const, label: "Shadowing" },
                { key: "vocabulary" as const, icon: "book-outline" as const, label: `Từ vựng (${activeVideo.vocabulary.length})` },
                { key: "exercises" as const, icon: "help-circle-outline" as const, label: `Bài tập (${activeVideo.exercises.length})` },
                { key: "bookmarks" as const, icon: "bookmark-outline" as const, label: `Đánh dấu (${activeVideo.bookmarks.length})` },
              ].map((t) => {
                const active = studioTab === t.key;
                return (
                  <Pressable key={t.key} onPress={() => setStudioTab(t.key)} style={[styles.studioTabItem, active && styles.studioTabItemActive]}>
                    <Ionicons color={active ? "#06B6D4" : "#94A3B8"} name={t.icon} size={15} />
                    <Text style={[styles.studioTabLabel, active && styles.studioTabLabelActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {studioTab === "subtitles" ? (
            <View style={styles.subtitlesTabPane}>
              <View style={styles.subtitleToolbarRow}>
                <ScrollView contentContainerStyle={styles.langPillsRow} horizontal showsHorizontalScrollIndicator={false}>
                  {[
                    { key: "en-vi" as const, label: "Song ngữ" },
                    { key: "en-only" as const, label: "Chỉ Tiếng Anh" },
                    { key: "vi-only" as const, label: "Chỉ Tiếng Việt" },
                    { key: "en-note" as const, label: "ASR" },
                  ].map((pill) => {
                    const active = subtitleFilter === pill.key;
                    return (
                      <Pressable
                        key={pill.key}
                        onPress={() => setSubtitleFilter(pill.key)}
                        style={[styles.langFilterPill, active && styles.langFilterPillActive]}
                      >
                        <Text style={[styles.langFilterPillText, active && styles.langFilterPillTextActive]}>
                          {pill.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Pressable
                  onPress={() => setAutoFollowSubtitle((prev) => !prev)}
                  style={[styles.autoFollowPillBtn, autoFollowSubtitle && styles.autoFollowPillBtnActive]}
                >
                  <Ionicons
                    color={autoFollowSubtitle ? "#082F49" : "#CBD5E1"}
                    name={autoFollowSubtitle ? "locate" : "locate-outline"}
                    size={13}
                  />
                  <Text style={[styles.autoFollowPillText, autoFollowSubtitle && styles.autoFollowPillTextActive]}>
                    Tự cuộn
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setFontSizeIdx((prev) => (prev + 1) % FONT_SIZES.length)}
                  style={styles.fontSizePillBtn}
                >
                  <Text style={styles.fontSizePillText}>{FONT_SIZES[fontSizeIdx]?.key}</Text>
                </Pressable>
              </View>

              <FlatList
                ref={subtitleListRef}
                contentContainerStyle={styles.subtitleFlatListContent}
                data={segments}
                extraData={{
                  activeClockLabel,
                  activeFontSize,
                  activeSegIndex,
                  activeWordIdx,
                  savedWordsMap,
                  speakingSegSeq,
                  subtitleFilter,
                }}
                initialNumToRender={10}
                keyExtractor={(item) => `${item.sequenceNumber}-${item.startTime}`}
                maxToRenderPerBatch={8}
                onScrollBeginDrag={() => setAutoFollowSubtitle(false)}
                onScrollToIndexFailed={(info) => {
                  subtitleListRef.current?.scrollToOffset({
                    offset: Math.max(0, info.averageItemLength * info.index),
                    animated: true,
                  });
                  setTimeout(() => {
                    subtitleListRef.current?.scrollToIndex({
                      index: Math.max(0, Math.min(info.index, segments.length - 1)),
                      viewPosition: 0.14,
                      animated: true,
                    });
                  }, 120);
                }}
                removeClippedSubviews={Platform.OS === "android"}
                renderItem={renderSubtitleItem}
                showsVerticalScrollIndicator={false}
                updateCellsBatchingPeriod={40}
                windowSize={5}
              />

              {!autoFollowSubtitle && segments.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setAutoFollowSubtitle(true);
                    subtitleListRef.current?.scrollToIndex({
                      index: Math.max(0, Math.min(segments.length - 1, activeSegIndex)),
                      viewPosition: 0.14,
                      animated: true,
                    });
                  }}
                  style={styles.backToActiveFloatingBtn}
                >
                  <Ionicons color="#082F49" name="arrow-down-circle" size={16} />
                  <Text style={styles.backToActiveFloatingText}>Về câu đang nói</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
          <ScrollView contentContainerStyle={styles.studioBodyScroll} showsVerticalScrollIndicator={false}>

            {studioTab === "listening" && currentDrillSeg ? (
              <View style={styles.tabPanelCard}>
                <View style={styles.tabPanelHeaderRow}>
                  <Text style={styles.tabPanelTitle}>🎧 Luyện nghe câu {drillIdx + 1}/{segments.length}</Text>
                  <Pressable onPress={() => void handleSpeakSegment(currentDrillSeg)} style={styles.primaryPillCta}>
                    <Text style={styles.primaryPillCtaText}>Nghe câu</Text>
                  </Pressable>
                </View>
                <Text style={styles.drillMaskedSentence}>{drillData.masked}</Text>
                <Text style={styles.drillViHint}>🇻🇳 {currentDrillSeg.vietnameseText}</Text>
                <View style={styles.drillOptionsGrid}>
                  {drillData.options.map((opt) => {
                    const picked = drillSelectedOption === opt;
                    const right = opt.toLowerCase() === drillData.target.toLowerCase();
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setDrillSelectedOption(opt)}
                        style={[
                          styles.drillOptionBtn,
                          picked && right && styles.drillOptionBtnCorrect,
                          picked && !right && styles.drillOptionBtnWrong,
                        ]}
                      >
                        <Text style={styles.drillOptionBtnText}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={() => setDrillRevealText((p) => !p)} style={styles.revealBtn}>
                  <Text style={styles.revealBtnText}>{drillRevealText ? "Ẩn đáp án" : "Hiện câu gốc"}</Text>
                </Pressable>
                {drillRevealText ? <Text style={styles.drillFullAnswerText}>{currentDrillSeg.englishText}</Text> : null}
                <View style={styles.drillNavRow}>
                  <Pressable
                    onPress={() => {
                      setDrillIdx(Math.max(0, drillIdx - 1));
                      setDrillSelectedOption(null);
                      setDrillRevealText(false);
                    }}
                    style={styles.secondaryNavBtn}
                  >
                    <Text style={styles.secondaryNavBtnText}>← Trước</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setDrillIdx((drillIdx + 1) % Math.max(1, segments.length));
                      setDrillSelectedOption(null);
                      setDrillRevealText(false);
                    }}
                    style={styles.secondaryNavBtn}
                  >
                    <Text style={styles.secondaryNavBtnText}>Tiếp →</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {studioTab === "shadowing" && activeSegment ? (
              <View style={styles.tabPanelCard}>
                <Text style={styles.tabPanelTitle}>🎙️ Shadowing câu #{activeSegment.sequenceNumber}</Text>
                <View style={styles.wordChipsWrap}>
                  {tokenizeSentence(activeSegment.englishText).map((tok, i) => (
                    <View key={i} style={[styles.wordChipItem, i === activeWordIdx && styles.wordChipItemSpokenNow]}>
                      <Text style={[styles.wordChipLabel, i === activeWordIdx && styles.wordChipLabelSpokenNow]}>{tok}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.vietnameseTranslationLineActive}>🇻🇳 {activeSegment.vietnameseText}</Text>
                <View style={styles.drillNavRow}>
                  <Pressable onPress={() => { setShadowingStep("listening"); void handleSpeakSegment(activeSegment); }} style={styles.primaryPillCta}>
                    <Text style={styles.primaryPillCtaText}>1. Nghe mẫu</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (shadowingStep === "repeating") setShadowingStep("done");
                      else {
                        setShadowingStep("repeating");
                        handleSeekTo(activeSegment.startTime, true);
                      }
                    }}
                    style={styles.secondaryNavBtn}
                  >
                    <Text style={styles.secondaryNavBtnText}>{shadowingStep === "repeating" ? "⏹ Xong" : "🎙️ 2. Đọc nhại"}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {studioTab === "vocabulary" ? (
              <View style={{ gap: 10 }}>
                {activeVideo.vocabulary.map((vocab, i) => {
                  const key = (vocab.normalizedWord || vocab.word).trim().toLowerCase();
                  const saved = Boolean(savedWordsMap[key]);
                  return (
                    <View key={`${vocab.word}-${i}`} style={styles.vocabCard}>
                      <View style={styles.vocabCardTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.vocabWordTitle}>{vocab.word} <Text style={styles.vocabIpaText}>{vocab.pronunciation}</Text></Text>
                          <Text style={styles.vocabPosText}>{vocab.partOfSpeech}</Text>
                        </View>
                        <Pressable onPress={() => void speakText(vocab.word)} style={styles.roundSpeakerBtn}>
                          <Ionicons color="#38BDF8" name="volume-high-outline" size={17} />
                        </Pressable>
                        <Pressable onPress={() => void handleSaveWordToFlashcards(vocab)} style={[styles.vocabSaveBtn, saved && styles.vocabSaveBtnSaved]}>
                          <Text style={[styles.vocabSaveBtnText, saved && { color: "#10B981" }]}>{saved ? "Đã lưu" : "♥ Lưu"}</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.vocabMeaningViText}>🇻🇳 {vocab.meaningVi}</Text>
                      <Text style={styles.vocabExampleEnText}>• {vocab.exampleSentence}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {studioTab === "exercises" ? (
              <View style={{ gap: 12 }}>
                {activeVideo.exercises.map((ex: YoutubeExerciseItem) => {
                  const pickedIdx = exerciseAnswers[ex.index];
                  const answered = pickedIdx !== undefined;
                  return (
                    <View key={ex.index} style={styles.vocabCard}>
                      <Text style={styles.tabPanelTitle}>{ex.question}</Text>
                      {(ex.options || []).map((opt, optIdx) => {
                        const selected = pickedIdx === optIdx;
                        const right = optIdx === ex.correctIndex;
                        return (
                          <Pressable
                            key={optIdx}
                            onPress={() => setExerciseAnswers((prev) => ({ ...prev, [ex.index]: optIdx }))}
                            style={[
                              styles.exerciseOptionRow,
                              answered && right && styles.drillOptionBtnCorrect,
                              answered && selected && !right && styles.drillOptionBtnWrong,
                            ]}
                          >
                            <Text style={styles.exerciseOptionText}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                      {answered ? <Text style={styles.exerciseExplainText}>💡 {ex.explanationVi}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {studioTab === "bookmarks" ? (
              <View style={{ gap: 10 }}>
                <View style={styles.tabPanelCard}>
                  <Text style={styles.tabPanelTitle}>🔖 Đánh dấu mốc thời gian ({formatClock(currentTimeSec)})</Text>
                  <TextInput
                    onChangeText={setBookmarkLabelInput}
                    placeholder="Nhãn ghi chú tại mốc hiện tại..."
                    placeholderTextColor="#64748B"
                    style={styles.bookmarkInput}
                    value={bookmarkLabelInput}
                  />
                  <Pressable onPress={() => void handleAddBookmark()} style={styles.primaryPillCta}>
                    <Ionicons color="#082F49" name="bookmark" size={16} />
                    <Text style={styles.primaryPillCtaText}>Lưu Bookmark tại {formatClock(currentTimeSec)}</Text>
                  </Pressable>
                </View>

                {activeVideo.bookmarks.map((bm) => (
                  <View key={bm.id} style={styles.vocabCard}>
                    <View style={styles.vocabCardTopRow}>
                      <Pressable onPress={() => handleSeekTo(bm.timestampSeconds, true)} style={{ flex: 1 }}>
                        <Text style={styles.vocabWordTitle}>▶ {bm.timestampLabel} — {bm.label}</Text>
                      </Pressable>
                      <Pressable onPress={() => void handleDeleteBookmark(bm)}>
                        <Ionicons color="#EF4444" name="trash-outline" size={18} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
          )}
        </View>
      ) : null}

      {/* Word Lookup Modal */}
      <Modal animationType="slide" onRequestClose={() => setWordModalVisible(false)} transparent visible={wordModalVisible}>
        <View style={styles.modalBackdrop}>
          <Pressable onPress={() => setWordModalVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalWordTitle}>{wordLookupData?.word || selectedWordToken || "Từ vựng"}</Text>
                {wordLookupData?.pronunciation ? <Text style={styles.modalPronunciation}>{wordLookupData.pronunciation}</Text> : null}
              </View>
              <Pressable onPress={() => { setSpeakingWordModal(true); void speakText(wordLookupData?.word || selectedWordToken || "").finally(() => setSpeakingWordModal(false)); }} style={styles.modalAudioBtn}>
                <Ionicons color="#38BDF8" name={speakingWordModal ? "volume-high" : "volume-medium-outline"} size={19} />
                <Text style={styles.modalAudioBtnText}>Nghe</Text>
              </Pressable>
            </View>
            {loadingWordLookup ? (
              <ActivityIndicator color="#38BDF8" style={{ marginVertical: 28 }} />
            ) : wordLookupData ? (
              <ScrollView contentContainerStyle={styles.modalBodyScroll}>
                <Text style={styles.posBadgeText}>{wordLookupData.partOfSpeech}</Text>
                <Text style={styles.detailPrimaryValue}>🇻🇳 {wordLookupData.meaningVi}</Text>
                <Text style={styles.exampleEnText}>{wordLookupData.exampleSentence}</Text>
                <Text style={styles.exampleViText}>{wordLookupData.exampleTranslation}</Text>
                <Pressable
                  disabled={savingFavorite}
                  onPress={() => void handleSaveWordToFlashcards(wordLookupData)}
                  style={styles.saveFavoriteModalBtn}
                >
                  <Text style={styles.saveFavoriteModalBtnText}>♥ Thêm vào Yêu thích (Flashcards)</Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Export Subtitles Modal (UTF-8 SRT / VTT / JSON) */}
      <Modal animationType="fade" onRequestClose={() => setExportModalVisible(false)} transparent visible={exportModalVisible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalWordTitle}>Xuất Phụ Đề Song Ngữ (UTF-8)</Text>
            <Text style={styles.detailSecondaryValue}>Hỗ trợ đầy đủ dấu tiếng Việt cho SRT, WebVTT và JSON.</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {[
                { key: "srt_en" as const, label: "English SRT (.srt)" },
                { key: "srt_vi" as const, label: "Vietnamese SRT (.srt)" },
                { key: "srt_bilingual" as const, label: "Bilingual EN-VI SRT (.srt)" },
                { key: "vtt" as const, label: "WebVTT (.vtt)" },
                { key: "json" as const, label: "Structured JSON (.json)" },
              ].map((fmt) => (
                <Pressable
                  key={fmt.key}
                  disabled={Boolean(exportingFormat)}
                  onPress={() => void handleExportSubtitles(fmt.key)}
                  style={styles.exportRowBtn}
                >
                  <Text style={styles.drillOptionBtnText}>{fmt.label}</Text>
                  {exportingFormat === fmt.key ? <ActivityIndicator color="#38BDF8" size="small" /> : <Ionicons color="#38BDF8" name="download-outline" size={18} />}
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setExportModalVisible(false)} style={[styles.secondaryNavBtn, { flex: 0, marginTop: 12 }]}>
              <Text style={styles.secondaryNavBtnText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    screenContent: { flexGrow: 1, paddingBottom: 24 },
    hubContainer: { gap: 14, paddingHorizontal: 14, paddingTop: 10 },
    hubHeaderRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 4 },
    hubBackBtn: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    hubHeaderTitle: { color: colors.text, flex: 1, fontSize: 20, fontWeight: "900" },
    hubHeaderActions: { alignItems: "center", flexDirection: "row", gap: 6 },
    hubActionIconBtn: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    hubActionIconHighlight: { borderColor: "rgba(239,68,68,0.45)" },
    importCard: {
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 24,
      borderWidth: 1.2,
      elevation: 3,
      gap: 12,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    },
    importCardHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
    youtubeBadgeBox: {
      alignItems: "center",
      backgroundColor: "rgba(239,68,68,0.14)",
      borderColor: "rgba(239,68,68,0.28)",
      borderRadius: 16,
      borderWidth: 1,
      height: 50,
      justifyContent: "center",
      width: 50,
    },
    youtubePlayCircle: {
      alignItems: "center",
      backgroundColor: "#EF4444",
      borderRadius: 999,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    importCardTitle: { color: colors.text, fontSize: 16, fontWeight: "900", lineHeight: 22 },
    importCardSubtitle: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
    urlRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    urlInputBox: {
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.borderStrong,
      borderRadius: 999,
      borderWidth: 1.2,
      flex: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    urlTextInput: { color: colors.text, flex: 1, fontSize: 13.5, paddingVertical: 0 },
    dropdownRow: { flexDirection: "row", gap: 10 },
    dropdownPill: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 999,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 13,
      paddingVertical: 9,
    },
    dropdownPillText: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    customTranscriptInput: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.borderStrong,
      borderRadius: 14,
      borderWidth: 1,
      color: colors.text,
      fontSize: 12.5,
      minHeight: 70,
      padding: 10,
      textAlignVertical: "top",
    },
    redImportBtn: {
      alignItems: "center",
      backgroundColor: "#E11D48",
      borderRadius: 999,
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    redImportBtnText: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "900" },
    jobProgressCard: {
      backgroundColor: colors.surface,
      borderColor: colors.primary,
      borderRadius: 20,
      borderWidth: 1.5,
      gap: 8,
      padding: 14,
    },
    jobHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    jobTitleText: { color: colors.primary, fontSize: 13.5, fontWeight: "900" },
    jobChunkText: { color: "#F59E0B", fontSize: 12.5, fontWeight: "900" },
    jobBarTrack: {
      backgroundColor: colors.isDark ? "#1E293B" : colors.surfaceMuted,
      borderRadius: 999,
      height: 8,
      overflow: "hidden",
    },
    jobBarFill: { backgroundColor: colors.primary, height: "100%" },
    jobMessageText: { color: colors.text, fontSize: 12.5 },
    jobStageGrid: { flexDirection: "row", justifyContent: "space-between" },
    jobMiniStat: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    jobErrorText: { color: colors.danger, fontSize: 12 },
    jobBtnRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    jobCancelBtn: { backgroundColor: "rgba(239,68,68,0.16)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    jobRetryBtn: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    jobBtnText: { color: colors.text, fontSize: 12, fontWeight: "800" },
    searchFilterRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    searchInputWrap: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 18,
      borderWidth: 1.2,
      flex: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    searchTextInput: { color: colors.text, flex: 1, fontSize: 13.5, paddingVertical: 0 },
    favoriteFilterBtn: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(244,63,94,0.14)" : "#FFE4E6",
      borderColor: colors.isDark ? "rgba(244,63,94,0.35)" : "#FECDD3",
      borderRadius: 999,
      borderWidth: 1.2,
      flexDirection: "row",
      gap: 6,
      height: 42,
      paddingHorizontal: 15,
    },
    favoriteFilterBtnActive: { backgroundColor: colors.isDark ? "rgba(244,63,94,0.28)" : "#FDA4AF", borderColor: "#F43F5E" },
    favoriteFilterText: { color: colors.isDark ? "#FDA4AF" : "#E11D48", fontSize: 13, fontWeight: "800" },
    videoOfTheDayCard: {
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 24,
      borderWidth: 1.2,
      elevation: 3,
      gap: 9,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    vodTopBadgesRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    vodFireBadge: {
      backgroundColor: colors.isDark ? "rgba(245,158,11,0.18)" : "#FEF3C7",
      borderColor: colors.isDark ? "rgba(245,158,11,0.4)" : "#FCD34D",
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    vodFireBadgeText: { color: colors.isDark ? "#FBBF24" : "#B45309", fontSize: 11.5, fontWeight: "900" },
    vodRightMetaRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    vodLevelBadge: {
      backgroundColor: colors.isDark ? "rgba(16,185,129,0.2)" : "#DCFCE7",
      borderColor: "#10B981",
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    vodLevelBadgeText: { color: colors.isDark ? "#34D399" : "#047857", fontSize: 11.5, fontWeight: "900" },
    vodDurationText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
    vodTitle: { color: colors.text, fontSize: 16.5, fontWeight: "900", lineHeight: 23 },
    vodSourceMeta: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
    playerStudioContainer: { backgroundColor: "#060B16", flex: 1, width: "100%" },
    studioTopBar: {
      alignItems: "center",
      backgroundColor: "#080E1E",
      borderBottomColor: "#1E293B",
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    studioTopIconBtn: { alignItems: "center", height: 34, justifyContent: "center", width: 34 },
    studioTopTitle: { color: "#F8FAFC", flex: 1, fontSize: 15, fontWeight: "800" },
    videoFrameContainer: { backgroundColor: "#000000", height: 210, overflow: "hidden", position: "relative", width: "100%" },
    videoFrameExpanded: { height: 270 },
    videoPosterImage: { height: "100%", width: "100%" },
    videoPosterPlayOverlay: {
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.28)",
      bottom: 0,
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    videoBigPlayCircle: { alignItems: "center", backgroundColor: "#06B6D4", borderRadius: 999, height: 54, justifyContent: "center", width: 54 },
    ccOverlayBadge: {
      backgroundColor: "rgba(15,23,42,0.82)",
      borderColor: "rgba(148,163,184,0.35)",
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 4,
      position: "absolute",
      right: 10,
      top: 10,
    },
    ccOverlayBadgeText: { color: "#CBD5E1", fontSize: 11, fontWeight: "700" },
    onVideoSubtitleBox: {
      alignSelf: "center",
      backgroundColor: "rgba(4,9,20,0.82)",
      borderRadius: 8,
      bottom: 10,
      maxWidth: "92%",
      paddingHorizontal: 10,
      paddingVertical: 5,
      position: "absolute",
    },
    onVideoSubtitleEn: { color: "#F8FAFC", fontSize: 12.5, fontWeight: "700", textAlign: "center" },
    transportSection: { backgroundColor: "#0B1222", borderBottomColor: "#1E293B", borderBottomWidth: 1, gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
    scrubberRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    scrubberTimeText: { color: "#CBD5E1", fontSize: 11.5, fontWeight: "700", minWidth: 42 },
    scrubberBarTrackWrap: { flex: 1, height: 24, justifyContent: "center", position: "relative" },
    scrubberTrackBg: { backgroundColor: "#334155", borderRadius: 999, height: 5, overflow: "hidden", width: "100%" },
    scrubberTrackFill: { backgroundColor: "#06B6D4", borderRadius: 999, height: "100%" },
    scrubberThumbDot: { backgroundColor: "#06B6D4", borderRadius: 999, height: 15, marginLeft: -7, position: "absolute", width: 15 },
    scrubberTapLayer: { bottom: 0, flexDirection: "row", left: 0, position: "absolute", right: 0, top: 0 },
    transportControlsRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    transportIconBtn: { alignItems: "center", flexDirection: "row", gap: 2, paddingHorizontal: 5, paddingVertical: 6 },
    transportSeekSubText: { color: "#CBD5E1", fontSize: 10, fontWeight: "900" },
    transportPlayCircleBtn: { alignItems: "center", backgroundColor: "#06B6D4", borderRadius: 999, height: 38, justifyContent: "center", width: 38 },
    loopSentenceBtn: {
      alignItems: "center",
      backgroundColor: "rgba(30,41,59,0.7)",
      borderColor: "#334155",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    loopSentenceBtnActive: { backgroundColor: "rgba(245,158,11,0.16)", borderColor: "rgba(245,158,11,0.55)" },
    loopSentenceText: { color: "#94A3B8", fontSize: 11.5, fontWeight: "800" },
    loopSentenceTextActive: { color: "#F59E0B" },
    speedPillBtn: { backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
    speedPillText: { color: "#F8FAFC", fontSize: 11.5, fontWeight: "900" },
    studioTabsBarWrap: { backgroundColor: "#080E1E", borderBottomColor: "#1E293B", borderBottomWidth: 1 },
    studioTabsBar: { alignItems: "center", flexDirection: "row", gap: 6, paddingHorizontal: 10 },
    studioTabItem: { alignItems: "center", borderBottomColor: "transparent", borderBottomWidth: 2.5, flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 11 },
    studioTabItemActive: { borderBottomColor: "#06B6D4" },
    studioTabLabel: { color: "#94A3B8", fontSize: 12.5, fontWeight: "700" },
    studioTabLabelActive: { color: "#06B6D4", fontWeight: "900" },
    studioBodyScroll: { gap: 12, padding: 12, paddingBottom: 36 },
    subtitlesTabPane: { flex: 1, position: "relative" },
    subtitleFlatListContent: { gap: 10, paddingBottom: 72, paddingHorizontal: 12, paddingTop: 10 },
    subtitleToolbarRow: {
      alignItems: "center",
      backgroundColor: "#080E1E",
      borderBottomColor: "#1E293B",
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    langPillsRow: { flexDirection: "row", gap: 6 },
    langFilterPill: { backgroundColor: "#131C31", borderColor: "#263554", borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
    langFilterPillActive: { backgroundColor: "#2563EB", borderColor: "#60A5FA" },
    langFilterPillText: { color: "#CBD5E1", fontSize: 12, fontWeight: "800" },
    langFilterPillTextActive: { color: "#FFFFFF" },
    autoFollowPillBtn: {
      alignItems: "center",
      backgroundColor: "#131C31",
      borderColor: "#334155",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    autoFollowPillBtnActive: { backgroundColor: "#06B6D4", borderColor: "#67E8F9" },
    autoFollowPillText: { color: "#CBD5E1", fontSize: 11, fontWeight: "800" },
    autoFollowPillTextActive: { color: "#082F49", fontWeight: "900" },
    fontSizePillBtn: { backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
    fontSizePillText: { color: "#38BDF8", fontSize: 11.5, fontWeight: "900" },
    subtitleSentenceCard: { backgroundColor: "#0F172A", borderColor: "#1E293B", borderRadius: 18, borderWidth: 1.5, gap: 8, padding: 13 },
    subtitleSentenceCardActive: { backgroundColor: "#0C2538", borderColor: "#06B6D4", borderWidth: 1.8 },
    subtitleCardTopRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    speakingNowPill: { alignItems: "center", backgroundColor: "#06B6D4", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    speakingNowPillText: { color: "#082F49", fontSize: 11, fontWeight: "900" },
    inactiveTimestampPill: { backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    inactiveTimestampText: { color: "#CBD5E1", fontSize: 11.5, fontWeight: "700" },
    uncertainBadge: { backgroundColor: "rgba(245,158,11,0.18)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    uncertainBadgeText: { color: "#FBBF24", fontSize: 11, fontWeight: "800" },
    roundSpeakerBtn: {
      alignItems: "center",
      backgroundColor: "rgba(6,182,212,0.14)",
      borderColor: "rgba(6,182,212,0.38)",
      borderRadius: 999,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    wordChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    wordChipItem: { backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
    wordChipItemSaved: { backgroundColor: "rgba(16,185,129,0.2)", borderColor: "#10B981" },
    wordChipItemSpokenNow: { backgroundColor: "#06B6D4", borderColor: "#67E8F9" },
    wordChipLabel: { color: "#F8FAFC", fontWeight: "800" },
    wordChipLabelSaved: { color: "#34D399" },
    wordChipLabelSpokenNow: { color: "#082F49", fontWeight: "900" },
    inlineSentenceParagraph: { color: "#E2E8F0", fontWeight: "700", lineHeight: 23 },
    inlineWordSaved: { color: "#34D399", fontWeight: "800" },
    backToActiveFloatingBtn: {
      alignItems: "center",
      backgroundColor: "#06B6D4",
      borderColor: "#67E8F9",
      borderRadius: 999,
      borderWidth: 1,
      bottom: 14,
      elevation: 6,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      position: "absolute",
      right: 14,
    },
    backToActiveFloatingText: { color: "#082F49", fontSize: 12.5, fontWeight: "900" },
    vietnameseTranslationLine: { color: "#38BDF8", fontWeight: "600", lineHeight: 20 },
    vietnameseTranslationLineActive: { color: "#22D3EE", fontWeight: "700", lineHeight: 21 },
    tabPanelCard: { backgroundColor: "#0F172A", borderColor: "#1E293B", borderRadius: 20, borderWidth: 1.5, gap: 12, padding: 16 },
    tabPanelHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    tabPanelTitle: { color: "#F8FAFC", flex: 1, fontSize: 15, fontWeight: "900", lineHeight: 21 },
    primaryPillCta: { alignItems: "center", backgroundColor: "#06B6D4", borderRadius: 999, flexDirection: "row", gap: 6, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 9 },
    primaryPillCtaText: { color: "#082F49", fontSize: 12.5, fontWeight: "900" },
    drillMaskedSentence: { color: "#F8FAFC", fontSize: 16, fontWeight: "800", lineHeight: 24 },
    drillViHint: { color: "#38BDF8", fontSize: 13, lineHeight: 19 },
    drillOptionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    drillOptionBtn: { backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10 },
    drillOptionBtnCorrect: { backgroundColor: "rgba(16,185,129,0.22)", borderColor: "#10B981" },
    drillOptionBtnWrong: { backgroundColor: "rgba(239,68,68,0.22)", borderColor: "#EF4444" },
    drillOptionBtnText: { color: "#F8FAFC", fontSize: 14, fontWeight: "700" },
    revealBtn: { alignSelf: "flex-start", paddingVertical: 4 },
    revealBtnText: { color: "#38BDF8", fontSize: 12.5, fontWeight: "700" },
    drillFullAnswerText: { backgroundColor: "#131C31", borderRadius: 12, color: "#E2E8F0", fontSize: 13.5, padding: 10 },
    drillNavRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
    secondaryNavBtn: { alignItems: "center", backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 999, borderWidth: 1, flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
    secondaryNavBtnText: { color: "#E2E8F0", fontSize: 12.5, fontWeight: "800" },
    vocabCard: { backgroundColor: "#0F172A", borderColor: "#1E293B", borderRadius: 18, borderWidth: 1.5, gap: 8, padding: 14 },
    vocabCardTopRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    vocabWordTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "900" },
    vocabIpaText: { color: "#38BDF8", fontSize: 13, fontWeight: "600" },
    vocabPosText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
    vocabSaveBtn: { backgroundColor: "rgba(244,63,94,0.15)", borderColor: "rgba(244,63,94,0.4)", borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6 },
    vocabSaveBtnSaved: { backgroundColor: "rgba(16,185,129,0.16)", borderColor: "#10B981" },
    vocabSaveBtnText: { color: "#FDA4AF", fontSize: 12, fontWeight: "800" },
    vocabMeaningViText: { color: "#22D3EE", fontSize: 14, fontWeight: "700" },
    vocabExampleEnText: { color: "#E2E8F0", fontSize: 13, lineHeight: 19 },
    exerciseOptionRow: { backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
    exerciseOptionText: { color: "#F8FAFC", fontSize: 13.5, fontWeight: "600" },
    exerciseExplainText: { color: "#BAE6FD", fontSize: 12.5, lineHeight: 18 },
    bookmarkInput: { backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 12, borderWidth: 1, color: "#F8FAFC", paddingHorizontal: 12, paddingVertical: 9 },
    modalBackdrop: { backgroundColor: "rgba(4,9,20,0.72)", flex: 1, justifyContent: "flex-end" },
    modalSheet: { backgroundColor: "#0F172A", borderColor: "#1E293B", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, maxHeight: "82%", paddingBottom: 28, paddingHorizontal: 18, paddingTop: 14 },
    modalHandle: { alignSelf: "center", backgroundColor: "#334155", borderRadius: 999, height: 5, marginBottom: 12, width: 46 },
    modalHeaderRow: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 12 },
    modalWordTitle: { color: "#F8FAFC", fontSize: 20, fontWeight: "900" },
    modalPronunciation: { color: "#38BDF8", fontSize: 14, fontWeight: "600", marginTop: 2 },
    modalAudioBtn: { alignItems: "center", backgroundColor: "rgba(56,189,248,0.16)", borderColor: "rgba(56,189,248,0.38)", borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
    modalAudioBtnText: { color: "#38BDF8", fontSize: 12.5, fontWeight: "800" },
    modalBodyScroll: { gap: 10, paddingBottom: 12 },
    posBadgeText: { color: "#38BDF8", fontSize: 12.5, fontWeight: "800" },
    detailPrimaryValue: { color: "#F8FAFC", fontSize: 16, fontWeight: "800", lineHeight: 22 },
    detailSecondaryValue: { color: "#94A3B8", fontSize: 13, marginTop: 4 },
    exampleEnText: { color: "#F8FAFC", fontSize: 14, fontWeight: "700", lineHeight: 20 },
    exampleViText: { color: "#38BDF8", fontSize: 13, lineHeight: 19 },
    saveFavoriteModalBtn: { alignItems: "center", backgroundColor: "#E11D48", borderRadius: radius.pill, marginTop: 6, paddingVertical: 13 },
    saveFavoriteModalBtnText: { color: "#FFFFFF", fontSize: 14.5, fontWeight: "900" },
    exportRowBtn: { alignItems: "center", backgroundColor: "#1E293B", borderColor: "#334155", borderRadius: 14, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
    streamStatusPill: {
      alignItems: "center",
      alignSelf: "center",
      backgroundColor: "rgba(15,23,42,0.86)",
      borderColor: "rgba(56,189,248,0.45)",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 6,
      position: "absolute",
      top: 10,
    },
    streamStatusPillText: { color: "#E0F2FE", fontSize: 11.5, fontWeight: "700" },
    streamErrorOverlay: {
      alignItems: "center",
      backgroundColor: "rgba(4,9,20,0.92)",
      bottom: 0,
      gap: 6,
      justifyContent: "center",
      left: 0,
      paddingHorizontal: 18,
      position: "absolute",
      right: 0,
      top: 0,
    },
    streamErrorTitle: { color: "#F8FAFC", fontSize: 13.5, fontWeight: "800", textAlign: "center" },
    streamErrorSub: { color: "#94A3B8", fontSize: 11.5, lineHeight: 16, textAlign: "center" },
    streamErrorBtnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    streamRetryBtn: {
      alignItems: "center",
      backgroundColor: "#06B6D4",
      borderRadius: 999,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    streamRetryBtnText: { color: "#082F49", fontSize: 12, fontWeight: "900" },
    streamAiVoiceBtn: {
      alignItems: "center",
      backgroundColor: "#1E293B",
      borderColor: "#38BDF8",
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 13,
      paddingVertical: 7,
    },
    streamAiVoiceBtnText: { color: "#E0F2FE", fontSize: 12, fontWeight: "800" },
  });
