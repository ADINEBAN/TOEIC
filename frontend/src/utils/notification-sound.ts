import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";

type AudioCtxCtor = new () => AudioContext;

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const COOLDOWN_MS = 1200;
const ARENA_TAUNT_COOLDOWN_MS = 450;

type ToneSpec = {
  startOffsetSec: number;
  durationSec: number;
  frequencyHz: number;
  peakGain: number;
};

const MESSENGER_TONES: ToneSpec[] = [
  { startOffsetSec: 0, durationSec: 0.095, frequencyHz: 987.77, peakGain: 0.14 },
  { startOffsetSec: 0.065, durationSec: 0.175, frequencyHz: 1318.51, peakGain: 0.17 },
];

const ARENA_TAUNT_TONES: ToneSpec[] = [
  { startOffsetSec: 0, durationSec: 0.065, frequencyHz: 783.99, peakGain: 0.12 },
  { startOffsetSec: 0.045, durationSec: 0.115, frequencyHz: 1174.66, peakGain: 0.15 },
];

let sharedWebAudioCtx: AudioContext | null = null;
let unlockRegistered = false;
let lastChimeAt = 0;
let lastTauntAt = 0;
const nativeWavCache = new Map<string, string>();
let nativeAudioModeReady = false;

function encodeBytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triplet >> 18) & 63];
    out += BASE64_ALPHABET[(triplet >> 12) & 63];
    out += hasB1 ? BASE64_ALPHABET[(triplet >> 6) & 63] : "=";
    out += hasB2 ? BASE64_ALPHABET[triplet & 63] : "=";
  }
  return out;
}

function buildChimeWavDataUri(cacheKey: string, tones: ToneSpec[]): string {
  const cached = nativeWavCache.get(cacheKey);
  if (cached) return cached;
  const sampleRate = 22050;
  const durationSec = Math.max(...tones.map((t) => t.startOffsetSec + t.durationSec), 0.2);
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    for (const tone of tones) {
      if (t >= tone.startOffsetSec && t <= tone.startOffsetSec + tone.durationSec) {
        const dt = t - tone.startOffsetSec;
        const env = Math.min(1, dt / 0.008) * Math.exp(-dt * (2.6 / tone.durationSec));
        sample += Math.sin(2 * Math.PI * tone.frequencyHz * dt) * (tone.peakGain * 3.1) * env;
        sample += Math.sin(2 * Math.PI * tone.frequencyHz * 2 * dt) * (tone.peakGain * 0.75) * env;
      }
    }
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  const uri = `data:audio/wav;base64,${encodeBytesToBase64(new Uint8Array(buffer))}`;
  nativeWavCache.set(cacheKey, uri);
  return uri;
}

function getWebAudioContext(): AudioContext | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  if (sharedWebAudioCtx) return sharedWebAudioCtx;
  const win = window as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  const Ctor = win.AudioContext || win.webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedWebAudioCtx = new Ctor();
    return sharedWebAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Unlocks Web Audio on the first user gesture so background notification chimes work reliably.
 */
export function registerMessengerAudioUnlock(): void {
  if (Platform.OS !== "web" || typeof window === "undefined" || unlockRegistered) return;
  unlockRegistered = true;

  const unlock = () => {
    const ctx = getWebAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    if (ctx.state === "running") {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    }
  };

  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true, passive: true });
}

function scheduleTone(
  ctx: AudioContext,
  startOffsetSec: number,
  durationSec: number,
  frequencyHz: number,
  peakGain: number,
) {
  const start = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const harmonic = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequencyHz, start);

  harmonic.type = "triangle";
  harmonic.frequency.setValueAtTime(frequencyHz * 2, start);

  const harmonicGain = ctx.createGain();
  harmonicGain.gain.setValueAtTime(0.18, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

  osc.connect(gain);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  harmonic.start(start);
  osc.stop(start + durationSec + 0.02);
  harmonic.stop(start + durationSec + 0.02);
}

async function playWebTones(tones: ToneSpec[]): Promise<void> {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state !== "running") return;
  for (const tone of tones) {
    scheduleTone(ctx, tone.startOffsetSec, tone.durationSec, tone.frequencyHz, tone.peakGain);
  }
}

async function playNativeTones(cacheKey: string, tones: ToneSpec[]): Promise<void> {
  try {
    if (!nativeAudioModeReady) {
      await setAudioModeAsync({
        playsInSilentMode: false,
        shouldPlayInBackground: false,
      });
      nativeAudioModeReady = true;
    }
    const uri = buildChimeWavDataUri(cacheKey, tones);
    const player = createAudioPlayer(uri);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        sub.remove();
      } catch {
        // ignore
      }
      try {
        player.remove();
      } catch {
        // ignore
      }
    };
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        cleanup();
      }
    });
    player.play();
    setTimeout(cleanup, 1200);
  } catch {
    // Never crash UI when audio device is unavailable
  }
}

/**
 * Plays a crisp Messenger-like two-note notification chime with cooldown throttling.
 */
export function playMessengerNotificationSound(): void {
  const now = Date.now();
  if (now - lastChimeAt < COOLDOWN_MS) return;
  lastChimeAt = now;

  if (Platform.OS === "web") {
    void playWebTones(MESSENGER_TONES);
  } else {
    void playNativeTones("messenger", MESSENGER_TONES);
  }
}

/**
 * Plays a short playful pop sound for 1v1 Arena taunts & reactions.
 */
export function playArenaTauntSound(): void {
  const now = Date.now();
  if (now - lastTauntAt < ARENA_TAUNT_COOLDOWN_MS) return;
  lastTauntAt = now;

  if (Platform.OS === "web") {
    void playWebTones(ARENA_TAUNT_TONES);
  } else {
    void playNativeTones("arena_taunt", ARENA_TAUNT_TONES);
  }
}
