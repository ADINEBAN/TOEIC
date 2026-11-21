import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidSegmentedBar } from "@/src/components/ui/LiquidGlass";
import AppHeader from "@/src/components/user/AppHeader";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  clearDictionaryHistory,
  createMyFlashcard,
  deleteDictionaryHistoryWord,
  getDictionaryHistory,
  lookupSemanticDictionary,
  recognizeObjectImage,
  suggestDictionaryWords,
} from "@/src/services/user.service";
import {
  clearCachedHistory,
  getCachedDictionaryEntrySync,
  getCachedDictionaryHistorySync,
  hydrateDictionaryCache,
  mergeServerDictionaryHistory,
  removeCachedHistoryWord,
  saveDictionaryLookupToCache,
} from "@/src/store/dictionary-cache";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { useVoiceSettings } from "@/src/store/voice-store";
import {
  DetectedObjectItem,
  DictionaryHistoryItem,
  DictionarySemanticNode,
  ImageObjectRecognitionData,
  SemanticDictionaryData,
} from "@/src/types/user-api";
import { safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

type DictMode = "lookup" | "camera";

type PreviewSeed = {
  vocabularyId?: number | null;
  word?: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  cefrLevel?: string | null;
  meaningVi?: string | null;
  meaningEn?: string | null;
  exampleSentence?: string | null;
  exampleTranslation?: string | null;
};

function buildPreviewFromSeed(rawWord: string, seed: PreviewSeed): SemanticDictionaryData | null {
  const head = (seed.word || rawWord).trim();
  const norm = head.toLowerCase();
  if (!head || (!seed.meaningVi && !seed.ipa)) return null;
  return {
    vocabularyId: seed.vocabularyId ?? null,
    word: head,
    normalizedWord: norm,
    ipa: seed.ipa ?? null,
    partOfSpeech: seed.partOfSpeech ?? null,
    cefrLevel: seed.cefrLevel ?? null,
    meaningVi: seed.meaningVi || head,
    meaningEn: seed.meaningEn ?? null,
    source: "INSTANT_PREVIEW",
    cached: true,
    partial: true,
    examples: seed.exampleSentence
      ? [{ english: seed.exampleSentence, vietnamese: seed.exampleTranslation ?? null }]
      : [],
    semanticNetwork: {
      synonyms: [],
      antonyms: [],
      wordFamily: [],
      relatedWords: [],
      collocations: [],
    },
  };
}

const STARTER_WORDS = [
  "negotiate",
  "deadline",
  "reimburse",
  "mandatory",
  "agenda",
  "contract",
  "expand",
  "inventory",
];

function relationTone(type: string | null | undefined, colors: LiquidThemeColors) {
  switch (type) {
    case "SYNONYM":
      return {
        bg: colors.isDark ? "rgba(16,185,129,0.16)" : "#ECFDF5",
        border: colors.isDark ? "rgba(52,211,153,0.40)" : "#A7F3D0",
        fg: colors.isDark ? "#6EE7B7" : "#047857",
      };
    case "ANTONYM":
      return {
        bg: colors.isDark ? "rgba(239,68,68,0.16)" : "#FEF2F2",
        border: colors.isDark ? "rgba(248,113,113,0.40)" : "#FECACA",
        fg: colors.isDark ? "#FCA5A5" : "#B91C1C",
      };
    case "WORD_FAMILY":
      return {
        bg: colors.isDark ? "rgba(139,92,246,0.18)" : "#F5F3FF",
        border: colors.isDark ? "rgba(167,139,250,0.40)" : "#DDD6FE",
        fg: colors.isDark ? "#C4B5FD" : "#6D28D9",
      };
    default:
      return {
        bg: colors.primarySoft,
        border: colors.isDark ? "rgba(96,165,250,0.40)" : "#BFDBFE",
        fg: colors.primaryDark,
      };
  }
}

export default function DictionaryScreen() {
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const { isNarrow, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ mode?: string; word?: string }>();

  const { speakText, stopSpeaking, isSpeaking, voiceRegion } = useVoiceSettings();

  const userScope = String(auth?.user?.id ?? "guest");

  const [mode, setMode] = useState<DictMode>(params.mode === "camera" ? "camera" : "lookup");
  const [query, setQuery] = useState(params.word?.trim() || "");
  const [suggestions, setSuggestions] = useState<DictionarySemanticNode[]>([]);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [enrichingBg, setEnrichingBg] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<SemanticDictionaryData | null>(null);
  const [history, setHistory] = useState<DictionaryHistoryItem[]>(() =>
    getCachedDictionaryHistorySync(userScope),
  );
  const [savedWords, setSavedWords] = useState<Record<string, boolean>>({});
  const [savingWord, setSavingWord] = useState<string | null>(null);
  const lookupRequestIdRef = useRef(0);
  const syncedSessionRef = useRef<Set<string>>(new Set());

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<ImageObjectRecognitionData | null>(null);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  useEffect(() => {
    let active = true;
    void hydrateDictionaryCache(userScope).then(({ history: localHist }) => {
      if (active && localHist.length > 0) {
        setHistory(localHist);
      }
    });

    const token = auth?.accessToken;
    if (token) {
      void getDictionaryHistory(token, 30)
        .then((res) => {
          if (!active || !res.data) return;
          const merged = mergeServerDictionaryHistory(userScope, res.data);
          setHistory(merged);
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [auth?.accessToken, userScope]);

  const executeLookup = useCallback(
    async (rawWord: string, seed?: PreviewSeed) => {
      const token = auth?.accessToken;
      const clean = rawWord.trim();
      if (!token || !clean) return;

      const reqId = ++lookupRequestIdRef.current;
      setMode("lookup");
      setQuery(clean);
      setSuggestions([]);
      setLookupError(null);

      // 1. Check local persistent cache first -> 0ms instant response
      const localCached = getCachedDictionaryEntrySync(userScope, clean);
      if (localCached && !localCached.partial) {
        setResult(localCached);
        setLoadingLookup(false);
        setEnrichingBg(false);
        setHistory(saveDictionaryLookupToCache(userScope, clean, localCached));

        const normKey = (localCached.normalizedWord || clean).toLowerCase();
        if (!syncedSessionRef.current.has(normKey)) {
          syncedSessionRef.current.add(normKey);
          void lookupSemanticDictionary(token, clean, { fast: true }).catch(() => {});
        }
        return;
      }

      // 2. If partial cache or suggestion/camera metadata exists, render preview card immediately (0ms)
      const immediatePreview = localCached ?? (seed ? buildPreviewFromSeed(clean, seed) : null);
      if (immediatePreview) {
        setResult(immediatePreview);
        setLoadingLookup(false);
        setEnrichingBg(true);
      } else {
        setLoadingLookup(true);
        setEnrichingBg(false);
      }

      try {
        // 3. Fast server phase (~3-15ms for L2 DB cache or local catalog words)
        const fastRes = await lookupSemanticDictionary(token, clean, { fast: true });
        if (lookupRequestIdRef.current !== reqId) return;

        const fastData = fastRes.data;
        if (fastData) {
          setResult(fastData);
          setLoadingLookup(false);
          setHistory(saveDictionaryLookupToCache(userScope, clean, fastData));
          syncedSessionRef.current.add((fastData.normalizedWord || clean).toLowerCase());

          if (!fastData.partial) {
            setEnrichingBg(false);
            return;
          }

          // 4. Non-blocking background enrichment for synonyms, antonyms, and collocations
          setEnrichingBg(true);
          try {
            const fullRes = await lookupSemanticDictionary(token, clean, { fast: false });
            if (lookupRequestIdRef.current !== reqId) return;
            if (fullRes.data) {
              setResult(fullRes.data);
              setHistory(saveDictionaryLookupToCache(userScope, clean, fullRes.data));
            }
          } finally {
            if (lookupRequestIdRef.current === reqId) {
              setEnrichingBg(false);
            }
          }
          return;
        }
      } catch (err) {
        if (lookupRequestIdRef.current !== reqId) return;
        setEnrichingBg(false);
        if (!immediatePreview) {
          setLookupError(err instanceof Error ? err.message : "Không thể tra cứu từ này.");
        }
      } finally {
        if (lookupRequestIdRef.current === reqId) {
          setLoadingLookup(false);
        }
      }
    },
    [auth?.accessToken, userScope],
  );

  const handleRemoveHistoryWord = (rawWord: string) => {
    setHistory(removeCachedHistoryWord(userScope, rawWord));
    if (auth?.accessToken) {
      void deleteDictionaryHistoryWord(auth.accessToken, rawWord).catch(() => {});
    }
  };

  const handleClearHistory = () => {
    setHistory(clearCachedHistory(userScope));
    if (auth?.accessToken) {
      void clearDictionaryHistory(auth.accessToken).catch(() => {});
    }
  };

  useEffect(() => {
    const initialWord = params.word?.trim();
    if (!initialWord) return;
    const timer = setTimeout(() => {
      void executeLookup(initialWord);
    }, 0);
    return () => clearTimeout(timer);
  }, [executeLookup, params.word]);

  const handleChangeQuery = (nextText: string) => {
    setQuery(nextText);
    if (nextText.trim().length < 2) {
      setSuggestions([]);
    }
  };

  useEffect(() => {
    const token = auth?.accessToken;
    const trimmed = query.trim();
    if (!token || mode !== "lookup" || trimmed.length < 2) {
      return;
    }
    if (result && result.word.toLowerCase() === trimmed.toLowerCase()) {
      return;
    }
    const timer = setTimeout(() => {
      void suggestDictionaryWords(token, trimmed, 10)
        .then((res) => setSuggestions(res.data ?? []))
        .catch(() => setSuggestions([]));
    }, 140);
    return () => clearTimeout(timer);
  }, [auth?.accessToken, mode, query, result]);

  const handleSaveToFlashcards = async (item: {
    word: string;
    meaningVi?: string | null;
    ipa?: string | null;
    exampleSentence?: string | null;
  }) => {
    if (!auth?.accessToken || !item.word) return;
    const key = item.word.toLowerCase();
    try {
      setSavingWord(key);
      await createMyFlashcard(auth.accessToken, {
        englishWord: item.word,
        meaningVi: (item.meaningVi || item.word).trim(),
        pronunciation: item.ipa ?? undefined,
        exampleSentence: item.exampleSentence ?? undefined,
      });
      setSavedWords((prev) => ({ ...prev, [key]: true }));
      Alert.alert("Đã lưu Flashcard", `Từ "${item.word}" đã được thêm vào bộ "Từ của tôi".`);
    } catch (err) {
      Alert.alert("Flashcard", err instanceof Error ? err.message : "Không lưu được vào Flashcards.");
    } finally {
      setSavingWord(null);
    }
  };

  const analyzePhotoAsset = async (picked: {
    uri?: string;
    name: string;
    mimeType?: string;
    webFile?: File | Blob;
  }) => {
    if (!auth?.accessToken) {
      Alert.alert("Đăng nhập", "Vui lòng đăng nhập để dùng nhận diện hình ảnh.");
      return;
    }
    if (picked.uri) {
      setPreviewUri(picked.uri);
    } else if (picked.webFile && typeof URL !== "undefined") {
      setPreviewUri(URL.createObjectURL(picked.webFile));
    }

    try {
      setRecognizing(true);
      setVisionError(null);
      const res = await recognizeObjectImage(auth.accessToken, picked);
      if (res.data) {
        setVisionResult(res.data);
        const primaryWord = res.data.primaryObject?.word;
        if (primaryWord && !getCachedDictionaryEntrySync(userScope, primaryWord)) {
          // Prefetch semantic network in background so "Xem Mạng ngữ nghĩa" opens in 0ms
          void lookupSemanticDictionary(auth.accessToken, primaryWord, { fast: false })
            .then((prefetched) => {
              if (prefetched.data) {
                setHistory(saveDictionaryLookupToCache(userScope, primaryWord, prefetched.data));
              }
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      setVisionError(err instanceof Error ? err.message : "Không thể nhận diện đồ vật từ ảnh này.");
    } finally {
      setRecognizing(false);
    }
  };

  const handleWebFileCapture = (useCamera: boolean) => {
    if (typeof document === "undefined") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (useCamera) {
      input.setAttribute("capture", "environment");
    }
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        void analyzePhotoAsset({
          name: file.name || "object.jpg",
          mimeType: file.type || "image/jpeg",
          webFile: file,
        });
      }
    };
    input.click();
  };

  const handleCaptureCamera = async () => {
    if (Platform.OS === "web") {
      handleWebFileCapture(true);
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Quyền Camera", "Vui lòng cấp quyền Camera để chụp ảnh nhận diện đồ vật.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.78,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        await analyzePhotoAsset({
          uri: asset.uri,
          name: asset.fileName || "camera_object.jpg",
          mimeType: asset.mimeType || "image/jpeg",
        });
      }
    } catch {
      // Fallback to DocumentPicker if native camera module unavailable on device
      await handlePickGallery();
    }
  };

  const handlePickGallery = async () => {
    if (Platform.OS === "web") {
      handleWebFileCapture(false);
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.78,
      });
      if (!res.canceled && res.assets?.[0]) {
        const asset = res.assets[0];
        await analyzePhotoAsset({
          uri: asset.uri,
          name: asset.fileName || "gallery_object.jpg",
          mimeType: asset.mimeType || "image/jpeg",
        });
      }
    } catch {
      const doc = await DocumentPicker.getDocumentAsync({
        type: ["image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!doc.canceled && doc.assets?.[0]) {
        const asset = doc.assets[0];
        await analyzePhotoAsset({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "image/jpeg",
        });
      }
    }
  };

  const renderSemanticBranch = (
    title: string,
    icon: keyof typeof Ionicons.glyphMap,
    nodes: DictionarySemanticNode[],
    toneType: string,
  ) => {
    if (!nodes || nodes.length === 0) return null;
    const tone = relationTone(toneType, colors);
    return (
      <View style={styles.branchGroup}>
        <View style={styles.branchHeader}>
          <Ionicons color={tone.fg} name={icon} size={15} />
          <Text style={[styles.branchTitle, { color: tone.fg }]}>
            {title} ({nodes.length})
          </Text>
        </View>
        <View style={styles.branchChipWrap}>
          {nodes.map((node) => (
            <Pressable
              key={`${toneType}-${node.word}`}
              onPress={() => void executeLookup(node.word, node)}
              style={[
                styles.semanticNodeChip,
                { backgroundColor: tone.bg, borderColor: tone.border },
              ]}
            >
              <View style={styles.nodeChipTopRow}>
                <Text style={[styles.nodeChipWord, { color: tone.fg }]}>{node.word}</Text>
                {node.cefrLevel ? (
                  <Text style={styles.nodeCefrTag}>{node.cefrLevel}</Text>
                ) : null}
              </View>
              {node.meaningVi ? (
                <Text numberOfLines={1} style={styles.nodeChipMeaning}>
                  {node.meaningVi}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const renderObjectCard = (obj: DetectedObjectItem, isPrimary = false) => {
    const key = obj.word.toLowerCase();
    const isSaved = Boolean(savedWords[key]);
    const confPct = obj.confidence ? `${Math.round(obj.confidence * 100)}%` : null;
    return (
      <SurfaceCard key={`${obj.word}-${isPrimary ? "p" : "s"}`} style={styles.resultCard}>
        <View style={styles.headRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.badgeLine}>
              {isPrimary ? (
                <View style={styles.primaryTag}>
                  <Text style={styles.primaryTagText}>ĐỒ VẬT CHÍNH</Text>
                </View>
              ) : null}
              {obj.partOfSpeech ? (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{obj.partOfSpeech}</Text>
                </View>
              ) : null}
              {obj.cefrLevel ? (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{obj.cefrLevel}</Text>
                </View>
              ) : null}
              {confPct ? (
                <View style={styles.confBadge}>
                  <Text style={styles.confBadgeText}>{confPct}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.headword, { fontSize: rf(isPrimary ? 26 : 20) }]}>
              {obj.word}
            </Text>
            {obj.ipa ? <Text style={styles.ipaText}>{obj.ipa}</Text> : null}
          </View>

          <Pressable onPress={() => void speakText(obj.word)} style={styles.speakCircleBtn}>
            <Ionicons color={colors.onPrimary} name={isSpeaking ? "volume-high" : "volume-medium"} size={20} />
            <Text style={styles.speakCircleText}>{voiceRegion}</Text>
          </Pressable>
        </View>

        <Text style={styles.meaningViText}>{obj.meaningVi}</Text>
        {obj.meaningEn ? <Text style={styles.meaningEnText}>{obj.meaningEn}</Text> : null}

        {obj.exampleSentence ? (
          <View style={styles.exampleCard}>
            <Text style={styles.exampleEn}>“{obj.exampleSentence}”</Text>
            {obj.exampleTranslation ? (
              <Text style={styles.exampleVi}>{obj.exampleTranslation}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.cardActionRow}>
          <Pressable
            disabled={savingWord === key || isSaved}
            onPress={() => void handleSaveToFlashcards(obj)}
            style={[styles.secondaryBtn, isSaved ? styles.savedBtn : null]}
          >
            <Ionicons
              color={isSaved ? colors.success : colors.primaryDark}
              name={isSaved ? "checkmark-circle" : "bookmark-outline"}
              size={16}
            />
            <Text style={[styles.secondaryBtnText, isSaved ? { color: colors.success } : null]}>
              {isSaved ? "Đã lưu Flashcard" : "Lưu Flashcard"}
            </Text>
          </Pressable>

          <Pressable onPress={() => void executeLookup(obj.word, obj)} style={styles.primarySoftBtn}>
            <Ionicons color={colors.primaryDark} name="git-network-outline" size={16} />
            <Text style={styles.primarySoftBtnText}>Xem Mạng ngữ nghĩa →</Text>
          </Pressable>
        </View>
      </SurfaceCard>
    );
  };

  return (
    <UserScreen>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/home")}
        title="Từ điển Thông minh"
      />

      <LiquidSegmentedBar
        onChange={(next) => setMode(next)}
        options={[
          { value: "lookup" as const, label: "Tra từ Ngữ nghĩa" },
          { value: "camera" as const, label: "Chụp ảnh đồ vật" },
        ]}
        style={styles.modeBar}
        value={mode}
      />

      {mode === "lookup" ? (
        <View style={styles.sectionGap}>
          <SurfaceCard style={styles.searchCard}>
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Ionicons color={colors.textMuted} name="search-outline" size={18} />
                <TextInput
                  autoCapitalize="none"
                  onChangeText={handleChangeQuery}
                  onSubmitEditing={() => void executeLookup(query)}
                  placeholder="Nhập từ tiếng Anh hoặc tiếng Việt (VD: negotiate, hợp đồng)..."
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={query}
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => {
                      setQuery("");
                      setSuggestions([]);
                    }}
                    hitSlop={6}
                  >
                    <Ionicons color={colors.textMuted} name="close-circle" size={18} />
                  </Pressable>
                ) : null}
              </View>

              <LiquidButton
                disabled={loadingLookup || !query.trim()}
                label={loadingLookup ? "Đang tra..." : "Tra từ"}
                onPress={() => void executeLookup(query)}
                style={styles.searchBtn}
              />
            </View>

            {suggestions.length > 0 ? (
              <View style={styles.suggestBox}>
                <Text style={styles.suggestTitle}>Gợi ý từ kho từ vựng ({suggestions.length})</Text>
                {suggestions.map((item) => (
                  <Pressable
                    key={`${item.word}-${item.vocabularyId ?? "s"}`}
                    onPress={() => void executeLookup(item.word, item)}
                    style={styles.suggestRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestWord}>
                        {item.word} {item.ipa ? <Text style={styles.suggestIpa}>{item.ipa}</Text> : null}
                      </Text>
                      <Text numberOfLines={1} style={styles.suggestMeaning}>
                        {item.meaningVi}
                      </Text>
                    </View>
                    {item.relationLabel ? (
                      <View style={styles.metaBadge}>
                        <Text style={styles.metaBadgeText}>{item.relationLabel}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}

            {history.length > 0 ? (
              <View style={styles.historyWrap}>
                <View style={styles.historyHeaderRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Ionicons color={colors.primaryDark} name="time-outline" size={14} />
                    <Text style={styles.historySectionTitle}>
                      Đã tra gần đây ({history.length})
                    </Text>
                  </View>
                  <Pressable onPress={handleClearHistory} hitSlop={8}>
                    <Text style={styles.historyClearText}>Xóa tất cả</Text>
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={styles.quickChipsRow}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {history.map((item) => {
                    const hasOfflineCache = Boolean(
                      getCachedDictionaryEntrySync(userScope, item.normalizedWord || item.word),
                    );
                    return (
                      <View key={item.normalizedWord || item.word} style={styles.historyChipOuter}>
                        <Pressable
                          onPress={() => void executeLookup(item.word, item)}
                          style={styles.historyChipMain}
                        >
                          <Ionicons
                            color={hasOfflineCache ? colors.success : colors.primaryDark}
                            name={hasOfflineCache ? "flash" : "time-outline"}
                            size={12}
                          />
                          <Text style={styles.quickWordChipText}>{item.word}</Text>
                          {item.meaningVi ? (
                            <Text numberOfLines={1} style={styles.historyChipMeaning}>
                              • {item.meaningVi}
                            </Text>
                          ) : null}
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`Xóa ${item.word} khỏi lịch sử`}
                          hitSlop={6}
                          onPress={() => handleRemoveHistoryWord(item.normalizedWord || item.word)}
                          style={styles.historyRemoveBtn}
                        >
                          <Ionicons color={colors.textMuted} name="close" size={13} />
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.quickChipsRow}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {STARTER_WORDS.map((w) => (
                  <Pressable
                    key={w}
                    onPress={() => void executeLookup(w)}
                    style={styles.quickWordChip}
                  >
                    <Ionicons color={colors.primaryDark} name="sparkles-outline" size={13} />
                    <Text style={styles.quickWordChipText}>{w}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </SurfaceCard>

          {loadingLookup ? (
            <SurfaceCard style={styles.centerBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.mutedText}>Đang tra từ và dựng mạng ngữ nghĩa...</Text>
            </SurfaceCard>
          ) : lookupError ? (
            <SurfaceCard style={styles.centerBox}>
              <Ionicons color={colors.danger} name="alert-circle-outline" size={28} />
              <Text style={[styles.mutedText, { color: colors.danger }]}>{lookupError}</Text>
            </SurfaceCard>
          ) : result ? (
            <>
              <SurfaceCard style={styles.resultCard}>
                <View style={styles.headRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.badgeLine}>
                      {result.partOfSpeech ? (
                        <View style={styles.metaBadge}>
                          <Text style={styles.metaBadgeText}>{result.partOfSpeech}</Text>
                        </View>
                      ) : null}
                      {result.cefrLevel ? (
                        <View style={styles.metaBadge}>
                          <Text style={styles.metaBadgeText}>{result.cefrLevel}</Text>
                        </View>
                      ) : null}
                      {result.topicName ? (
                        <View style={styles.topicTag}>
                          <Text numberOfLines={1} style={styles.topicTagText}>
                            {result.topicName}
                          </Text>
                        </View>
                      ) : null}
                      {enrichingBg ? (
                        <View style={styles.enrichingBadge}>
                          <ActivityIndicator color={colors.primaryDark} size="small" />
                          <Text style={styles.enrichingBadgeText}>Đang mở rộng...</Text>
                        </View>
                      ) : result.cached ? (
                        <View style={styles.cachedBadge}>
                          <Ionicons color={colors.success} name="flash" size={11} />
                          <Text style={styles.cachedBadgeText}>Đã lưu</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.headword, { fontSize: rf(isNarrow ? 26 : 30) }]}>
                      {result.word}
                    </Text>
                    {result.ipa ? <Text style={styles.ipaText}>{result.ipa}</Text> : null}
                  </View>

                  <Pressable
                    onPress={() => void speakText(result.word)}
                    style={styles.speakCircleBtn}
                  >
                    <Ionicons
                      color={colors.onPrimary}
                      name={isSpeaking ? "volume-high" : "volume-medium"}
                      size={20}
                    />
                    <Text style={styles.speakCircleText}>{voiceRegion}</Text>
                  </Pressable>
                </View>

                <Text style={styles.meaningViText}>{result.meaningVi}</Text>
                {result.meaningEn ? <Text style={styles.meaningEnText}>{result.meaningEn}</Text> : null}

                {result.usageNote ? (
                  <View style={styles.noteBox}>
                    <Ionicons color={colors.primaryDark} name="bulb-outline" size={16} />
                    <Text style={styles.noteText}>{result.usageNote}</Text>
                  </View>
                ) : null}

                {result.examples.length > 0 ? (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    <Text style={styles.subSectionLabel}>VÍ DỤ NGỮ CẢNH ({result.examples.length})</Text>
                    {result.examples.map((ex, idx) => (
                      <View key={`${ex.english}-${idx}`} style={styles.exampleCard}>
                        <View style={styles.exampleTop}>
                          <Text style={[styles.exampleEn, { flex: 1 }]}>“{ex.english}”</Text>
                          <Pressable onPress={() => void speakText(ex.english)} hitSlop={6}>
                            <Ionicons color={colors.primary} name="volume-high-outline" size={16} />
                          </Pressable>
                        </View>
                        {ex.vietnamese ? <Text style={styles.exampleVi}>{ex.vietnamese}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.cardActionRow}>
                  <Pressable
                    disabled={savingWord === result.normalizedWord || Boolean(savedWords[result.normalizedWord])}
                    onPress={() =>
                      void handleSaveToFlashcards({
                        word: result.word,
                        meaningVi: result.meaningVi,
                        ipa: result.ipa,
                        exampleSentence: result.examples[0]?.english,
                      })
                    }
                    style={[
                      styles.secondaryBtn,
                      savedWords[result.normalizedWord] ? styles.savedBtn : null,
                    ]}
                  >
                    <Ionicons
                      color={savedWords[result.normalizedWord] ? colors.success : colors.primaryDark}
                      name={savedWords[result.normalizedWord] ? "checkmark-circle" : "bookmark-outline"}
                      size={16}
                    />
                    <Text
                      style={[
                        styles.secondaryBtnText,
                        savedWords[result.normalizedWord] ? { color: colors.success } : null,
                      ]}
                    >
                      {savedWords[result.normalizedWord] ? "Đã lưu vào Từ của tôi" : "Lưu vào Flashcards"}
                    </Text>
                  </Pressable>
                </View>
              </SurfaceCard>

              <SurfaceCard style={styles.networkCard}>
                <View style={styles.networkHubHeader}>
                  <View style={styles.hubPill}>
                    <Ionicons color={colors.onPrimary} name="git-network" size={16} />
                    <Text style={styles.hubPillText}>Mạng ngữ nghĩa: {result.word}</Text>
                  </View>
                  <Text style={styles.mutedSmall}>Chạm vào bất kỳ từ nào để đi tiếp trên mạng</Text>
                </View>

                {renderSemanticBranch(
                  "Đồng nghĩa (Synonyms)",
                  "swap-horizontal-outline",
                  result.semanticNetwork.synonyms,
                  "SYNONYM",
                )}
                {renderSemanticBranch(
                  "Trái nghĩa (Antonyms)",
                  "contrast-outline",
                  result.semanticNetwork.antonyms,
                  "ANTONYM",
                )}
                {renderSemanticBranch(
                  "Họ từ / Biến thể (Word Family)",
                  "layers-outline",
                  result.semanticNetwork.wordFamily,
                  "WORD_FAMILY",
                )}
                {renderSemanticBranch(
                  "Cùng trường nghĩa & Chủ đề (Related)",
                  "share-social-outline",
                  result.semanticNetwork.relatedWords,
                  "RELATED",
                )}

                {result.semanticNetwork.collocations.length > 0 ? (
                  <View style={styles.branchGroup}>
                    <View style={styles.branchHeader}>
                      <Ionicons color={colors.primaryDark} name="link-outline" size={15} />
                      <Text style={[styles.branchTitle, { color: colors.primaryDark }]}>
                        Cụm từ đi kèm (Collocations)
                      </Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      {result.semanticNetwork.collocations.map((col) => (
                        <Pressable
                          key={col.phrase}
                          onPress={() => void speakText(col.phrase)}
                          style={styles.collocationRow}
                        >
                          <Text style={styles.collocationPhrase}>{col.phrase}</Text>
                          {col.meaningVi ? (
                            <Text style={styles.collocationVi}>— {col.meaningVi}</Text>
                          ) : null}
                          <Ionicons color={colors.primary} name="volume-medium-outline" size={15} />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </SurfaceCard>
            </>
          ) : (
            <SurfaceCard style={styles.centerBox}>
              <Ionicons color={colors.primary} name="git-network-outline" size={34} />
              <Text style={styles.emptyTitle}>Tra từ & Khám phá Mạng ngữ nghĩa</Text>
              <Text style={styles.mutedText}>
                Nhập từ tiếng Anh hoặc tiếng Việt để xem từ đồng nghĩa, trái nghĩa, họ từ, cụm từ đi kèm và ví dụ TOEIC.
              </Text>
            </SurfaceCard>
          )}
        </View>
      ) : (
        <View style={styles.sectionGap}>
          <SurfaceCard style={styles.cameraCard}>
            <Text style={styles.emptyTitle}>Nhận diện đồ vật quanh bạn bằng Camera AI</Text>
            <Text style={styles.mutedText}>
              Chụp ảnh bàn làm việc, đồ gia dụng, thiết bị điện tử... AI sẽ gọi tên tiếng Anh, phiên âm IPA, nghĩa tiếng Việt và liên kết vào mạng ngữ nghĩa.
            </Text>

            <View style={styles.cameraBtnRow}>
              <LiquidButton
                disabled={recognizing}
                label="Chụp ảnh đồ vật"
                leftIcon={<Ionicons color={colors.onPrimary} name="camera-outline" size={18} />}
                onPress={() => void handleCaptureCamera()}
                style={{ flex: 1 }}
              />
              <Pressable
                disabled={recognizing}
                onPress={() => void handlePickGallery()}
                style={[styles.secondaryBtn, { flex: 1, justifyContent: "center" }]}
              >
                <Ionicons color={colors.primaryDark} name="images-outline" size={18} />
                <Text style={styles.secondaryBtnText}>Chọn ảnh có sẵn</Text>
              </Pressable>
            </View>

            {previewUri ? (
              <View style={styles.previewWrap}>
                <Image contentFit="cover" source={{ uri: previewUri }} style={styles.previewImg} />
                {recognizing ? (
                  <View style={styles.previewOverlay}>
                    <ActivityIndicator color="#FFFFFF" size="large" />
                    <Text style={styles.previewOverlayText}>AI đang phân tích đồ vật...</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </SurfaceCard>

          {visionError ? (
            <SurfaceCard style={styles.centerBox}>
              <Ionicons color={colors.danger} name="alert-circle-outline" size={28} />
              <Text style={[styles.mutedText, { color: colors.danger }]}>{visionError}</Text>
            </SurfaceCard>
          ) : null}

          {visionResult ? (
            <>
              {renderObjectCard(visionResult.primaryObject, true)}

              {visionResult.sceneDescriptionVi || visionResult.sceneDescriptionEn ? (
                <SurfaceCard style={styles.sceneCard}>
                  <Text style={styles.subSectionLabel}>MÔ TẢ BỐI CẢNH ẢNH</Text>
                  {visionResult.sceneDescriptionVi ? (
                    <Text style={styles.sceneVi}>{visionResult.sceneDescriptionVi}</Text>
                  ) : null}
                  {visionResult.sceneDescriptionEn ? (
                    <Text style={styles.sceneEn}>{visionResult.sceneDescriptionEn}</Text>
                  ) : null}
                </SurfaceCard>
              ) : null}

              {visionResult.detectedObjects.length > 0 ? (
                <SurfaceCard style={styles.networkCard}>
                  <Text style={styles.subSectionLabel}>
                    ĐỒ VẬT KHÁC NHẬN DIỆN ĐƯỢC ({visionResult.detectedObjects.length})
                  </Text>
                  <View style={{ gap: 8 }}>
                    {visionResult.detectedObjects.map((obj) => renderObjectCard(obj, false))}
                  </View>
                </SurfaceCard>
              ) : null}

              {visionResult.relatedWords.length > 0 ? (
                <SurfaceCard style={styles.networkCard}>
                  {renderSemanticBranch(
                    "Từ vựng liên quan đến đồ vật này",
                    "share-social-outline",
                    visionResult.relatedWords,
                    "RELATED",
                  )}
                </SurfaceCard>
              ) : null}
            </>
          ) : null}
        </View>
      )}
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    modeBar: { marginBottom: 12 },
    sectionGap: { gap: 12 },
    searchCard: { gap: 10 },
    searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    searchInputWrap: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    searchInput: { color: colors.text, flex: 1, fontSize: 14, paddingVertical: 2 },
    searchBtn: { paddingHorizontal: 16 },
    suggestBox: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: 6,
      padding: 10,
    },
    suggestTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
    suggestRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 8,
      paddingVertical: 6,
    },
    suggestWord: { color: colors.text, fontSize: 14, fontWeight: "800" },
    suggestIpa: { color: colors.primaryDark, fontSize: 12.5, fontWeight: "600" },
    suggestMeaning: { color: colors.textMuted, fontSize: 12 },
    quickChipsRow: { flexDirection: "row", gap: 8, paddingTop: 2 },
    quickWordChip: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    quickWordChipText: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
    historyWrap: { gap: 6, marginTop: 2 },
    historyHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    historySectionTitle: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
    historyClearText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    historyChipOuter: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      maxWidth: 230,
      paddingLeft: 10,
      paddingRight: 6,
      paddingVertical: 5,
    },
    historyChipMain: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 4 },
    historyChipMeaning: { color: colors.textMuted, flexShrink: 1, fontSize: 11.5, fontWeight: "600" },
    historyRemoveBtn: { marginLeft: 4, padding: 2 },
    cachedBadge: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(16,185,129,0.20)" : "#ECFDF5",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    cachedBadgeText: { color: colors.success, fontSize: 11, fontWeight: "800" },
    enrichingBadge: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    enrichingBadgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: "700" },
    centerBox: { alignItems: "center", gap: 10, paddingVertical: 28 },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "900", textAlign: "center" },
    mutedText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
    mutedSmall: { color: colors.textMuted, fontSize: 11.5 },
    resultCard: { gap: 10 },
    headRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
    badgeLine: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
    primaryTag: {
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    primaryTagText: { color: colors.onPrimary, fontSize: 10.5, fontWeight: "900" },
    metaBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    metaBadgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: "800" },
    confBadge: {
      backgroundColor: colors.isDark ? "rgba(16,185,129,0.22)" : "#ECFDF5",
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    confBadgeText: { color: colors.success, fontSize: 11, fontWeight: "800" },
    topicTag: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      maxWidth: 220,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    topicTagText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    headword: { color: colors.text, fontWeight: "900" },
    ipaText: { color: colors.primary, fontSize: 14.5, fontWeight: "700" },
    speakCircleBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 16,
      gap: 2,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    speakCircleText: { color: colors.onPrimary, fontSize: 10.5, fontWeight: "900" },
    meaningViText: { color: colors.text, fontSize: 17, fontWeight: "800", lineHeight: 24 },
    meaningEnText: { color: colors.textMuted, fontSize: 13.5, lineHeight: 20 },
    noteBox: {
      alignItems: "flex-start",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 8,
      padding: 10,
    },
    noteText: { color: colors.primaryDark, flex: 1, fontSize: 12.5, fontWeight: "600", lineHeight: 18 },
    subSectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
    exampleCard: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      gap: 4,
      padding: 10,
    },
    exampleTop: { alignItems: "center", flexDirection: "row", gap: 8 },
    exampleEn: { color: colors.text, fontSize: 13.5, fontWeight: "700", lineHeight: 20 },
    exampleVi: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
    cardActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
    secondaryBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    secondaryBtnText: { color: colors.primaryDark, fontSize: 12.5, fontWeight: "800" },
    savedBtn: {
      backgroundColor: colors.isDark ? "rgba(16,185,129,0.16)" : "#ECFDF5",
      borderColor: colors.success,
    },
    primarySoftBtn: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    primarySoftBtnText: { color: colors.primaryDark, fontSize: 12.5, fontWeight: "800" },
    networkCard: { gap: 14 },
    networkHubHeader: { alignItems: "center", gap: 4 },
    hubPill: {
      alignItems: "center",
      backgroundColor: colors.primaryDark,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    hubPillText: { color: colors.onPrimary, fontSize: 13, fontWeight: "900" },
    branchGroup: { gap: 8 },
    branchHeader: { alignItems: "center", flexDirection: "row", gap: 6 },
    branchTitle: { fontSize: 12.5, fontWeight: "900" },
    branchChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    semanticNodeChip: {
      borderRadius: radius.md,
      borderWidth: 1,
      gap: 2,
      maxWidth: 190,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    nodeChipTopRow: { alignItems: "center", flexDirection: "row", gap: 5 },
    nodeChipWord: { fontSize: 13, fontWeight: "900" },
    nodeCefrTag: {
      backgroundColor: "rgba(255,255,255,0.65)",
      borderRadius: 6,
      color: "#334155",
      fontSize: 10,
      fontWeight: "800",
      overflow: "hidden",
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    nodeChipMeaning: { color: colors.textMuted, fontSize: 11.5 },
    collocationRow: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    collocationPhrase: { color: colors.text, fontSize: 13, fontWeight: "800" },
    collocationVi: { color: colors.textMuted, flex: 1, fontSize: 12.5 },
    cameraCard: { gap: 12 },
    cameraBtnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    previewWrap: {
      borderRadius: radius.lg,
      height: 220,
      overflow: "hidden",
      position: "relative",
      width: "100%",
    },
    previewImg: { height: "100%", width: "100%" },
    previewOverlay: {
      alignItems: "center",
      backgroundColor: "rgba(15, 23, 42, 0.58)",
      bottom: 0,
      gap: 8,
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    previewOverlayText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800" },
    sceneCard: { gap: 6 },
    sceneVi: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    sceneEn: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  });
