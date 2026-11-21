import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  LiquidButton,
  LiquidCard,
  LiquidIconButton,
  LiquidSegmentedBar,
} from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import ProgressBar from "@/src/components/user/ProgressBar";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  createFlashcardCollection,
  createMyFlashcard,
  deleteFlashcardCollection,
  deleteMyFlashcard,
  getAllVocabularies,
  getDueVocabularies,
  getFlashcardCollectionDetail,
  getModuleFlashcardsForUser,
  getMyFlashcardCollections,
  getMyFlashcards,
  getVocabularyTopics,
  reviewVocabularyWord,
  updateMyFlashcard,
} from "@/src/services/user.service";
import { vocabProgressStore } from "@/src/store/progress-store";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { useVoiceSettings } from "@/src/store/voice-store";
import {
  FlashcardApiItem,
  FlashcardCollectionApiItem,
  Sm2Rating,
  VocabularyStudyItem,
  VocabularyTopicItem,
} from "@/src/types/user-api";
import { pushRoute, replaceRoute } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";
import { cleanMeaningText, cleanStudyText } from "@/src/utils/text-clean";

type TabMode = "lesson" | "mine" | "sm2";
type StudyViewMode = "flip" | "quiz";
type Sm2Scope = "due" | "all";
type Sm2ViewMode = "units" | "study";
type AddMode = "manual" | "bulk";

type NormalizedDeckCard = {
  key: string;
  word: string;
  meaningVi: string;
  meaningEn?: string | null;
  pronunciation?: string | null;
  exampleSentence?: string | null;
  exampleTranslation?: string | null;
  sm2?: VocabularyStudyItem;
};

type BulkFlashcardInput = {
  englishWord: string;
  meaningVi: string;
  exampleSentence?: string;
  pronunciation?: string;
};

const SM2_RATING_OPTIONS: {
  rating: Sm2Rating;
  label: string;
  hint: string;
}[] = [
  { rating: "AGAIN", label: "Quên", hint: "Lại ngay" },
  { rating: "HARD", label: "Khó", hint: "1–2 ngày" },
  { rating: "GOOD", label: "Nhớ", hint: "Chuẩn" },
  { rating: "EASY", label: "Rất dễ", hint: "Xa hơn" },
];

const QUICK_JSON_TEMPLATE = `{
  "topicName": "Business Meeting",
  "topicDescription": "Từ vựng họp và đàm phán",
  "items": [
    {
      "englishWord": "negotiate",
      "meaningVi": "đàm phán",
      "exampleSentence": "We need to negotiate a better price.",
      "pronunciation": "/nɪˈɡəʊ.ʃi.eɪt/"
    }
  ]
}`;

const SM2_LEVEL_TABS: { key: string; label: string }[] = [
  { key: "TOEIC-600", label: "TOEIC 600" },
  { key: "A1", label: "A1" },
  { key: "A2", label: "A2" },
  { key: "B1", label: "B1" },
  { key: "B2", label: "B2" },
  { key: "C1", label: "C1" },
  { key: "ALL", label: "Tất cả" },
];

function parseUnitTitleParts(rawName: string): { title: string; subtitle?: string } {
  const withoutLevel = rawName
    .replace(/^TOEIC\s+\d+\s+•\s+/i, "")
    .replace(/^CEFR\s+[A-C][12]\s+•\s+/i, "")
    .replace(/^[A-C][12]\s+•\s+/i, "")
    .trim();

  if (withoutLevel.includes("•")) {
    const parts = withoutLevel
      .split("•")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const partSuffixMatch = parts[parts.length - 1].match(/\s*(\(\d+\))$/);
      const enTitle = parts[0];
      const viSubtitle = parts.slice(1).join(" • ").replace(/\s*\(\d+\)$/, "").trim();
      return {
        title: partSuffixMatch && !/\(\d+\)$/.test(enTitle) ? `${enTitle} ${partSuffixMatch[1]}` : enTitle,
        subtitle: viSubtitle,
      };
    }
  }
  return { title: withoutLevel };
}

type UnitVisual = {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  fg: string;
};

function getUnitThemeVisual(name: string, isDark: boolean): UnitVisual {
  const low = name.toLowerCase();
  if (low.includes("animal") || low.includes("nature") || low.includes("environment")) {
    return { icon: "leaf-outline", bg: isDark ? "rgba(34,197,94,0.20)" : "#E6F8EC", fg: "#16A34A" };
  }
  if (low.includes("weather") || low.includes("climate") || low.includes("time") || low.includes("shape")) {
    return { icon: low.includes("weather") ? "partly-sunny-outline" : "time-outline", bg: isDark ? "rgba(14,165,233,0.20)" : "#E0F4FF", fg: "#0284C7" };
  }
  if (low.includes("food") || low.includes("drink") || low.includes("dining")) {
    return { icon: "restaurant-outline", bg: isDark ? "rgba(245,158,11,0.20)" : "#FFF3D9", fg: "#D97706" };
  }
  if (low.includes("health") || low.includes("body") || low.includes("warrant")) {
    return { icon: "heart-outline", bg: isDark ? "rgba(239,68,68,0.20)" : "#FEECEF", fg: "#E11D48" };
  }
  if (low.includes("family") || low.includes("people") || low.includes("hiring") || low.includes("recruit")) {
    return { icon: "people-outline", bg: isDark ? "rgba(236,72,153,0.20)" : "#FCE7F3", fg: "#DB2777" };
  }
  if (low.includes("home") || low.includes("furniture") || low.includes("real estate") || low.includes("property")) {
    return { icon: "home-outline", bg: isDark ? "rgba(249,115,22,0.20)" : "#FFEDD5", fg: "#EA580C" };
  }
  if (low.includes("travel") || low.includes("transport") || low.includes("hotel")) {
    return { icon: "airplane-outline", bg: isDark ? "rgba(56,189,248,0.20)" : "#E0F2FE", fg: "#0369A1" };
  }
  if (low.includes("shop") || low.includes("cloth") || low.includes("purchas") || low.includes("logistic")) {
    return { icon: "bag-handle-outline", bg: isDark ? "rgba(251,146,60,0.20)" : "#FFF1E6", fg: "#EA580C" };
  }
  if (low.includes("sport") || low.includes("leisure")) {
    return { icon: "basketball-outline", bg: isDark ? "rgba(234,179,8,0.20)" : "#FEF9C3", fg: "#CA8A04" };
  }
  if (low.includes("feel") || low.includes("personal")) {
    return { icon: "happy-outline", bg: isDark ? "rgba(192,38,211,0.20)" : "#FAE8FF", fg: "#A21CAF" };
  }
  if (low.includes("education") || low.includes("language") || low.includes("conference") || low.includes("talk")) {
    return { icon: "school-outline", bg: isDark ? "rgba(139,92,246,0.20)" : "#F3E8FF", fg: "#7C3AED" };
  }
  if (low.includes("tech") || low.includes("media") || low.includes("manufactur")) {
    return { icon: "laptop-outline", bg: isDark ? "rgba(6,182,212,0.20)" : "#ECFEFF", fg: "#0891B2" };
  }
  if (low.includes("contract") || low.includes("negotiat") || low.includes("law") || low.includes("politic") || low.includes("society")) {
    return { icon: "document-text-outline", bg: isDark ? "rgba(99,102,241,0.20)" : "#EEF2FF", fg: "#4F46E5" };
  }
  if (low.includes("bank") || low.includes("finance") || low.includes("salar") || low.includes("invest")) {
    return { icon: "wallet-outline", bg: isDark ? "rgba(16,185,129,0.20)" : "#D1FAE5", fg: "#059669" };
  }
  if (low.includes("market") || low.includes("business") || low.includes("job") || low.includes("office")) {
    return { icon: "briefcase-outline", bg: isDark ? "rgba(59,130,246,0.20)" : "#DBEAFE", fg: "#2563EB" };
  }
  if (low.includes("verb") || low.includes("action")) {
    return { icon: "flash-outline", bg: isDark ? "rgba(245,158,11,0.20)" : "#FEF3C7", fg: "#B45309" };
  }
  if (low.includes("qualit") || low.includes("descript")) {
    return { icon: "sparkles-outline", bg: isDark ? "rgba(168,85,247,0.20)" : "#F3E8FF", fg: "#9333EA" };
  }
  return { icon: "layers-outline", bg: isDark ? "rgba(100,116,139,0.25)" : "#F1F5F9", fg: "#475569" };
}

function getSm2RatingTone(rating: Sm2Rating, colors: LiquidThemeColors) {
  if (rating === "AGAIN") {
    return {
      bg: colors.isDark ? "rgba(239,68,68,0.18)" : "#FDF0EE",
      border: colors.isDark ? "rgba(248,113,113,0.40)" : "#F3C6BE",
      text: colors.danger,
    };
  }
  if (rating === "HARD") {
    return {
      bg: colors.accentSoft,
      border: colors.accent,
      text: colors.accent,
    };
  }
  if (rating === "GOOD") {
    return {
      bg: colors.isDark ? "rgba(31,157,108,0.18)" : "#ECF8F5",
      border: colors.isDark ? "rgba(31,157,108,0.40)" : "#BDE5DC",
      text: colors.success,
    };
  }
  return {
    bg: colors.primarySoft,
    border: colors.primary,
    text: colors.primary,
  };
}

function buildDeterministicQuizOptions(
  deck: NormalizedDeckCard[],
  targetIndex: number,
  seed: number,
): string[] {
  const current = deck[targetIndex];
  if (!current) return [];
  const currentMeaning = (current.meaningVi ?? "").trim();
  const distractors = deck
    .filter((_, idx) => idx !== targetIndex)
    .map((item) => (item.meaningVi ?? "").trim())
    .filter((meaning, idx, arr) => meaning && meaning !== currentMeaning && arr.indexOf(meaning) === idx);

  const rankedDistractors = [...distractors].sort((a, b) => {
    const scoreA = (a.charCodeAt(0) * 17 + targetIndex * 31 + seed * 13) % 97;
    const scoreB = (b.charCodeAt(0) * 17 + targetIndex * 31 + seed * 13) % 97;
    return scoreA - scoreB;
  });

  const choices = [currentMeaning, ...rankedDistractors.slice(0, 3)];
  return [...choices].sort((a, b) => {
    const scoreA = (a.length * 19 + a.charCodeAt(0) + targetIndex * 7 + seed * 11) % 89;
    const scoreB = (b.length * 19 + b.charCodeAt(0) + targetIndex * 7 + seed * 11) % 89;
    return scoreA - scoreB;
  });
}

function formatName(fullName?: string | null) {
  if (!fullName?.trim()) return "B";
  return fullName.trim().charAt(0).toUpperCase();
}

export default function CardsScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, height, isNarrow, isShort, rf, screenPadding } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ moduleId?: string; mode?: string }>();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mode, setMode] = useState<TabMode>("mine");
  const [studyView, setStudyView] = useState<StudyViewMode>("flip");
  const [showMeaning, setShowMeaning] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);

  const [lessonCards, setLessonCards] = useState<FlashcardApiItem[]>([]);
  const [myCards, setMyCards] = useState<FlashcardApiItem[]>([]);
  const [collections, setCollections] = useState<FlashcardCollectionApiItem[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);

  const [sm2Topics, setSm2Topics] = useState<VocabularyTopicItem[]>([]);
  const sm2TopicsRef = useRef<VocabularyTopicItem[]>([]);
  const [selectedSm2Level, setSelectedSm2Level] = useState<string>("TOEIC-600");
  const selectedSm2LevelRef = useRef<string>("TOEIC-600");
  const [selectedSm2TopicId, setSelectedSm2TopicId] = useState<number | null>(null);
  const [sm2View, setSm2View] = useState<Sm2ViewMode>("units");
  const [showAllLevelUnits, setShowAllLevelUnits] = useState(false);
  const [sm2Search, setSm2Search] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const lastExecutedSearchRef = useRef("");
  const [sm2Scope, setSm2Scope] = useState<Sm2Scope>("due");
  const [sm2DueItems, setSm2DueItems] = useState<VocabularyStudyItem[]>([]);
  const [sm2AllItems, setSm2AllItems] = useState<VocabularyStudyItem[]>([]);
  const [sm2Loading, setSm2Loading] = useState(false);
  const [sm2Feedback, setSm2Feedback] = useState<string | null>(null);

  const [quizSeed, setQuizSeed] = useState(1);
  const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<string | null>(null);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizAnsweredCount, setQuizAnsweredCount] = useState(0);

  const {
    engine: voiceEngine,
    voiceRegion,
    selectedVoiceId,
    rate,
    pitch,
    voices: speechifyVoices,
    speechifyConfigured,
    isSpeaking,
    setEngine: setVoiceEngine,
    setVoiceRegion,
    setSelectedVoiceId,
    setRate,
    setPitch,
    speakText,
    stopSpeaking,
  } = useVoiceSettings();
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  const [showTopicEditor, setShowTopicEditor] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("manual");

  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");

  const [manualWord, setManualWord] = useState("");
  const [manualMeaning, setManualMeaning] = useState("");
  const [manualExample, setManualExample] = useState("");
  const [manualPronunciation, setManualPronunciation] = useState("");
  const [bulkJson, setBulkJson] = useState(QUICK_JSON_TEMPLATE);

  const selectedModuleId = useMemo(() => {
    if (!params.moduleId) return undefined;
    const parsed = Number(params.moduleId);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [params.moduleId]);

  const activeSm2Items = useMemo(
    () => (sm2Scope === "due" ? sm2DueItems : sm2AllItems),
    [sm2AllItems, sm2DueItems, sm2Scope],
  );

  const rawFlashcards = mode === "lesson" ? lessonCards : myCards;

  const normalizedDeck = useMemo<NormalizedDeckCard[]>(() => {
    if (mode === "sm2") {
      return activeSm2Items.map((item) => ({
        key: `sm2-${item.vocabularyId}`,
        word: item.word,
        meaningVi: cleanMeaningText(item.meaningVi) || item.word,
        meaningEn: cleanStudyText(item.meaningEn) || null,
        pronunciation: item.ipa,
        exampleSentence: cleanStudyText(item.exampleSentence) || null,
        exampleTranslation: cleanStudyText(item.exampleTranslation) || null,
        sm2: item,
      }));
    }

    return rawFlashcards.map((item) => ({
      key: `fc-${item.id}`,
      word: item.englishWord,
      meaningVi: cleanMeaningText(item.meaningVi) || item.englishWord,
      pronunciation: item.pronunciation,
      exampleSentence: cleanStudyText(item.exampleSentence) || null,
    }));
  }, [activeSm2Items, mode, rawFlashcards]);

  const currentDeckCount = normalizedDeck.length;
  const currentCard = useMemo(() => {
    if (mode === "sm2" || rawFlashcards.length === 0) return null;
    return rawFlashcards[cardIndex % rawFlashcards.length];
  }, [cardIndex, mode, rawFlashcards]);

  const currentDisplayCard = useMemo(() => {
    if (normalizedDeck.length === 0) return null;
    return normalizedDeck[cardIndex % normalizedDeck.length];
  }, [cardIndex, normalizedDeck]);

  const quizOptions = useMemo(() => {
    if (studyView !== "quiz" || normalizedDeck.length < 2) return [];
    const safeIdx = cardIndex % normalizedDeck.length;
    return buildDeterministicQuizOptions(normalizedDeck, safeIdx, quizSeed);
  }, [cardIndex, normalizedDeck, quizSeed, studyView]);

  const progressValue = currentDeckCount ? (((cardIndex % currentDeckCount) + 1) / currentDeckCount) * 100 : 0;
  const avatarLabel = formatName(auth.user?.fullName);

  const sm2LevelTotals = useMemo(() => {
    const totals: Record<string, number> = { ALL: 0 };
    for (const t of sm2Topics) {
      const lvl = (t.level ?? "OTHER").trim().toUpperCase();
      const count = Number(t.wordCount ?? 0);
      totals[lvl] = (totals[lvl] ?? 0) + count;
      totals.ALL += count;
    }
    return totals;
  }, [sm2Topics]);

  const sm2TotalRemaining = useMemo(() => {
    let total = 0;
    let studied = 0;
    for (const t of sm2Topics) {
      total += Number(t.wordCount ?? 0);
      studied += Number(t.studiedCount ?? 0);
    }
    return Math.max(0, total - studied);
  }, [sm2Topics]);

  const filteredSm2Topics = useMemo(() => {
    const levelMatched =
      selectedSm2Level === "ALL"
        ? sm2Topics
        : sm2Topics.filter((t) => (t.level ?? "").trim().toUpperCase() === selectedSm2Level);
    const q = sm2Search.trim().toLowerCase();
    if (!q || sm2View === "study") {
      return levelMatched;
    }
    return levelMatched.filter((t) => {
      const n = (t.name ?? "").toLowerCase();
      const d = (t.description ?? "").toLowerCase();
      return n.includes(q) || d.includes(q);
    });
  }, [selectedSm2Level, sm2Search, sm2Topics, sm2View]);

  const activeSm2Topic = useMemo(
    () => sm2Topics.find((t) => t.id === selectedSm2TopicId) ?? filteredSm2Topics[0] ?? null,
    [filteredSm2Topics, selectedSm2TopicId, sm2Topics],
  );

  const loadSm2Data = useCallback(
    async (opts?: { topicId?: number | null; level?: string; q?: string; refreshTopics?: boolean }) => {
      if (!auth.accessToken) return { dueCount: 0, allCount: 0 };
      try {
        setSm2Loading(true);
        let topicsList = sm2TopicsRef.current;
        if (topicsList.length === 0 || (opts?.refreshTopics ?? !opts)) {
          const topicsRes = await getVocabularyTopics(auth.accessToken);
          topicsList = topicsRes.data ?? [];
          sm2TopicsRef.current = topicsList;
          setSm2Topics(topicsList);
        }

        const requestedLevel = opts?.level ?? selectedSm2LevelRef.current;
        const levelHasTopics = topicsList.some(
          (t) => (t.level ?? "").trim().toUpperCase() === requestedLevel,
        );
        const activeLevel =
          requestedLevel === "ALL" || levelHasTopics
            ? requestedLevel
            : topicsList.some((t) => (t.level ?? "").trim().toUpperCase() === "TOEIC-600")
              ? "TOEIC-600"
              : "ALL";
        if (activeLevel !== selectedSm2LevelRef.current) {
          selectedSm2LevelRef.current = activeLevel;
          setSelectedSm2Level(activeLevel);
        }

        const trimmedQ = (opts?.q ?? "").trim();
        const topicsInLevel =
          activeLevel === "ALL"
            ? topicsList
            : topicsList.filter((t) => (t.level ?? "").trim().toUpperCase() === activeLevel);

        let resolvedTopicId: number | undefined;
        if (trimmedQ.length >= 2) {
          resolvedTopicId = undefined;
        } else if (typeof opts?.topicId === "number") {
          resolvedTopicId = opts.topicId;
        } else {
          resolvedTopicId = topicsInLevel[0]?.id ?? topicsList[0]?.id;
          if (resolvedTopicId !== undefined) {
            setSelectedSm2TopicId(resolvedTopicId);
          }
        }

        const queryParams =
          trimmedQ.length >= 2
            ? {
                level: activeLevel === "ALL" ? undefined : activeLevel,
                q: trimmedQ,
                limit: 80,
              }
            : {
                topicId: resolvedTopicId,
                limit: resolvedTopicId ? undefined : 120,
              };

        const [dueRes, allRes] = await Promise.all([
          getDueVocabularies(auth.accessToken, queryParams),
          getAllVocabularies(auth.accessToken, queryParams),
        ]);
        setSm2DueItems(dueRes.data ?? []);
        setSm2AllItems(allRes.data ?? []);
        return {
          dueCount: (dueRes.data ?? []).length,
          allCount: (allRes.data ?? []).length,
        };
      } catch {
        return { dueCount: 0, allCount: 0 };
      } finally {
        setSm2Loading(false);
      }
    },
    [auth.accessToken],
  );

  const loadCollectionsAndCards = useCallback(async () => {
    if (!auth.accessToken) return 0;
    const collectionsPayload = await getMyFlashcardCollections(auth.accessToken);
    const nextCollections = collectionsPayload.data ?? [];
    setCollections(nextCollections);
    const nextSelected =
      selectedCollectionId && nextCollections.some((item) => item.id === selectedCollectionId)
        ? selectedCollectionId
        : nextCollections[0]?.id ?? null;
    setSelectedCollectionId(nextSelected);

    if (nextSelected) {
      const detail = await getFlashcardCollectionDetail(auth.accessToken, nextSelected);
      const list = detail.data?.flashcards ?? [];
      setMyCards(list);
      return list.length;
    }

    const mine = await getMyFlashcards(auth.accessToken);
    const list = mine.data ?? [];
    setMyCards(list);
    return list.length;
  }, [auth.accessToken, selectedCollectionId]);

  const loadAll = useCallback(async () => {
    if (!auth.accessToken) return;

    try {
      setLoading(true);
      if (selectedModuleId) {
        const moduleCards = await getModuleFlashcardsForUser(auth.accessToken, selectedModuleId);
        setLessonCards(moduleCards.data ?? []);
        setMode("lesson");
        await loadSm2Data();
      } else {
        setLessonCards([]);
        const [myCount, sm2Stats] = await Promise.all([
          loadCollectionsAndCards(),
          loadSm2Data(),
        ]);
        if (params.mode === "sm2" || (myCount === 0 && sm2Stats.allCount > 0)) {
          setMode("sm2");
          if (sm2Stats.dueCount === 0 && sm2Stats.allCount > 0) {
            setSm2Scope("all");
          }
        } else {
          setMode("mine");
        }
      }
      setCardIndex(0);
      setShowMeaning(false);
      setSelectedQuizAnswer(null);
    } catch (error) {
      Alert.alert("Flashcards", error instanceof Error ? error.message : "Không thể tải flashcard.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, loadCollectionsAndCards, loadSm2Data, params.mode, selectedModuleId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  const regionSpeechifyVoices = useMemo(() => {
    const targetPrefix = voiceRegion === "UK" ? "en-gb" : "en-us";
    const matched = speechifyVoices.filter((v) =>
      v.locale?.toLowerCase().startsWith(targetPrefix),
    );
    return (matched.length > 0 ? matched : speechifyVoices).slice(0, 12);
  }, [speechifyVoices, voiceRegion]);

  const createAndAttachToCollection = async (item: BulkFlashcardInput, collectionId: number | null) => {
    if (!auth.accessToken) return;

    const created = await createMyFlashcard(auth.accessToken, {
      englishWord: item.englishWord.trim(),
      meaningVi: item.meaningVi.trim(),
      exampleSentence: item.exampleSentence?.trim() || undefined,
      pronunciation: item.pronunciation?.trim() || undefined,
    });

    if (collectionId && created.data?.id) {
      await updateMyFlashcard(auth.accessToken, created.data.id, {
        flashcardCollectionId: collectionId,
      });
    }
  };

  const handleCreateCollection = async () => {
    if (!auth.accessToken || !newCollectionName.trim()) {
      Alert.alert("Chủ đề", "Nhập tên chủ đề trước.");
      return;
    }

    try {
      setWorking(true);
      const created = await createFlashcardCollection(auth.accessToken, {
        name: newCollectionName.trim(),
        description: newCollectionDescription.trim() || undefined,
      });
      setNewCollectionName("");
      setNewCollectionDescription("");
      setSelectedCollectionId(created.data?.id ?? null);
      await loadCollectionsAndCards();
      setShowTopicEditor(false);
    } catch (error) {
      Alert.alert("Chủ đề", error instanceof Error ? error.message : "Không tạo được chủ đề.");
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!auth.accessToken || !selectedCollectionId) return;

    try {
      setWorking(true);
      await deleteFlashcardCollection(auth.accessToken, selectedCollectionId);
      setSelectedCollectionId(null);
      await loadCollectionsAndCards();
      setShowTopicEditor(false);
    } catch (error) {
      Alert.alert("Chủ đề", error instanceof Error ? error.message : "Không xóa được chủ đề.");
    } finally {
      setWorking(false);
    }
  };

  const handleManualAdd = async () => {
    if (!manualWord.trim() || !manualMeaning.trim()) {
      Alert.alert("Flashcard", "Cần nhập từ tiếng Anh và nghĩa tiếng Việt.");
      return;
    }

    try {
      setWorking(true);
      await createAndAttachToCollection(
        {
          englishWord: manualWord,
          meaningVi: manualMeaning,
          exampleSentence: manualExample,
          pronunciation: manualPronunciation,
        },
        selectedCollectionId,
      );
      setManualWord("");
      setManualMeaning("");
      setManualExample("");
      setManualPronunciation("");
      await loadCollectionsAndCards();
      setShowAddForm(false);
    } catch (error) {
      Alert.alert("Flashcard", error instanceof Error ? error.message : "Không thêm được flashcard.");
    } finally {
      setWorking(false);
    }
  };

  const parseBulkInput = (raw: string): { topicName?: string; topicDescription?: string; items: BulkFlashcardInput[] } => {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return { items: parsed as BulkFlashcardInput[] };

    if (typeof parsed === "object" && parsed !== null && "items" in parsed) {
      const data = parsed as {
        topicName?: string;
        topic?: string;
        topicDescription?: string;
        description?: string;
        items: BulkFlashcardInput[];
      };

      return {
        topicDescription: data.topicDescription ?? data.description,
        topicName: data.topicName ?? data.topic,
        items: Array.isArray(data.items) ? data.items : [],
      };
    }

    return { items: [] };
  };

  const handleBulkAdd = async () => {
    if (!auth.accessToken) return;

    try {
      setWorking(true);
      const payload = parseBulkInput(bulkJson);
      if (!payload.items.length) throw new Error("JSON không hợp lệ hoặc không có items.");

      let collectionId = selectedCollectionId;

      if (!collectionId && payload.topicName?.trim()) {
        const created = await createFlashcardCollection(auth.accessToken, {
          name: payload.topicName.trim(),
          description: payload.topicDescription?.trim() || undefined,
        });
        collectionId = created.data?.id ?? null;
      }

      for (const item of payload.items) {
        if (!item.englishWord?.trim() || !item.meaningVi?.trim()) continue;
        await createAndAttachToCollection(item, collectionId);
      }

      await loadCollectionsAndCards();
      setShowAddForm(false);
      Alert.alert("Flashcard", "Đã thêm nhanh từ JSON.");
    } catch (error) {
      Alert.alert("Bulk JSON", error instanceof Error ? error.message : "Không parse được JSON.");
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteCurrentCard = async () => {
    if (!auth.accessToken || !currentCard || mode !== "mine") return;

    try {
      setWorking(true);
      await deleteMyFlashcard(auth.accessToken, currentCard.id);
      await loadCollectionsAndCards();
      setCardIndex(0);
      setShowMeaning(false);
    } catch (error) {
      Alert.alert("Flashcard", error instanceof Error ? error.message : "Không xóa được từ.");
    } finally {
      setWorking(false);
    }
  };

  const handleFinishLessonCards = () => {
    if (!selectedModuleId) return;
    vocabProgressStore.markCompleted(selectedModuleId, auth.user?.id);
    replaceRoute(`/user/roadmap?moduleId=${selectedModuleId}&vocabDone=true&focus=practice`);
  };

  const handleOpenAllCards = async () => {
    setSelectedCollectionId(null);
    if (!auth.accessToken) return;
    const mine = await getMyFlashcards(auth.accessToken);
    setMyCards(mine.data ?? []);
    setCardIndex(0);
  };

  const handleSelectSm2Level = (levelKey: string) => {
    selectedSm2LevelRef.current = levelKey;
    setSelectedSm2Level(levelKey);
    setSm2View("units");
    setShowAllLevelUnits(false);
    lastExecutedSearchRef.current = "";
    setActiveSearchQuery("");
    setSm2Search("");
    setCardIndex(0);
    setShowMeaning(false);
    setSelectedQuizAnswer(null);
    setSm2Feedback(null);
    const matchingTopics =
      levelKey === "ALL"
        ? sm2Topics
        : sm2Topics.filter((t) => (t.level ?? "").trim().toUpperCase() === levelKey);
    setSelectedSm2TopicId(matchingTopics[0]?.id ?? null);
  };

  const handleOpenSm2Unit = async (topicId: number | null) => {
    setSelectedSm2TopicId(topicId);
    setSm2View("study");
    lastExecutedSearchRef.current = "";
    setActiveSearchQuery("");
    setSm2Search("");
    setCardIndex(0);
    setShowMeaning(false);
    setSelectedQuizAnswer(null);
    setSm2Feedback(null);
    const stats = await loadSm2Data({ topicId, level: selectedSm2Level });
    setSm2Scope(stats.dueCount === 0 && stats.allCount > 0 ? "all" : "due");
  };

  const handleOpenSm2SearchStudy = async () => {
    const trimmed = sm2Search.trim();
    if (trimmed.length < 2) return;
    lastExecutedSearchRef.current = trimmed;
    setActiveSearchQuery(trimmed);
    setSm2View("study");
    setSm2Scope("all");
    setCardIndex(0);
    setShowMeaning(false);
    setSelectedQuizAnswer(null);
    setSm2Feedback(null);
    await loadSm2Data({ level: selectedSm2Level, q: trimmed });
  };

  const handleSearchSm2Change = (textValue: string) => {
    setSm2Search(textValue);
    setCardIndex(0);
    setShowMeaning(false);
    setSelectedQuizAnswer(null);
  };

  const handleBackToUnitsList = () => {
    setSm2View("units");
    setShowMeaning(false);
    setSelectedQuizAnswer(null);
    setSm2Feedback(null);
    lastExecutedSearchRef.current = "";
    setActiveSearchQuery("");
  };

  useEffect(() => {
    if (mode !== "sm2" || sm2View !== "study" || sm2TopicsRef.current.length === 0) return;
    const trimmed = sm2Search.trim();
    if (trimmed.length === 1) return;
    const timer = setTimeout(() => {
      if (trimmed.length >= 2 && lastExecutedSearchRef.current !== trimmed) {
        lastExecutedSearchRef.current = trimmed;
        setActiveSearchQuery(trimmed);
        setSm2Scope("all");
        void loadSm2Data({ level: selectedSm2Level, q: trimmed });
      } else if (trimmed.length === 0 && lastExecutedSearchRef.current.length >= 2) {
        lastExecutedSearchRef.current = "";
        setActiveSearchQuery("");
        void loadSm2Data({ topicId: selectedSm2TopicId, level: selectedSm2Level });
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [loadSm2Data, mode, selectedSm2Level, selectedSm2TopicId, sm2Search, sm2View]);

  const handleRateSm2 = async (rating: Sm2Rating) => {
    if (!auth.accessToken || !currentDisplayCard?.sm2) return;
    const previousSm2 = currentDisplayCard.sm2;
    const vocabId = previousSm2.vocabularyId;
    const hadReviewedBefore =
      (previousSm2.repetitions ?? 0) > 0 || Boolean(previousSm2.lastReviewedAt);
    try {
      setWorking(true);
      const res = await reviewVocabularyWord(auth.accessToken, vocabId, rating);
      const updated = res.data;
      if (updated) {
        setSm2AllItems((prev) => prev.map((item) => (item.vocabularyId === vocabId ? updated : item)));
        setSm2DueItems((prev) => prev.map((item) => (item.vocabularyId === vocabId ? updated : item)));
        const targetTopicId = updated.topicId ?? selectedSm2TopicId;
        if (!hadReviewedBefore && targetTopicId) {
          setSm2Topics((prev) => {
            const next = prev.map((topic) =>
              topic.id === targetTopicId
                ? {
                    ...topic,
                    studiedCount: Math.min(topic.wordCount, Number(topic.studiedCount ?? 0) + 1),
                    masteredCount:
                      updated.status === "MASTERED"
                        ? Math.min(topic.wordCount, Number(topic.masteredCount ?? 0) + 1)
                        : topic.masteredCount,
                  }
                : topic,
            );
            sm2TopicsRef.current = next;
            return next;
          });
        }
        if (auth.user && typeof updated.currentDiamonds === "number") {
          updateUserProfile({ ...auth.user, diamonds: updated.currentDiamonds });
        }
        const earned = updated.diamondsEarned ?? 0;
        setSm2Feedback(
          earned > 0
            ? `Đã chấm ${rating} (+${earned} 💎) • Lặp lại sau ${updated.intervalDays ?? 0} ngày`
            : `Đã chấm ${rating} • Lặp lại sau ${updated.intervalDays ?? 0} ngày`,
        );
      }
      setShowMeaning(false);
      setSelectedQuizAnswer(null);
      if (currentDeckCount > 0) {
        setCardIndex((prev) => (prev + 1) % currentDeckCount);
      }
    } catch (error) {
      Alert.alert("SM-2", error instanceof Error ? error.message : "Không thể lưu kết quả ôn SM-2.");
    } finally {
      setWorking(false);
    }
  };

  const handleSelectQuizOption = (optionText: string) => {
    if (selectedQuizAnswer || !currentDisplayCard) return;
    setSelectedQuizAnswer(optionText);
    setQuizAnsweredCount((prev) => prev + 1);
    if (optionText === currentDisplayCard.meaningVi.trim()) {
      setQuizCorrectCount((prev) => prev + 1);
    }
  };

  const handleNextDeckCard = () => {
    setShowMeaning(false);
    setSelectedQuizAnswer(null);
    if (mode === "lesson" && currentDeckCount > 0 && cardIndex === currentDeckCount - 1 && selectedModuleId) {
      handleFinishLessonCards();
      return;
    }
    if (currentDeckCount > 0) {
      setCardIndex((v) => (v + 1) % currentDeckCount);
      setQuizSeed((s) => s + 1);
    }
  };

  const modeOptions: { value: TabMode; label: string; badge?: number }[] = [
    ...(selectedModuleId ? [{ value: "lesson" as const, label: "Bài học" }] : []),
    { value: "mine" as const, label: "Từ của tôi" },
    {
      value: "sm2" as const,
      label: "Ôn SM-2",
      badge: sm2Topics.length > 0 ? sm2TotalRemaining : sm2DueItems.length,
    },
  ];

  const sm2Cols = isNarrow ? 2 : 4;
  const sm2BtnWidth = gridItemWidth(sm2Cols, 8);

  return (
    <UserScreen>
      <AppHeader
        leftIcon={selectedModuleId ? "chevron-back-outline" : undefined}
        onLeftPress={selectedModuleId ? () => pushRoute(`/user/roadmap?moduleId=${selectedModuleId}`) : undefined}
        rightSlot={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <LiquidIconButton
              accessibilityLabel="Tra từ mạng ngữ nghĩa"
              onPress={() =>
                pushRoute(
                  currentDisplayCard?.word
                    ? `/user/dictionary?mode=lookup&word=${encodeURIComponent(currentDisplayCard.word)}`
                    : "/user/dictionary?mode=lookup",
                )
              }
            >
              <Ionicons color={colors.primaryDark} name="git-network-outline" size={17} />
            </LiquidIconButton>
            <LiquidIconButton
              accessibilityLabel="Chụp ảnh nhận diện đồ vật"
              onPress={() => pushRoute("/user/dictionary?mode=camera")}
            >
              <Ionicons color={colors.primaryDark} name="camera-outline" size={17} />
            </LiquidIconButton>
            <AvatarBadge label={avatarLabel} />
          </View>
        }
        subtitle={undefined}
        title="Flashcards"
      />

      <LiquidSegmentedBar
        onChange={(next) => {
          setMode(next);
          setCardIndex(0);
          setShowMeaning(false);
          setSelectedQuizAnswer(null);
          if (next === "sm2" && sm2AllItems.length === 0 && !sm2Loading) {
            void loadSm2Data();
          }
        }}
        options={modeOptions}
        style={styles.modeSegment}
        value={mode}
      />

      {mode === "mine" ? (
        <View style={styles.topicStripRow}>
          <ScrollView contentContainerStyle={styles.chipRow} horizontal showsHorizontalScrollIndicator={false}>
            <Pressable
              onPress={() => void handleOpenAllCards()}
              style={[styles.topicChip, selectedCollectionId === null ? styles.topicChipActive : null]}
            >
              <Text style={[styles.topicChipText, selectedCollectionId === null ? styles.topicChipTextActive : null]}>
                Tất cả
              </Text>
            </Pressable>
            {collections.map((collection) => {
              const active = selectedCollectionId === collection.id;
              return (
                <Pressable
                  key={collection.id}
                  onPress={async () => {
                    setSelectedCollectionId(collection.id);
                    if (!auth.accessToken) return;
                    const detail = await getFlashcardCollectionDetail(auth.accessToken, collection.id);
                    setMyCards(detail.data?.flashcards ?? []);
                    setCardIndex(0);
                    setShowMeaning(false);
                  }}
                  style={[styles.topicChip, active ? styles.topicChipActive : null]}
                >
                  <Text style={[styles.topicChipText, active ? styles.topicChipTextActive : null]}>
                    {collection.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.mineToolIcons}>
            <LiquidIconButton
              accessibilityLabel="Quản lý chủ đề"
              onPress={() => setShowTopicEditor(true)}
            >
              <Ionicons color={colors.primaryDark} name="folder-open-outline" size={18} />
            </LiquidIconButton>
            <LiquidIconButton
              accessibilityLabel="Thêm thẻ mới"
              onPress={() => setShowAddForm(true)}
              style={{ backgroundColor: colors.primary, borderColor: "rgba(255,255,255,0.6)" }}
            >
              <Ionicons color={colors.onPrimary} name="add" size={20} />
            </LiquidIconButton>
          </View>
        </View>
      ) : mode === "sm2" ? (
        sm2View === "units" ? (
          <View style={styles.sm2BrowseWrap}>
            {/* Level Switcher Row */}
            <ScrollView contentContainerStyle={styles.chipRow} horizontal showsHorizontalScrollIndicator={false}>
              {SM2_LEVEL_TABS.map((lvl) => {
                const count = sm2LevelTotals[lvl.key] ?? 0;
                if (lvl.key !== "ALL" && count === 0) return null;
                const active = selectedSm2Level === lvl.key;
                return (
                  <Pressable
                    key={lvl.key}
                    onPress={() => handleSelectSm2Level(lvl.key)}
                    style={[styles.sm2LevelChip, active ? styles.sm2LevelChipActive : null]}
                  >
                    <Text style={[styles.sm2LevelChipText, active ? styles.sm2LevelChipTextActive : null]}>
                      {lvl.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Compact Search Bar */}
            <View style={styles.sm2SearchCard}>
              <Ionicons color={colors.textMuted} name="search-outline" size={16} />
              <TextInput
                onChangeText={handleSearchSm2Change}
                onSubmitEditing={() => {
                  if (sm2Search.trim().length >= 2) {
                    void handleOpenSm2SearchStudy();
                  }
                }}
                placeholder="Tìm tên chủ đề hoặc gõ từ tiếng Anh..."
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                style={styles.sm2SearchInput}
                value={sm2Search}
              />
              {sm2Search.length > 0 ? (
                <Pressable onPress={() => setSm2Search("")} hitSlop={8}>
                  <Ionicons color={colors.textMuted} name="close-circle" size={17} />
                </Pressable>
              ) : null}
            </View>

            {sm2Search.trim().length >= 2 ? (
              <Pressable onPress={() => void handleOpenSm2SearchStudy()} style={styles.sm2SearchJumpBtn}>
                <Ionicons color={colors.primary} name="flash-outline" size={15} />
                <Text style={styles.sm2SearchJumpText}>
                  Tìm và học thẻ chứa &ldquo;{sm2Search.trim()}&rdquo; trong{" "}
                  {SM2_LEVEL_TABS.find((t) => t.key === selectedSm2Level)?.label ?? selectedSm2Level}
                </Text>
                <Ionicons color={colors.primary} name="arrow-forward" size={15} />
              </Pressable>
            ) : null}

            {/* UNITS LIST Header */}
            <View style={styles.unitsHeaderRow}>
              <Text style={styles.unitsHeaderTitle}>UNITS LIST • CHỦ ĐỀ</Text>
              <Text style={styles.unitsHeaderMeta}>
                {filteredSm2Topics.length} bộ • {(sm2LevelTotals[selectedSm2Level] ?? 0).toLocaleString()} từ
              </Text>
            </View>

            {/* Vertical Units Cards */}
            {sm2Topics.length === 0 && sm2Loading ? (
              <SurfaceCard padding="lg">
                <View style={styles.emptyState}>
                  <ActivityIndicator color={colors.primary} size="large" />
                  <Text style={styles.emptyTitle}>Đang tải danh sách chủ đề...</Text>
                </View>
              </SurfaceCard>
            ) : filteredSm2Topics.length === 0 ? (
              <SurfaceCard padding="lg">
                <View style={styles.emptyState}>
                  <Ionicons color={colors.textMuted} name="folder-open-outline" size={32} />
                  <Text style={styles.emptyTitle}>Không tìm thấy chủ đề phù hợp</Text>
                  <Text style={styles.emptyText}>Thử từ khóa khác hoặc bấm nút tìm từ vựng ở trên.</Text>
                </View>
              </SurfaceCard>
            ) : (
              <View style={styles.unitsListStack}>
                {(selectedSm2Level === "ALL" && !showAllLevelUnits && sm2Search.trim().length === 0
                  ? filteredSm2Topics.slice(0, 45)
                  : filteredSm2Topics
                ).map((topic) => {
                  const { title, subtitle } = parseUnitTitleParts(topic.name);
                  const total = Number(topic.wordCount ?? 0);
                  const studied = Math.min(total, Number(topic.studiedCount ?? 0));
                  const completed = total > 0 && studied >= total;
                  const pct = total > 0 ? Math.min(100, Math.round((studied / total) * 100)) : 0;
                  const visual = getUnitThemeVisual(topic.name, colors.isDark);
                  const isLastOpened = selectedSm2TopicId === topic.id;

                  return (
                    <Pressable
                      key={topic.id}
                      onPress={() => void handleOpenSm2Unit(topic.id)}
                      style={({ pressed }) => [
                        styles.unitCard,
                        isLastOpened ? styles.unitCardSelected : null,
                        pressed ? { opacity: 0.9, transform: [{ scale: 0.992 }] } : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.unitIconCircle,
                          { backgroundColor: visual.bg, borderColor: `${visual.fg}28` },
                        ]}
                      >
                        <Ionicons color={visual.fg} name={visual.icon} size={22} />
                      </View>

                      <View style={styles.unitContent}>
                        <Text numberOfLines={1} style={styles.unitTitle}>
                          {title}
                        </Text>
                        <Text numberOfLines={1} style={styles.unitSubtitle}>
                          {subtitle ? `${subtitle} • ` : ""}
                          {studied}/{total} cards
                        </Text>
                        {studied > 0 ? (
                          <View style={styles.unitMiniTrack}>
                            <View
                              style={[
                                styles.unitMiniFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor: completed ? colors.success : visual.fg,
                                },
                              ]}
                            />
                          </View>
                        ) : null}
                      </View>

                      <View
                        style={[
                          styles.unitStatusPill,
                          completed
                            ? styles.unitStatusPillDone
                            : studied > 0
                              ? styles.unitStatusPillActive
                              : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.unitStatusText,
                            completed
                              ? styles.unitStatusTextDone
                              : studied > 0
                                ? styles.unitStatusTextActive
                                : null,
                          ]}
                        >
                          {completed ? "✓" : studied > 0 ? `${pct}%` : "–"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {selectedSm2Level === "ALL" &&
                !showAllLevelUnits &&
                sm2Search.trim().length === 0 &&
                filteredSm2Topics.length > 45 ? (
                  <Pressable onPress={() => setShowAllLevelUnits(true)} style={styles.showMoreUnitsBtn}>
                    <Text style={styles.showMoreUnitsText}>
                      Hiển thị toàn bộ {filteredSm2Topics.length} chủ đề
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        ) : (
          <SurfaceCard padding="sm" style={styles.sm2StudyHeaderCard}>
            <View style={styles.sm2StudyTopRow}>
              <Pressable onPress={handleBackToUnitsList} style={styles.sm2BackBtn}>
                <Ionicons color={colors.primaryDark} name="chevron-back" size={16} />
                <Text style={styles.sm2BackBtnText}>Chủ đề</Text>
              </Pressable>

              <View style={styles.sm2ScopeSwitchRow}>
                <Pressable
                  onPress={() => {
                    setSm2Scope("due");
                    setCardIndex(0);
                    setShowMeaning(false);
                  }}
                  style={[styles.miniPill, sm2Scope === "due" ? styles.miniPillActive : null]}
                >
                  <Text style={[styles.miniPillText, sm2Scope === "due" ? styles.miniPillTextActive : null]}>
                    Cần ôn ({sm2DueItems.length})
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setSm2Scope("all");
                    setCardIndex(0);
                    setShowMeaning(false);
                  }}
                  style={[styles.miniPill, sm2Scope === "all" ? styles.miniPillActive : null]}
                >
                  <Text style={[styles.miniPillText, sm2Scope === "all" ? styles.miniPillTextActive : null]}>
                    Tất cả ({sm2AllItems.length})
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sm2StudyTitleRow}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.sm2StudyTitle}>
                  {activeSearchQuery
                    ? `Kết quả: "${activeSearchQuery}"`
                    : activeSm2Topic
                      ? parseUnitTitleParts(activeSm2Topic.name).title
                      : "Bộ từ SM-2"}
                </Text>
                {activeSm2Topic && !activeSearchQuery ? (
                  <Text numberOfLines={1} style={styles.sm2StudySub}>
                    {parseUnitTitleParts(activeSm2Topic.name).subtitle ?? activeSm2Topic.level ?? "Vocabulary"} •{" "}
                    {Math.min(activeSm2Topic.wordCount, Number(activeSm2Topic.studiedCount ?? 0))}/
                    {activeSm2Topic.wordCount} đã ôn
                  </Text>
                ) : null}
              </View>
              {sm2Feedback ? (
                <Text numberOfLines={1} style={styles.sm2FeedbackPill}>
                  {sm2Feedback}
                </Text>
              ) : null}
            </View>
          </SurfaceCard>
        )
      ) : null}

      {mode !== "sm2" || sm2View === "study" ? (
        <>

      <View style={styles.studyControlsRow}>
        <View style={styles.viewModeGroup}>
          <Pressable
            onPress={() => {
              setStudyView("flip");
              setSelectedQuizAnswer(null);
            }}
            style={[styles.miniPill, studyView === "flip" ? styles.miniPillActive : null]}
          >
            <Text style={[styles.miniPillText, studyView === "flip" ? styles.miniPillTextActive : null]}>
              Lật thẻ
            </Text>
          </Pressable>
          <Pressable
            disabled={currentDeckCount < 2}
            onPress={() => {
              setStudyView("quiz");
              setShowMeaning(false);
              setSelectedQuizAnswer(null);
            }}
            style={[
              styles.miniPill,
              studyView === "quiz" ? styles.miniPillActive : null,
              currentDeckCount < 2 ? { opacity: 0.45 } : null,
            ]}
          >
            <Text style={[styles.miniPillText, studyView === "quiz" ? styles.miniPillTextActive : null]}>
              Mini-Quiz
            </Text>
          </Pressable>
        </View>

        <View style={styles.rightControlsCluster}>
          <Pressable
            onPress={() => setShowVoiceSettings((v) => !v)}
            style={[styles.miniPill, showVoiceSettings ? styles.miniPillActive : null]}
          >
            <Ionicons
              color={showVoiceSettings ? colors.onPrimary : colors.primaryDark}
              name="options-outline"
              size={14}
            />
            <Text style={[styles.miniPillText, showVoiceSettings ? styles.miniPillTextActive : null]}>
              {voiceRegion} {rate.toFixed(1)}x
            </Text>
          </Pressable>

          <View style={styles.counterBadge}>
            <Text style={styles.counterBadgeText}>
              {currentDeckCount ? `${(cardIndex % currentDeckCount) + 1}/${currentDeckCount}` : "0/0"}
            </Text>
          </View>
        </View>
      </View>

      {showVoiceSettings ? (
        <SurfaceCard padding="sm" style={styles.voicePanel}>
          <View style={styles.voicePanelRow}>
            <Text style={styles.voiceLabel}>Nguồn:</Text>
            <Pressable
              onPress={() => setVoiceEngine("speechify")}
              style={[styles.miniPill, voiceEngine === "speechify" ? styles.miniPillActive : null]}
            >
              <Text
                style={[
                  styles.miniPillText,
                  voiceEngine === "speechify" ? styles.miniPillTextActive : null,
                ]}
              >
                Speechify AI
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setVoiceEngine("device")}
              style={[styles.miniPill, voiceEngine === "device" ? styles.miniPillActive : null]}
            >
              <Text
                style={[
                  styles.miniPillText,
                  voiceEngine === "device" ? styles.miniPillTextActive : null,
                ]}
              >
                Thiết bị
              </Text>
            </Pressable>
            <Text style={styles.voiceStatus}>
              {isSpeaking
                ? "Đang phát..."
                : voiceEngine === "speechify" && speechifyConfigured
                  ? "Đã kết nối"
                  : voiceEngine === "speechify"
                    ? "Fallback máy"
                    : "Giọng máy"}
            </Text>
          </View>

          <View style={[styles.voicePanelRow, { marginTop: 8 }]}>
            <Text style={styles.voiceLabel}>Giọng:</Text>
            {(["US", "UK"] as const).map((region) => (
              <Pressable
                key={region}
                onPress={() => setVoiceRegion(region)}
                style={[styles.miniPill, voiceRegion === region ? styles.miniPillActive : null]}
              >
                <Text style={[styles.miniPillText, voiceRegion === region ? styles.miniPillTextActive : null]}>
                  {region}
                </Text>
              </Pressable>
            ))}

            <Text style={[styles.voiceLabel, { marginLeft: 8 }]}>Tốc độ:</Text>
            <Pressable
              onPress={() => setRate((r) => Math.max(0.6, Number((r - 0.1).toFixed(1))))}
              style={styles.stepBtn}
            >
              <Text style={styles.stepBtnText}>-</Text>
            </Pressable>
            <Text style={styles.voiceVal}>{rate.toFixed(1)}x</Text>
            <Pressable
              onPress={() => setRate((r) => Math.min(1.5, Number((r + 0.1).toFixed(1))))}
              style={styles.stepBtn}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>

          {voiceEngine === "speechify" && regionSpeechifyVoices.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.voiceChipStrip}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Pressable
                onPress={() => setSelectedVoiceId(null)}
                style={[styles.miniPill, !selectedVoiceId ? styles.miniPillActive : null]}
              >
                <Text style={[styles.miniPillText, !selectedVoiceId ? styles.miniPillTextActive : null]}>
                  Tự động ({voiceRegion})
                </Text>
              </Pressable>
              {regionSpeechifyVoices.map((voice) => {
                const active = selectedVoiceId === voice.id;
                return (
                  <Pressable
                    key={voice.id}
                    onPress={() => setSelectedVoiceId(voice.id)}
                    style={[styles.miniPill, active ? styles.miniPillActive : null]}
                  >
                    <Text style={[styles.miniPillText, active ? styles.miniPillTextActive : null]}>
                      {voice.displayName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={[styles.voicePanelRow, { marginTop: 6 }]}>
              <Text style={styles.voiceLabel}>Cao độ:</Text>
              <Pressable
                onPress={() => setPitch((p) => Math.max(0.7, Number((p - 0.1).toFixed(1))))}
                style={styles.stepBtn}
              >
                <Text style={styles.stepBtnText}>-</Text>
              </Pressable>
              <Text style={styles.voiceVal}>{pitch.toFixed(1)}</Text>
              <Pressable
                onPress={() => setPitch((p) => Math.min(1.4, Number((p + 0.1).toFixed(1))))}
                style={styles.stepBtn}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          )}
        </SurfaceCard>
      ) : null}

      <View style={styles.progressStrip}>
        <ProgressBar
          accentColor={colors.primary}
          label={studyView === "quiz" ? `Quiz đúng ${quizCorrectCount}/${quizAnsweredCount}` : undefined}
          value={progressValue}
        />
      </View>

      <Pressable
        disabled={currentDeckCount === 0 || studyView === "quiz"}
        onPress={() => setShowMeaning((v) => !v)}
      >
        <LiquidCard style={[styles.flashcard, { minHeight: isShort ? 260 : 300 }]}>
          {loading || sm2Loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.emptyTitle}>Đang chuẩn bị bộ thẻ...</Text>
            </View>
          ) : currentDisplayCard ? (
            <>
              <View style={styles.flashcardTop}>
                <View style={styles.cardBadge}>
                  <Text style={styles.cardBadgeText}>
                    {mode === "lesson"
                      ? "Bài học"
                      : mode === "sm2"
                        ? [
                            `SM-2${currentDisplayCard.sm2?.intervalDays ? ` ${currentDisplayCard.sm2.intervalDays}d` : ""}`,
                            currentDisplayCard.sm2?.partOfSpeech,
                            currentDisplayCard.sm2?.difficultyLevel,
                          ]
                            .filter(Boolean)
                            .join(" • ")
                        : "Từ của tôi"}
                  </Text>
                </View>

                <Pressable
                  hitSlop={8}
                  onPress={() => void speakText(currentDisplayCard.word)}
                  style={styles.listenBtn}
                >
                  <Ionicons color={colors.onPrimary} name={isSpeaking ? "volume-high" : "volume-medium"} size={18} />
                  <Text style={styles.listenBtnText}>
                    {voiceEngine === "speechify" && speechifyConfigured ? `AI ${voiceRegion}` : voiceRegion}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.wordCenterStage}>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  numberOfLines={2}
                  style={[styles.word, { fontSize: rf(isNarrow ? 28 : 34) }]}
                >
                  {currentDisplayCard.word}
                </Text>
                {currentDisplayCard.pronunciation ? (
                  <Text style={[styles.pronunciation, { fontSize: rf(15) }]}>
                    {currentDisplayCard.pronunciation}
                  </Text>
                ) : null}
              </View>

              {studyView === "quiz" ? (
                <View style={styles.quizBox}>
                  <Text style={styles.quizHint}>Chọn nghĩa đúng:</Text>
                  <View style={styles.quizOptionsCol}>
                    {quizOptions.map((opt) => {
                      const isPicked = selectedQuizAnswer === opt;
                      const isCorrectOpt = opt === currentDisplayCard.meaningVi.trim();
                      const showOutcome = Boolean(selectedQuizAnswer);
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => handleSelectQuizOption(opt)}
                          style={[
                            styles.quizOptionBtn,
                            showOutcome && isCorrectOpt ? styles.quizOptionCorrect : null,
                            showOutcome && isPicked && !isCorrectOpt ? styles.quizOptionWrong : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.quizOptionText,
                              showOutcome && isCorrectOpt ? styles.quizOptionTextCorrect : null,
                              showOutcome && isPicked && !isCorrectOpt ? styles.quizOptionTextWrong : null,
                            ]}
                          >
                            {opt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : showMeaning ? (
                <View style={styles.meaningBox}>
                  <Text style={[styles.meaningText, { fontSize: rf(20) }]}>
                    {currentDisplayCard.meaningVi}
                  </Text>
                  {currentDisplayCard.meaningEn ? (
                    <Text style={styles.subMeaning}>{currentDisplayCard.meaningEn}</Text>
                  ) : null}
                  {currentDisplayCard.exampleSentence ? (
                    <View style={styles.exampleBoxRow}>
                      <Text style={[styles.exampleText, { flex: 1, marginTop: 0 }]}>
                        “{currentDisplayCard.exampleSentence}”
                      </Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => void speakText(currentDisplayCard.exampleSentence || "")}
                        style={styles.exampleListenPill}
                      >
                        <Ionicons color={colors.primary} name="volume-high-outline" size={14} />
                        <Text style={styles.exampleListenText}>Nghe</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {currentDisplayCard.exampleTranslation ? (
                    <Text style={styles.exampleTrans}>{currentDisplayCard.exampleTranslation}</Text>
                  ) : null}
                </View>
              ) : (
                <View style={styles.tapPromptBox}>
                  <Ionicons color={colors.primary} name="hand-left-outline" size={15} />
                  <Text style={styles.tapPromptText}>Chạm để lật</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons color={colors.primary} name="albums-outline" size={34} />
              <Text style={styles.emptyTitle}>Chưa có flashcard nào</Text>
              <Text style={styles.emptyText}>
                {mode === "sm2"
                  ? "Bạn đã ôn hết thẻ cần nhớ hôm nay! Chuyển sang 'Tất cả' để ôn thêm."
                  : "Bấm nút + phía trên để thêm từ vựng đầu tiên."}
              </Text>
            </View>
          )}
        </LiquidCard>
      </Pressable>

      {mode === "sm2" && currentDisplayCard?.sm2 ? (
        <View style={styles.sm2Grid}>
          {SM2_RATING_OPTIONS.map((item) => {
            const tone = getSm2RatingTone(item.rating, colors);
            return (
              <Pressable
                key={item.rating}
                disabled={working}
                onPress={() => void handleRateSm2(item.rating)}
                style={[
                  styles.sm2Btn,
                  {
                    backgroundColor: tone.bg,
                    borderColor: tone.border,
                    width: sm2BtnWidth,
                  },
                ]}
              >
                <Text style={[styles.sm2BtnLabel, { color: tone.text }]}>{item.label}</Text>
                <Text numberOfLines={1} style={styles.sm2BtnHint}>
                  {item.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.bottomDock}>
        <LiquidButton
          compact
          disabled={currentDeckCount === 0}
          label="Trước"
          onPress={() => {
            setShowMeaning(false);
            setSelectedQuizAnswer(null);
            setCardIndex((v) => (v - 1 + currentDeckCount) % currentDeckCount);
          }}
          style={{ flex: 1 }}
          variant="glass"
        />

        <LiquidButton
          compact
          disabled={currentDeckCount === 0}
          label={
            mode === "lesson" && cardIndex === currentDeckCount - 1 && currentDeckCount > 0
              ? "Hoàn thành"
              : "Tiếp theo"
          }
          onPress={handleNextDeckCard}
          style={{ flex: 1.3 }}
          variant="primary"
        />

        {mode === "mine" ? (
          <LiquidIconButton
            accessibilityLabel="Xóa thẻ hiện tại"
            onPress={() => {
              if (!working && currentCard) void handleDeleteCurrentCard();
            }}
            style={working || !currentCard ? { opacity: 0.45 } : undefined}
          >
            <Ionicons color={colors.danger} name="trash-outline" size={18} />
          </LiquidIconButton>
        ) : null}
      </View>
        </>
      ) : null}

      <Modal animationType="fade" onRequestClose={() => setShowTopicEditor(false)} transparent visible={showTopicEditor}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modalBackdrop, { padding: screenPadding }]}
        >
          <LiquidCard style={[styles.modalCard, { maxHeight: Math.round(height * 0.8) }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Quản lý chủ đề</Text>
                <LiquidIconButton onPress={() => setShowTopicEditor(false)}>
                  <Ionicons color={colors.text} name="close" size={18} />
                </LiquidIconButton>
              </View>

              <TextInput
                onChangeText={setNewCollectionName}
                placeholder="Tên chủ đề mới"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={newCollectionName}
              />
              <TextInput
                onChangeText={setNewCollectionDescription}
                placeholder="Mô tả ngắn (tùy chọn)"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={newCollectionDescription}
              />

              <View style={styles.modalActionsRow}>
                {selectedCollectionId ? (
                  <LiquidButton
                    compact
                    disabled={working}
                    label="Xóa chủ đề"
                    onPress={handleDeleteCollection}
                    style={{ flex: 1 }}
                    variant="glass"
                  />
                ) : null}
                <LiquidButton
                  compact
                  disabled={working}
                  label="Tạo chủ đề"
                  loading={working}
                  onPress={handleCreateCollection}
                  style={{ flex: 1 }}
                  variant="primary"
                />
              </View>
            </ScrollView>
          </LiquidCard>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setShowAddForm(false)} transparent visible={showAddForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.modalBackdrop, { padding: screenPadding }]}
        >
          <LiquidCard style={[styles.modalCard, { maxHeight: Math.round(height * 0.85) }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Thêm flashcard mới</Text>
                <LiquidIconButton onPress={() => setShowAddForm(false)}>
                  <Ionicons color={colors.text} name="close" size={18} />
                </LiquidIconButton>
              </View>

              <LiquidSegmentedBar
                onChange={setAddMode}
                options={[
                  { value: "manual", label: "Nhập tay" },
                  { value: "bulk", label: "Import JSON" },
                ]}
                style={{ marginBottom: 10 }}
                value={addMode}
              />

              {addMode === "manual" ? (
                <>
                  <TextInput
                    onChangeText={setManualWord}
                    placeholder="Từ tiếng Anh *"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    value={manualWord}
                  />
                  <TextInput
                    onChangeText={setManualMeaning}
                    placeholder="Nghĩa tiếng Việt *"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    value={manualMeaning}
                  />
                  <TextInput
                    onChangeText={setManualExample}
                    placeholder="Câu ví dụ"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    value={manualExample}
                  />
                  <TextInput
                    onChangeText={setManualPronunciation}
                    placeholder="Phiên âm IPA"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    value={manualPronunciation}
                  />
                  <LiquidButton
                    compact
                    disabled={working}
                    label={working ? "Đang lưu..." : "Thêm flashcard"}
                    loading={working}
                    onPress={handleManualAdd}
                    style={{ marginTop: 14 }}
                    variant="primary"
                  />
                </>
              ) : (
                <>
                  <TextInput
                    multiline
                    onChangeText={setBulkJson}
                    placeholder="Dán JSON vào đây"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, styles.jsonInput]}
                    textAlignVertical="top"
                    value={bulkJson}
                  />
                  <LiquidButton
                    compact
                    disabled={working}
                    label={working ? "Đang import..." : "Thêm từ JSON"}
                    loading={working}
                    onPress={handleBulkAdd}
                    style={{ marginTop: 14 }}
                    variant="primary"
                  />
                </>
              )}
            </ScrollView>
          </LiquidCard>
        </KeyboardAvoidingView>
      </Modal>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    modeSegment: {
      marginBottom: 12,
    },
    topicStripRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    chipRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      paddingRight: 4,
    },
    topicChip: {
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1.25,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    topicChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    topicChipText: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "800",
    },
    topicChipTextActive: {
      color: colors.onPrimary,
    },
    mineToolIcons: {
      flexDirection: "row",
      gap: 6,
    },
    sm2BrowseWrap: {
      gap: 10,
      marginBottom: 18,
    },
    sm2LevelChip: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    sm2LevelChipActive: {
      backgroundColor: colors.primaryDark,
      borderColor: colors.primaryDark,
    },
    sm2LevelChipText: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "900",
    },
    sm2LevelChipTextActive: {
      color: colors.onPrimary,
    },
    sm2SearchCard: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 16,
      borderWidth: 1.25,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 13,
      paddingVertical: 8,
    },
    sm2SearchInput: {
      color: colors.text,
      flex: 1,
      fontSize: 13.5,
      paddingVertical: 2,
    },
    sm2SearchJumpBtn: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    sm2SearchJumpText: {
      color: colors.primaryDark,
      flex: 1,
      fontSize: 12.5,
      fontWeight: "800",
    },
    unitsHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 2,
      paddingHorizontal: 2,
    },
    unitsHeaderTitle: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    unitsHeaderMeta: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "700",
    },
    unitsListStack: {
      gap: 10,
    },
    unitCard: {
      alignItems: "center",
      backgroundColor: colors.isDark ? colors.glassFillStrong : "#FFFFFF",
      borderColor: colors.glassBorder,
      borderRadius: 18,
      borderWidth: 1.25,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 13,
      paddingVertical: 11,
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.isDark ? 0.2 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    unitCardSelected: {
      borderColor: colors.primary,
    },
    unitIconCircle: {
      alignItems: "center",
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    unitContent: {
      flex: 1,
      gap: 2,
    },
    unitTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "800",
    },
    unitSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    unitMiniTrack: {
      backgroundColor: colors.isDark ? "rgba(255,255,255,0.12)" : "#E2E8F0",
      borderRadius: 99,
      height: 4,
      marginTop: 4,
      overflow: "hidden",
      width: "100%",
    },
    unitMiniFill: {
      borderRadius: 99,
      height: 4,
    },
    unitStatusPill: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(255,255,255,0.08)" : "#F1F5F9",
      borderRadius: 10,
      justifyContent: "center",
      minWidth: 42,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    unitStatusPillActive: {
      backgroundColor: colors.primarySoft,
    },
    unitStatusPillDone: {
      backgroundColor: colors.isDark ? "rgba(16,185,129,0.22)" : "#DCFCE7",
    },
    unitStatusText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
    },
    unitStatusTextActive: {
      color: colors.primaryDark,
    },
    unitStatusTextDone: {
      color: colors.success,
    },
    showMoreUnitsBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 11,
    },
    showMoreUnitsText: {
      color: colors.primaryDark,
      fontSize: 13,
      fontWeight: "800",
    },
    sm2StudyHeaderCard: {
      gap: 8,
      marginBottom: 10,
    },
    sm2StudyTopRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    sm2BackBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 3,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    sm2BackBtnText: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "900",
    },
    sm2ScopeSwitchRow: {
      flexDirection: "row",
      gap: 6,
    },
    sm2StudyTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    sm2StudyTitle: {
      color: colors.text,
      fontSize: 14.5,
      fontWeight: "900",
    },
    sm2StudySub: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "600",
      marginTop: 1,
    },
    sm2FeedbackPill: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
      textAlign: "right",
    },
    studyControlsRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
      marginBottom: 8,
    },
    viewModeGroup: {
      flexDirection: "row",
      gap: 6,
    },
    rightControlsCluster: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    miniPill: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    miniPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    miniPillText: {
      color: colors.text,
      fontSize: 11.5,
      fontWeight: "800",
    },
    miniPillTextActive: {
      color: colors.onPrimary,
    },
    counterBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    counterBadgeText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "900",
    },
    voicePanel: {
      marginBottom: 10,
    },
    voicePanelRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    voiceLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
    },
    voiceVal: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "900",
      minWidth: 28,
      textAlign: "center",
    },
    voiceStatus: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
      marginLeft: "auto",
    },
    voiceChipStrip: {
      flexDirection: "row",
      gap: 6,
      marginTop: 8,
      paddingRight: 6,
    },
    exampleBoxRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    exampleListenPill: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    exampleListenText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
    },
    stepBtn: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 99,
      borderWidth: 1,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    stepBtnText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "900",
    },
    progressStrip: {
      marginBottom: 12,
    },
    flashcard: {
      justifyContent: "space-between",
    },
    flashcardTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cardBadge: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    cardBadgeText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
    },
    listenBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    listenBtnText: {
      color: colors.onPrimary,
      fontSize: 11.5,
      fontWeight: "900",
    },
    wordCenterStage: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 20,
    },
    word: {
      color: colors.text,
      fontWeight: "900",
      textAlign: "center",
    },
    pronunciation: {
      color: colors.primary,
      fontWeight: "700",
      marginTop: 6,
      textAlign: "center",
    },
    tapPromptBox: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      paddingVertical: 14,
    },
    tapPromptText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "700",
    },
    meaningBox: {
      backgroundColor: colors.isDark ? colors.glassFill : "#F8F7FF",
      borderColor: colors.glassBorder,
      borderRadius: 18,
      borderWidth: 1,
      padding: 15,
    },
    meaningText: {
      color: colors.primaryDark,
      fontWeight: "900",
    },
    subMeaning: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 4,
    },
    exampleText: {
      color: colors.primary,
      fontSize: 13.5,
      fontStyle: "italic",
      lineHeight: 19,
      marginTop: 8,
    },
    exampleTrans: {
      color: colors.textMuted,
      fontSize: 12.5,
      marginTop: 3,
    },
    quizBox: {
      gap: 8,
    },
    quizHint: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
    },
    quizOptionsCol: {
      gap: 8,
    },
    quizOptionBtn: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    quizOptionCorrect: {
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.22)" : "#E6F6F1",
      borderColor: colors.success,
    },
    quizOptionWrong: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.22)" : "#FCECEB",
      borderColor: colors.danger,
    },
    quizOptionText: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: "700",
    },
    quizOptionTextCorrect: {
      color: colors.success,
      fontWeight: "900",
    },
    quizOptionTextWrong: {
      color: colors.danger,
      fontWeight: "900",
    },
    emptyState: {
      alignItems: "center",
      gap: 8,
      justifyContent: "center",
      paddingVertical: 48,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "900",
      textAlign: "center",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    sm2Grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    sm2Btn: {
      alignItems: "center",
      borderRadius: 16,
      borderWidth: 1.25,
      elevation: Platform.OS === "android" ? 2 : 0,
      paddingHorizontal: 6,
      paddingVertical: 10,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
    },
    sm2BtnLabel: {
      fontSize: 13,
      fontWeight: "900",
    },
    sm2BtnHint: {
      color: colors.textMuted,
      fontSize: 10.5,
      marginTop: 2,
      textAlign: "center",
    },
    bottomDock: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(9, 16, 32, 0.48)",
      flex: 1,
      justifyContent: "center",
    },
    modalCard: {
      maxWidth: 440,
      width: "100%",
    },
    modalHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
    },
    input: {
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: 14,
      borderWidth: 1.25,
      color: colors.text,
      fontSize: 14,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    jsonInput: {
      minHeight: 160,
    },
    modalActionsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
  });
