import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer, AudioStatus } from "expo-audio";
import * as Speech from "expo-speech";
import { Platform } from "react-native";

import { buildAuthorizedApiUrl, synthesizeTtsSpeech } from "@/src/services/user.service";
import { TtsSynthesizeData } from "@/src/types/user-api";

export type VoiceEngine = "speechify" | "device";
export type VoiceRegion = "US" | "UK";

export type SpeakTextOptions = {
  text: string;
  accessToken?: string | null;
  engine?: VoiceEngine;
  region?: VoiceRegion;
  voiceId?: string | null;
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onDone?: () => void;
  onStatus?: (info: {
    usedProvider: "SPEECHIFY" | "DEVICE";
    voiceName?: string | null;
    message?: string | null;
  }) => void;
};

type ExpoSpeechApi = {
  speak: (text: string, options?: Record<string, unknown>) => void;
  stop: () => void;
};

const MAX_CLIENT_AUDIO_CACHE = 60;
const clientSynthesizeCache = new Map<string, TtsSynthesizeData>();

let activeRunId = 0;
let activeNativePlayer: AudioPlayer | null = null;
let activeStatusSub: { remove: () => void } | null = null;
let activeWebAudio: HTMLAudioElement | null = null;
let audioModeConfigured = false;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rememberClientCache(key: string, value: TtsSynthesizeData) {
  if (clientSynthesizeCache.size >= MAX_CLIENT_AUDIO_CACHE) {
    const oldestKey = clientSynthesizeCache.keys().next().value;
    if (oldestKey) {
      clientSynthesizeCache.delete(oldestKey);
    }
  }
  clientSynthesizeCache.set(key, value);
}

function disposeActiveNativePlayer() {
  try {
    activeStatusSub?.remove();
  } catch {
    // Ignore listener detach errors
  }
  activeStatusSub = null;

  if (activeNativePlayer) {
    try {
      activeNativePlayer.pause();
      activeNativePlayer.remove();
    } catch {
      // Ignore player cleanup errors
    }
    activeNativePlayer = null;
  }
}

function disposeActiveWebAudio() {
  if (activeWebAudio) {
    try {
      activeWebAudio.pause();
      activeWebAudio.src = "";
    } catch {
      // Ignore web audio cleanup errors
    }
    activeWebAudio = null;
  }
}

export function stopAllSpeech() {
  activeRunId += 1;
  disposeActiveNativePlayer();
  disposeActiveWebAudio();

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore browser speech cancel failure
    }
  }

  const speech = Speech as unknown as Partial<ExpoSpeechApi>;
  if (typeof speech?.stop === "function") {
    try {
      speech.stop();
    } catch {
      // Ignore native speech stop failure
    }
  }
}

function speakWithDevice(options: {
  text: string;
  region: VoiceRegion;
  rate: number;
  pitch: number;
  runId: number;
  onStart?: () => void;
  onDone?: () => void;
  onStatus?: SpeakTextOptions["onStatus"];
  statusNote?: string | null;
}) {
  if (options.runId !== activeRunId) return;

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(options.text);
      const voices = synth.getVoices();
      const preferredLocale = options.region === "US" ? "en-us" : "en-gb";
      const matched =
        voices.find((v) => v.lang.toLowerCase() === preferredLocale) ??
        voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
        null;

      if (matched) {
        utterance.voice = matched;
        utterance.lang = matched.lang;
      } else {
        utterance.lang = preferredLocale;
      }
      utterance.rate = clampNumber(options.rate, 0.5, 2.0);
      utterance.pitch = clampNumber(options.pitch, 0.6, 1.5);
      utterance.onend = () => {
        if (options.runId === activeRunId) {
          options.onDone?.();
        }
      };
      utterance.onerror = () => {
        if (options.runId === activeRunId) {
          options.onDone?.();
        }
      };

      synth.cancel();
      options.onStart?.();
      options.onStatus?.({
        usedProvider: "DEVICE",
        voiceName: matched?.name || `Browser ${options.region}`,
        message: options.statusNote ?? null,
      });
      synth.speak(utterance);
      return;
    } catch {
      // Fall through to finish cleanly
    }
  }

  const speech = Speech as unknown as Partial<ExpoSpeechApi>;
  if (typeof speech?.speak === "function" && typeof speech?.stop === "function") {
    options.onStart?.();
    options.onStatus?.({
      usedProvider: "DEVICE",
      voiceName: `Thiết bị (${options.region})`,
      message: options.statusNote ?? null,
    });
    speech.stop();
    speech.speak(options.text, {
      language: options.region === "US" ? "en-US" : "en-GB",
      pitch: clampNumber(options.pitch, 0.6, 1.5),
      rate: clampNumber(options.rate, 0.5, 1.8),
      onDone: () => {
        if (options.runId === activeRunId) {
          options.onDone?.();
        }
      },
      onStopped: () => {
        if (options.runId === activeRunId) {
          options.onDone?.();
        }
      },
      onError: () => {
        if (options.runId === activeRunId) {
          options.onDone?.();
        }
      },
    });
    return;
  }

  options.onDone?.();
}

async function playSpeechifyResult(
  data: TtsSynthesizeData,
  options: {
    accessToken: string;
    rate: number;
    runId: number;
    onDone?: () => void;
    onStatus?: SpeakTextOptions["onStatus"];
  },
): Promise<boolean> {
  if (options.runId !== activeRunId) {
    return true;
  }

  if (Platform.OS === "web" && data.audioBase64 && typeof Audio !== "undefined") {
    try {
      const mimeType = data.mimeType || "audio/mpeg";
      const audio = new Audio(`data:${mimeType};base64,${data.audioBase64}`);
      audio.playbackRate = clampNumber(options.rate, 0.5, 2.0);
      activeWebAudio = audio;
      audio.onended = () => {
        if (activeWebAudio === audio) {
          activeWebAudio = null;
        }
        if (options.runId === activeRunId) {
          options.onDone?.();
        }
      };
      audio.onerror = () => {
        if (activeWebAudio === audio) {
          activeWebAudio = null;
        }
        if (options.runId === activeRunId) {
          options.onDone?.();
        }
      };
      await audio.play();
      options.onStatus?.({
        usedProvider: "SPEECHIFY",
        voiceName: data.voiceName ?? data.voiceId ?? "Speechify AI",
        message: data.message ?? null,
      });
      return true;
    } catch {
      disposeActiveWebAudio();
      return false;
    }
  }

  if (Platform.OS !== "web" && data.streamPath) {
    try {
      if (!audioModeConfigured) {
        await setAudioModeAsync({
          playsInSilentMode: true,
        });
        audioModeConfigured = true;
      }

      if (options.runId !== activeRunId) {
        return true;
      }

      const streamUrl = buildAuthorizedApiUrl(data.streamPath);
      const player = createAudioPlayer(
        {
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
          },
          uri: streamUrl,
        },
        { updateInterval: 150 },
      );

      activeNativePlayer = player;
      player.shouldCorrectPitch = true;
      try {
        player.setPlaybackRate(clampNumber(options.rate, 0.5, 1.8));
      } catch {
        // Ignore rate setting error if platform rejects before load
      }

      activeStatusSub = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
        if (options.runId !== activeRunId) {
          return;
        }
        if (status.didJustFinish || status.playbackState === "ended") {
          setTimeout(() => {
            if (options.runId === activeRunId) {
              disposeActiveNativePlayer();
              options.onDone?.();
            }
          }, 0);
        }
      });

      player.play();
      options.onStatus?.({
        usedProvider: "SPEECHIFY",
        voiceName: data.voiceName ?? data.voiceId ?? "Speechify AI",
        message: data.message ?? null,
      });
      return true;
    } catch {
      disposeActiveNativePlayer();
      return false;
    }
  }

  return false;
}

export async function speakWithBestVoice(options: SpeakTextOptions): Promise<void> {
  const cleanText = options.text.trim();
  if (!cleanText) {
    return;
  }

  stopAllSpeech();
  const runId = activeRunId;
  const region: VoiceRegion = options.region === "UK" ? "UK" : "US";
  const engine: VoiceEngine = options.engine ?? "speechify";
  const rate = clampNumber(options.rate ?? 1, 0.6, 1.5);
  const pitch = clampNumber(options.pitch ?? 1, 0.7, 1.4);

  if (engine === "speechify" && options.accessToken) {
    options.onStart?.();
    const cacheKey = `${options.voiceId || region}|${cleanText}`;

    try {
      let synthData = clientSynthesizeCache.get(cacheKey);
      if (!synthData) {
        const response = await synthesizeTtsSpeech(options.accessToken, {
          audioFormat: "mp3",
          region,
          text: cleanText,
          voiceId: options.voiceId ?? undefined,
        });
        synthData = response.data ?? undefined;
        if (synthData?.available && synthData.streamPath) {
          rememberClientCache(cacheKey, synthData);
        }
      }

      if (runId !== activeRunId) {
        return;
      }

      if (synthData?.available) {
        const played = await playSpeechifyResult(synthData, {
          accessToken: options.accessToken,
          onDone: options.onDone,
          onStatus: options.onStatus,
          rate,
          runId,
        });
        if (played) {
          return;
        }
      }

      speakWithDevice({
        onDone: options.onDone,
        onStart: options.onStart,
        onStatus: options.onStatus,
        pitch,
        rate,
        region,
        runId,
        statusNote: synthData?.message ?? "Chuyển sang giọng thiết bị.",
        text: cleanText,
      });
      return;
    } catch (error) {
      if (runId !== activeRunId) {
        return;
      }
      speakWithDevice({
        onDone: options.onDone,
        onStart: options.onStart,
        onStatus: options.onStatus,
        pitch,
        rate,
        region,
        runId,
        statusNote:
          error instanceof Error
            ? `Speechify tạm gián đoạn (${error.message}), dùng giọng thiết bị.`
            : "Dùng giọng thiết bị.",
        text: cleanText,
      });
      return;
    }
  }

  speakWithDevice({
    onDone: options.onDone,
    onStart: options.onStart,
    onStatus: options.onStatus,
    pitch,
    rate,
    region,
    runId,
    text: cleanText,
  });
}
