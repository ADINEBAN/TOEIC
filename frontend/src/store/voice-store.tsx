import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/src/hooks/use-auth";
import { speakWithBestVoice, stopAllSpeech, VoiceEngine, VoiceRegion } from "@/src/services/tts-player";
import { getTtsVoices } from "@/src/services/user.service";
import { TtsVoiceItem } from "@/src/types/user-api";

const VOICE_STORAGE_KEY = "toeic_trainer_speechify_voice_v1";

type PersistedVoicePrefs = {
  engine: VoiceEngine;
  voiceRegion: VoiceRegion;
  selectedVoiceId: string | null;
  rate: number;
  pitch: number;
};

type VoiceContextValue = {
  engine: VoiceEngine;
  voiceRegion: VoiceRegion;
  selectedVoiceId: string | null;
  rate: number;
  pitch: number;
  voices: TtsVoiceItem[];
  speechifyConfigured: boolean;
  defaultUsVoiceId: string | null;
  defaultUkVoiceId: string | null;
  voicesLoading: boolean;
  voiceStatusMessage: string | null;
  lastPlaybackLabel: string | null;
  isSpeaking: boolean;
  setEngine: (engine: VoiceEngine) => void;
  setVoiceRegion: (region: VoiceRegion) => void;
  setSelectedVoiceId: (voiceId: string | null) => void;
  setRate: (updater: number | ((prev: number) => number)) => void;
  setPitch: (updater: number | ((prev: number) => number)) => void;
  refreshVoices: () => Promise<void>;
  speakText: (text: string, overrides?: { voiceId?: string | null; region?: VoiceRegion }) => Promise<void>;
  stopSpeaking: () => void;
};

const DEFAULT_PREFS: PersistedVoicePrefs = {
  engine: "speechify",
  voiceRegion: "US",
  selectedVoiceId: null,
  rate: 1.0,
  pitch: 1.0,
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const [prefs, setPrefs] = useState<PersistedVoicePrefs>(DEFAULT_PREFS);
  const [voices, setVoices] = useState<TtsVoiceItem[]>([]);
  const [speechifyConfigured, setSpeechifyConfigured] = useState(false);
  const [defaultUsVoiceId, setDefaultUsVoiceId] = useState<string | null>(null);
  const [defaultUkVoiceId, setDefaultUkVoiceId] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voiceStatusMessage, setVoiceStatusMessage] = useState<string | null>(null);
  const [lastPlaybackLabel, setLastPlaybackLabel] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(VOICE_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<PersistedVoicePrefs>;
        setPrefs({
          engine: parsed.engine === "device" ? "device" : "speechify",
          voiceRegion: parsed.voiceRegion === "UK" ? "UK" : "US",
          selectedVoiceId: typeof parsed.selectedVoiceId === "string" && parsed.selectedVoiceId.trim()
            ? parsed.selectedVoiceId.trim()
            : null,
          rate: typeof parsed.rate === "number" && Number.isFinite(parsed.rate)
            ? Math.min(1.5, Math.max(0.6, parsed.rate))
            : 1.0,
          pitch: typeof parsed.pitch === "number" && Number.isFinite(parsed.pitch)
            ? Math.min(1.4, Math.max(0.7, parsed.pitch))
            : 1.0,
        });
      })
      .catch(() => {
        // Ignore storage read failure
      });

    return () => {
      active = false;
    };
  }, []);

  const persistPrefs = useCallback((updater: (prev: PersistedVoicePrefs) => PersistedVoicePrefs) => {
    setPrefs((prev) => {
      const next = updater(prev);
      void AsyncStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // Ignore storage write failure
      });
      return next;
    });
  }, []);

  const refreshVoices = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setVoicesLoading(true);
      const response = await getTtsVoices(auth.accessToken);
      const data = response.data;
      if (data) {
        setSpeechifyConfigured(Boolean(data.configured));
        setVoices(data.voices ?? []);
        setDefaultUsVoiceId(data.defaultUsVoiceId ?? null);
        setDefaultUkVoiceId(data.defaultUkVoiceId ?? null);
        setVoiceStatusMessage(data.statusMessage ?? null);
      }
    } catch (error) {
      setVoiceStatusMessage(
        error instanceof Error ? error.message : "Không thể kiểm tra danh sách giọng Speechify.",
      );
    } finally {
      setVoicesLoading(false);
    }
  }, [auth.accessToken]);

  useEffect(() => {
    if (!auth.accessToken) {
      return;
    }
    const timer = setTimeout(() => {
      void refreshVoices();
    }, 0);
    return () => clearTimeout(timer);
  }, [auth.accessToken, refreshVoices]);

  const setEngine = useCallback(
    (engine: VoiceEngine) => {
      persistPrefs((prev) => ({ ...prev, engine }));
    },
    [persistPrefs],
  );

  const setVoiceRegion = useCallback(
    (voiceRegion: VoiceRegion) => {
      persistPrefs((prev) => ({ ...prev, voiceRegion, selectedVoiceId: null }));
    },
    [persistPrefs],
  );

  const setSelectedVoiceId = useCallback(
    (selectedVoiceId: string | null) => {
      persistPrefs((prev) => ({ ...prev, selectedVoiceId }));
    },
    [persistPrefs],
  );

  const setRate = useCallback(
    (updater: number | ((prev: number) => number)) => {
      persistPrefs((prev) => {
        const raw = typeof updater === "function" ? updater(prev.rate) : updater;
        const clamped = Math.min(1.5, Math.max(0.6, Number(raw.toFixed(1))));
        return { ...prev, rate: clamped };
      });
    },
    [persistPrefs],
  );

  const setPitch = useCallback(
    (updater: number | ((prev: number) => number)) => {
      persistPrefs((prev) => {
        const raw = typeof updater === "function" ? updater(prev.pitch) : updater;
        const clamped = Math.min(1.4, Math.max(0.7, Number(raw.toFixed(1))));
        return { ...prev, pitch: clamped };
      });
    },
    [persistPrefs],
  );

  const stopSpeaking = useCallback(() => {
    stopAllSpeech();
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(
    async (text: string, overrides?: { voiceId?: string | null; region?: VoiceRegion }) => {
      const region = overrides?.region ?? prefs.voiceRegion;
      const voiceId = overrides?.voiceId !== undefined ? overrides.voiceId : prefs.selectedVoiceId;
      await speakWithBestVoice({
        accessToken: auth.accessToken,
        engine: prefs.engine,
        onDone: () => setIsSpeaking(false),
        onStart: () => setIsSpeaking(true),
        onStatus: (info) => {
          const providerTag = info.usedProvider === "SPEECHIFY" ? "Speechify AI" : "Giọng thiết bị";
          setLastPlaybackLabel(
            info.voiceName ? `${providerTag} • ${info.voiceName}` : providerTag,
          );
          if (info.message && info.usedProvider === "DEVICE") {
            setVoiceStatusMessage(info.message);
          }
        },
        pitch: prefs.pitch,
        rate: prefs.rate,
        region,
        text,
        voiceId,
      });
    },
    [auth.accessToken, prefs.engine, prefs.pitch, prefs.rate, prefs.selectedVoiceId, prefs.voiceRegion],
  );

  const value = useMemo<VoiceContextValue>(
    () => ({
      engine: prefs.engine,
      voiceRegion: prefs.voiceRegion,
      selectedVoiceId: prefs.selectedVoiceId,
      rate: prefs.rate,
      pitch: prefs.pitch,
      voices: auth.accessToken ? voices : [],
      speechifyConfigured: auth.accessToken ? speechifyConfigured : false,
      defaultUsVoiceId,
      defaultUkVoiceId,
      voicesLoading,
      voiceStatusMessage: auth.accessToken ? voiceStatusMessage : null,
      lastPlaybackLabel,
      isSpeaking,
      setEngine,
      setVoiceRegion,
      setSelectedVoiceId,
      setRate,
      setPitch,
      refreshVoices,
      speakText,
      stopSpeaking,
    }),
    [
      auth.accessToken,
      defaultUkVoiceId,
      defaultUsVoiceId,
      isSpeaking,
      lastPlaybackLabel,
      prefs.engine,
      prefs.pitch,
      prefs.rate,
      prefs.selectedVoiceId,
      prefs.voiceRegion,
      refreshVoices,
      setEngine,
      setPitch,
      setRate,
      setSelectedVoiceId,
      setVoiceRegion,
      speakText,
      speechifyConfigured,
      stopSpeaking,
      voiceStatusMessage,
      voices,
      voicesLoading,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoiceSettings() {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoiceSettings must be used within VoiceProvider");
  }
  return ctx;
}
