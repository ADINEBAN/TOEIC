import { Platform } from "react-native";

import { API_BASE_URL } from "@/src/config/env";
import { apiRequest } from "@/src/services/api.client";
import { ApiResponse } from "@/src/types/auth";
import {
  AdaptiveRecommendationData,
  ArenaLeaderboardResponse,
  ArenaMatchmakingStatusResponse,
  ArenaMode,
  ArenaRoomListResponse,
  ArenaRoomResponse,
  FlashcardCollectionListResponse,
  FlashcardCollectionResponse,
  FlashcardResponse,
  FlashcardsResponse,
  ImportedDocumentApiResponse,
  ImportedDocumentListApiResponse,
  ImportedVideoApiResponse,
  ImportedVideoListApiResponse,
  LearningPathListResponse,
  PlacementEvaluationData,
  PlacementQuickTestData,
  UserLearningPathCatalogListResponse,
  LessonProgressUpdateResponse,
  MistakeListResponse,
  ModuleUnlockResponse,
  QuestionExplainApiResponse,
  Sm2Rating,
  TtsSynthesizeResponse,
  TtsVoicesResponse,
  UserTestDetailResponse,
  UserTestListResponse,
  VideoBookmarkApiResponse,
  VideoJobApiResponse,
  YoutubeWordLookupApiResponse,
  UserLessonsResponse,
  UserModuleContentResponse,
  UserLearningPathAssignmentResponse,
  UserProfileResponse,
  UserRoadmapResponse,
  UserGrammarListResponse,
  UserGrammarDetailResponse,
  UserFavoriteGrammarTitleListResponse,
  UserStreakResponse,
  VideoNoteDetailResponse,
  VideoNoteListResponse,
  VocabularyStudyDetailResponse,
  VocabularyStudyListResponse,
  VocabularyTopicListResponse,
  DictionarySuggestApiResponse,
  DictionaryHistoryApiResponse,
  DictionaryHistoryDeleteApiResponse,
  SemanticDictionaryApiResponse,
  ImageObjectRecognitionApiResponse,
  WeeklyLeaderboardApiResponse,
  CosmeticShopApiResponse,
  ProfileInsightsApiResponse,
  ChatMessageListApiResponse,
  ChatMessageSingleApiResponse,
  ChatFriendsApiResponse,
  ChatSearchUsersApiResponse,
} from "@/src/types/user-api";

function buildAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getMyProfile(accessToken: string) {
  return apiRequest<UserProfileResponse>("/api/users/me", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getMyStreak(accessToken: string) {
  return apiRequest<UserStreakResponse>("/api/users/me/streak", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getLearningPaths(accessToken: string) {
  return apiRequest<LearningPathListResponse>("/api/admin/learning-paths", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getUserLearningPathCatalog(accessToken: string) {
  return apiRequest<UserLearningPathCatalogListResponse>("/api/users/learning/paths", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function updateMyTargetScore(accessToken: string, targetScore: number) {
  return apiRequest<UserProfileResponse>("/api/users/me/target-score", {
    body: JSON.stringify({ targetScore }),
    headers: buildAuthHeaders(accessToken),
    method: "PUT",
  });
}

export function getMyFlashcards(accessToken: string) {
  return apiRequest<FlashcardsResponse>("/api/users/flashcards/mine", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function assignRecommendedPath(
  accessToken: string,
  payload?: {
    learningPathId?: number;
    targetScore?: number;
  },
) {
  return apiRequest<UserLearningPathAssignmentResponse>(
    "/api/placement-onboarding/assign-path",
    {
      body: payload ? JSON.stringify(payload) : undefined,
      headers: buildAuthHeaders(accessToken),
      method: "POST",
    },
  );
}

export function getPlacementQuickTest(accessToken: string) {
  return apiRequest<ApiResponse<PlacementQuickTestData>>(
    "/api/placement-onboarding/quick-test",
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function evaluatePlacementQuickTest(
  accessToken: string,
  payload: {
    answers: { questionKey: string; selectedLabel: string }[];
    targetScore?: number;
  },
) {
  return apiRequest<ApiResponse<PlacementEvaluationData>>(
    "/api/placement-onboarding/evaluate-test",
    {
      body: JSON.stringify(payload),
      headers: buildAuthHeaders(accessToken),
      method: "POST",
    },
  );
}

export function getAdaptiveRecommendations(accessToken: string) {
  return apiRequest<ApiResponse<AdaptiveRecommendationData>>(
    "/api/users/learning/recommendations",
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function getUserLessons(accessToken: string, moduleId?: number) {
  const path =
    typeof moduleId === "number"
      ? `/api/users/lessons?moduleId=${moduleId}`
      : "/api/users/lessons";

  return apiRequest<UserLessonsResponse>(path, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getUserRoadmap(accessToken: string) {
  return apiRequest<UserRoadmapResponse>("/api/users/learning/roadmap", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getUserModuleContent(accessToken: string, moduleId: number) {
  return apiRequest<UserModuleContentResponse>(
    `/api/users/learning/modules/${moduleId}/content`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function getUserGrammars(accessToken: string) {
  return apiRequest<UserGrammarListResponse>("/api/users/grammars", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getUserGrammarDetail(accessToken: string, grammarId: number) {
  return apiRequest<UserGrammarDetailResponse>(`/api/users/grammars/${grammarId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function addUserGrammarFavorite(accessToken: string, grammarId: number) {
  return apiRequest(`/api/users/grammars/${grammarId}/favorite`, {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function removeUserGrammarFavorite(accessToken: string, grammarId: number) {
  return apiRequest(`/api/users/grammars/${grammarId}/favorite`, {
    headers: buildAuthHeaders(accessToken),
    method: "DELETE",
  });
}

export function getUserFavoriteGrammars(accessToken: string) {
  return apiRequest<UserGrammarListResponse>("/api/users/grammars/favorites/list", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getUserFavoriteGrammarTitles(accessToken: string) {
  return apiRequest<UserFavoriteGrammarTitleListResponse>("/api/users/grammars/favorites/titles", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function updateLessonProgress(
  accessToken: string,
  lessonId: number,
  payload: {
    lastPositionSeconds?: number;
    watchedSeconds?: number;
    completionPercent?: number;
    status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  },
) {
  return apiRequest<LessonProgressUpdateResponse>(
    `/api/users/lessons/${lessonId}/progress`,
    {
      body: JSON.stringify(payload),
      headers: buildAuthHeaders(accessToken),
      method: "POST",
    },
  );
}

export function completeOrUnlockNextModule(
  accessToken: string,
  moduleId: number,
  forceComplete = false,
) {
  return apiRequest<ModuleUnlockResponse>(
    `/api/users/learning/modules/${moduleId}/complete-or-unlock-next`,
    {
      body: JSON.stringify({ forceComplete }),
      headers: buildAuthHeaders(accessToken),
      method: "POST",
    },
  );
}

export function createMyFlashcard(
  accessToken: string,
  payload: {
    englishWord: string;
    meaningVi: string;
    exampleSentence?: string;
    pronunciation?: string;
  },
) {
  return apiRequest<FlashcardResponse>("/api/users/flashcards", {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function updateMyFlashcard(
  accessToken: string,
  flashcardId: number,
  payload: {
    englishWord?: string;
    meaningVi?: string;
    exampleSentence?: string;
    pronunciation?: string;
    flashcardCollectionId?: number;
  },
) {
  return apiRequest<FlashcardResponse>("/api/users/flashcards/" + flashcardId, {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "PUT",
  });
}

export function deleteMyFlashcard(accessToken: string, flashcardId: number) {
  return apiRequest("/api/users/flashcards/" + flashcardId, {
    headers: buildAuthHeaders(accessToken),
    method: "DELETE",
  });
}

export function getModuleFlashcardsForUser(
  accessToken: string,
  moduleId: number,
  keyword?: string,
) {
  const suffix =
    keyword && keyword.trim().length > 0
      ? `?keyword=${encodeURIComponent(keyword.trim())}`
      : "";
  return apiRequest<FlashcardsResponse>(
    `/api/users/flashcards/modules/${moduleId}${suffix}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function createFlashcardCollection(
  accessToken: string,
  payload: { name: string; description?: string },
) {
  return apiRequest<FlashcardCollectionResponse>(
    "/api/users/flashcards/collections",
    {
      body: JSON.stringify(payload),
      headers: buildAuthHeaders(accessToken),
      method: "POST",
    },
  );
}

export function getMyFlashcardCollections(accessToken: string) {
  return apiRequest<FlashcardCollectionListResponse>(
    "/api/users/flashcards/collections",
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function getFlashcardCollectionDetail(
  accessToken: string,
  collectionId: number,
) {
  return apiRequest<FlashcardCollectionResponse>(
    `/api/users/flashcards/collections/${collectionId}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function updateFlashcardCollection(
  accessToken: string,
  collectionId: number,
  payload: { name?: string; description?: string },
) {
  return apiRequest<FlashcardCollectionResponse>(
    `/api/users/flashcards/collections/${collectionId}`,
    {
      body: JSON.stringify(payload),
      headers: buildAuthHeaders(accessToken),
      method: "PUT",
    },
  );
}

export function deleteFlashcardCollection(
  accessToken: string,
  collectionId: number,
) {
  return apiRequest(`/api/users/flashcards/collections/${collectionId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "DELETE",
  });
}

export function updateMyProfile(
  accessToken: string,
  payload: {
    fullName?: string;
    username?: string;
    bio?: string;
    avatarUrl?: string;
    currentLevel?: string;
    targetScore?: number;
  },
) {
  return apiRequest<UserProfileResponse>("/api/users/me/profile", {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "PUT",
  });
}

export function getLessonNotes(accessToken: string, lessonId: number) {
  return apiRequest<VideoNoteListResponse>(`/api/users/lessons/${lessonId}/notes`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getMyVideoNotes(accessToken: string) {
  return apiRequest<VideoNoteListResponse>("/api/users/lessons/notes/mine", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function createLessonNote(
  accessToken: string,
  lessonId: number,
  payload: { timestampSeconds: number; noteText: string },
) {
  return apiRequest<VideoNoteDetailResponse>(`/api/users/lessons/${lessonId}/notes`, {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function deleteVideoNote(accessToken: string, noteId: number) {
  return apiRequest(`/api/users/lessons/notes/${noteId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "DELETE",
  });
}

export function getMyMistakes(accessToken: string) {
  return apiRequest<MistakeListResponse>("/api/users/mistakes", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function explainMistakeQuestion(
  accessToken: string,
  payload: { questionId: number; selectedAnswer: string; type?: "EXPLANATION" | "TIPS" | "BOTH" },
) {
  return apiRequest<QuestionExplainApiResponse>("/api/users/mistakes/explain", {
    body: JSON.stringify({
      questionId: payload.questionId,
      selectedAnswer: payload.selectedAnswer,
      type: payload.type ?? "BOTH",
    }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getVocabularyTopics(accessToken: string) {
  return apiRequest<VocabularyTopicListResponse>("/api/users/vocabularies/topics", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export type VocabularyQueryOptions = {
  topicId?: number | null;
  level?: string | null;
  q?: string | null;
  limit?: number | null;
};

function buildVocabularyQueryString(input?: number | VocabularyQueryOptions) {
  const opts: VocabularyQueryOptions =
    typeof input === "number" ? { topicId: input } : input ?? {};
  const parts: string[] = [];
  if (typeof opts.topicId === "number") {
    parts.push(`topicId=${encodeURIComponent(String(opts.topicId))}`);
  }
  if (opts.level && opts.level.trim()) {
    parts.push(`level=${encodeURIComponent(opts.level.trim())}`);
  }
  if (opts.q && opts.q.trim()) {
    parts.push(`q=${encodeURIComponent(opts.q.trim())}`);
  }
  if (typeof opts.limit === "number" && opts.limit > 0) {
    parts.push(`limit=${encodeURIComponent(String(opts.limit))}`);
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function getDueVocabularies(
  accessToken: string,
  topicIdOrOptions?: number | VocabularyQueryOptions,
) {
  const q = buildVocabularyQueryString(topicIdOrOptions);
  return apiRequest<VocabularyStudyListResponse>(`/api/users/vocabularies/due-today${q}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getAllVocabularies(
  accessToken: string,
  topicIdOrOptions?: number | VocabularyQueryOptions,
) {
  const q = buildVocabularyQueryString(topicIdOrOptions);
  return apiRequest<VocabularyStudyListResponse>(`/api/users/vocabularies/all${q}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function reviewVocabularyWord(
  accessToken: string,
  vocabularyId: number,
  rating: Sm2Rating,
) {
  return apiRequest<VocabularyStudyDetailResponse>(`/api/users/vocabularies/${vocabularyId}/review`, {
    body: JSON.stringify({ rating }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function listArenaRooms(accessToken: string) {
  return apiRequest<ArenaRoomListResponse>("/api/users/arena/rooms", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function createArenaRoom(
  accessToken: string,
  payload:
    | number
    | {
        questionCount?: number;
        mode?: ArenaMode;
        isPrivate?: boolean;
        password?: string;
        maxPlayers?: number;
      } = 10,
) {
  const body = typeof payload === "number" ? { questionCount: payload } : payload;
  return apiRequest<ArenaRoomResponse>("/api/users/arena/rooms", {
    body: JSON.stringify(body),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function joinArenaRoom(accessToken: string, roomCode: string, password?: string) {
  return apiRequest<ArenaRoomResponse>(`/api/users/arena/rooms/${encodeURIComponent(roomCode)}/join`, {
    body: JSON.stringify(password !== undefined ? { password } : {}),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function leaveArenaRoom(accessToken: string, roomCode: string) {
  return apiRequest<ArenaRoomResponse>(`/api/users/arena/rooms/${encodeURIComponent(roomCode)}/leave`, {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getArenaRoom(accessToken: string, roomCode: string) {
  return apiRequest<ArenaRoomResponse>(`/api/users/arena/rooms/${encodeURIComponent(roomCode)}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function submitArenaAnswer(
  accessToken: string,
  roomCode: string,
  payload: {
    questionId: number;
    selectedLabel?: string;
    textAnswer?: string;
    roundIndex?: number;
  },
) {
  return apiRequest<ArenaRoomResponse>(`/api/users/arena/rooms/${encodeURIComponent(roomCode)}/answer`, {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function sendArenaEmote(accessToken: string, roomCode: string, emoteCode: string) {
  return apiRequest<ArenaRoomResponse>(`/api/users/arena/rooms/${encodeURIComponent(roomCode)}/emote`, {
    body: JSON.stringify({ emoteCode }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function joinArenaMatchmaking(
  accessToken: string,
  payload: { mode: ArenaMode; questionCount?: number; maxPlayers?: number },
) {
  return apiRequest<ArenaMatchmakingStatusResponse>("/api/users/arena/matchmaking/join", {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getArenaMatchmakingStatus(accessToken: string) {
  return apiRequest<ArenaMatchmakingStatusResponse>("/api/users/arena/matchmaking/status", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function leaveArenaMatchmaking(accessToken: string) {
  return apiRequest<ArenaMatchmakingStatusResponse>("/api/users/arena/matchmaking/leave", {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getArenaLeaderboard(accessToken: string) {
  return apiRequest<ArenaLeaderboardResponse>("/api/users/arena/leaderboard", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function buildAuthorizedApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${API_BASE_URL}${normalizedPath.slice(4)}`;
  }
  return `${API_BASE_URL}${normalizedPath}`;
}

const LOCAL_LAN_MEDIA_RE =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?(\/(?:api\/)?media\/.+)$/i;

export function resolvePlayableMediaUrl(rawUrl?: string | null) {
  const trimmed = rawUrl?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const lanMatch = trimmed.match(LOCAL_LAN_MEDIA_RE);
  if (lanMatch?.[1]) {
    const normalizedMediaPath = lanMatch[1].startsWith("/api/")
      ? lanMatch[1]
      : `/api${lanMatch[1]}`;
    return buildAuthorizedApiUrl(normalizedMediaPath);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    const normalizedPath = trimmed.startsWith("/media/") ? `/api${trimmed}` : trimmed;
    return buildAuthorizedApiUrl(normalizedPath);
  }
  return trimmed;
}

export function buildVideoMediaProxyUrl(videoId: number) {
  return buildAuthorizedApiUrl(`/api/users/videos/${videoId}/media`);
}

export function getTtsVoices(accessToken: string) {
  return apiRequest<TtsVoicesResponse>("/api/users/tts/voices", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function synthesizeTtsSpeech(
  accessToken: string,
  payload: {
    text: string;
    voiceId?: string | null;
    region?: "US" | "UK";
    audioFormat?: "mp3" | "wav";
  },
) {
  return apiRequest<TtsSynthesizeResponse>("/api/users/tts/synthesize", {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function lookupYoutubeWord(
  accessToken: string,
  payload: {
    word: string;
    contextSentence?: string;
    videoTitle?: string;
  },
) {
  return apiRequest<YoutubeWordLookupApiResponse>("/api/users/youtube/word-lookup", {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

function buildDirectApiUrl(path: string) {
  return buildAuthorizedApiUrl(path);
}

/* ============================================================================
 * MODULE 1: DOCUMENT-TO-TOEIC TEST AI GENERATOR SERVICE CALLS
 * ============================================================================ */

const MIME_TO_EXT_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

const EXT_TO_MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function normalizeUploadDocumentAsset(pickedFile: { name: string; mimeType?: string }) {
  const rawName = (pickedFile.name || "toeic_document").trim();
  const mimeLower = (pickedFile.mimeType || "").trim().toLowerCase();
  const dotIdx = rawName.lastIndexOf(".");
  let ext = dotIdx > 0 && dotIdx < rawName.length - 1 ? rawName.slice(dotIdx + 1).toLowerCase() : "";

  if (!ext || !EXT_TO_MIME_MAP[ext]) {
    const inferredExt = MIME_TO_EXT_MAP[mimeLower];
    if (inferredExt) {
      ext = inferredExt;
    }
  }

  const finalName = dotIdx > 0 && ext === rawName.slice(dotIdx + 1).toLowerCase()
    ? rawName
    : ext
      ? `${rawName}.${ext}`
      : rawName;

  const finalMime =
    mimeLower && mimeLower !== "application/octet-stream"
      ? pickedFile.mimeType!
      : EXT_TO_MIME_MAP[ext] || "application/octet-stream";

  return { finalName, finalMime, ext };
}

function uploadMultipartViaXhr<T>(
  url: string,
  accessToken: string,
  formData: FormData,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 180000;
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("Accept", "application/json");

    xhr.onload = () => {
      let payload: (T & { message?: string }) | { message?: string } | null = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload) {
        resolve(payload as T);
        return;
      }
      const errMsg =
        payload && "message" in payload && payload.message
          ? payload.message
          : `Upload failed (${xhr.status || "HTTP error"})`;
      reject(new Error(errMsg));
    };

    xhr.onerror = () => {
      reject(new Error("Không thể kết nối tới máy chủ khi tải tệp lên."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Quá thời gian xử lý tệp. Vui lòng thử lại."));
    };

    xhr.send(formData);
  });
}

async function uploadMultipartFile<T>(
  endpointPath: string,
  accessToken: string,
  pickedFile: { uri?: string; name: string; mimeType?: string; webFile?: File | Blob },
  fallbackFilename: string,
): Promise<T> {
  const { finalName, finalMime } = normalizeUploadDocumentAsset({
    name: pickedFile.name || fallbackFilename,
    mimeType: pickedFile.mimeType,
  });
  const targetUrl = buildDirectApiUrl(endpointPath);
  const formData = new FormData();

  if (pickedFile.webFile) {
    formData.append("file", pickedFile.webFile, finalName);
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });
    const payload = (await res.json().catch(() => null)) as (T & { message?: string }) | { message?: string } | null;
    if (!res.ok) {
      const errMsg = payload && "message" in payload && payload.message ? payload.message : `Upload failed (${res.status})`;
      throw new Error(errMsg);
    }
    return payload as T;
  }

  if (!pickedFile.uri) {
    throw new Error("Thiếu tệp để tải lên.");
  }

  if (Platform.OS !== "web") {
    formData.append("file", {
      uri: pickedFile.uri,
      name: finalName,
      type: finalMime,
    } as unknown as Blob);
    return uploadMultipartViaXhr<T>(targetUrl, accessToken, formData);
  }

  const blobRes = await fetch(pickedFile.uri);
  const blob = await blobRes.blob();
  formData.append("file", blob, finalName);
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const payload = (await res.json().catch(() => null)) as (T & { message?: string }) | { message?: string } | null;
  if (!res.ok) {
    const errMsg = payload && "message" in payload && payload.message ? payload.message : `Upload failed (${res.status})`;
    throw new Error(errMsg);
  }
  return payload as T;
}

export async function uploadToeicDocument(
  accessToken: string,
  pickedFile: { uri?: string; name: string; mimeType?: string; webFile?: File | Blob },
): Promise<ImportedDocumentApiResponse> {
  return uploadMultipartFile<ImportedDocumentApiResponse>(
    "/api/users/documents/upload",
    accessToken,
    pickedFile,
    "toeic_document",
  );
}

export function getMyImportedDocuments(accessToken: string) {
  return apiRequest<ImportedDocumentListApiResponse>("/api/users/documents", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getImportedDocumentDetail(accessToken: string, documentId: number) {
  return apiRequest<ImportedDocumentApiResponse>(`/api/users/documents/${documentId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function updateImportedDocumentQuestion(
  accessToken: string,
  documentId: number,
  questionId: number,
  payload: {
    partNo?: number;
    originalQuestionNumber?: number;
    pageNumber?: number;
    questionText?: string;
    options?: { optionLabel: string; optionText: string }[];
    officialCorrectLabel?: string;
    answerKeyVerified?: boolean;
    passageId?: number;
    included?: boolean;
  },
) {
  return apiRequest<ImportedDocumentApiResponse>(
    `/api/users/documents/${documentId}/questions/${questionId}`,
    {
      body: JSON.stringify(payload),
      headers: buildAuthHeaders(accessToken),
      method: "PUT",
    },
  );
}

export function removeImportedDocumentQuestion(
  accessToken: string,
  documentId: number,
  questionId: number,
) {
  return apiRequest<ImportedDocumentApiResponse>(
    `/api/users/documents/${documentId}/questions/${questionId}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "DELETE",
    },
  );
}

export function analyzeDocumentAnswersWithAi(accessToken: string, documentId: number) {
  return apiRequest<ImportedDocumentApiResponse>(`/api/users/documents/${documentId}/analyze-answers`, {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function confirmDocumentExam(
  accessToken: string,
  documentId: number,
  payload?: {
    testTitle?: string;
    description?: string;
    selectedParts?: number[];
    durationMinutes?: number;
  },
) {
  return apiRequest<UserTestDetailResponse>(`/api/users/documents/${documentId}/confirm-exam`, {
    body: JSON.stringify(payload ?? {}),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getMyGeneratedDocumentExams(accessToken: string) {
  return apiRequest<UserTestListResponse>("/api/users/documents/exams", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

/* ============================================================================
 * USER VIDEO LEARNING LIBRARY & PERSONAL IMPORT
 * ============================================================================ */

export function importPersonalVideo(
  accessToken: string,
  payload: {
    videoUrl: string;
    title?: string;
    preferredLevel?: string;
    topicHint?: string;
    forceAsr?: boolean;
  },
) {
  return apiRequest<ImportedVideoApiResponse>("/api/users/videos/personal/import", {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getPersonalVideoJobStatus(accessToken: string, jobId: number) {
  return apiRequest<VideoJobApiResponse>(`/api/users/videos/personal/jobs/${jobId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function cancelPersonalVideoJob(accessToken: string, jobId: number) {
  return apiRequest<VideoJobApiResponse>(`/api/users/videos/personal/jobs/${jobId}/cancel`, {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function retryPersonalVideoJob(accessToken: string, jobId: number) {
  return apiRequest<VideoJobApiResponse>(`/api/users/videos/personal/jobs/${jobId}/retry`, {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function deletePersonalVideo(accessToken: string, videoId: number) {
  return apiRequest<{ success: boolean }>(`/api/users/videos/personal/${videoId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "DELETE",
  });
}

export function getPublishedVideos(
  accessToken: string,
  params?: {
    search?: string;
    level?: string;
    topic?: string;
    favoritesOnly?: boolean;
  },
) {
  const qs = new URLSearchParams();
  if (params?.search?.trim()) qs.set("search", params.search.trim());
  if (params?.level && params.level !== "ALL") qs.set("level", params.level);
  if (params?.topic && params.topic !== "ALL") qs.set("topic", params.topic);
  if (params?.favoritesOnly) qs.set("favoritesOnly", "true");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return apiRequest<ImportedVideoListApiResponse>(`/api/users/videos${suffix}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getMyImportedVideos(accessToken: string) {
  return getPublishedVideos(accessToken);
}

export function getPublishedVideoDetail(accessToken: string, videoId: number) {
  return apiRequest<ImportedVideoApiResponse>(`/api/users/videos/${videoId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function refreshVideoStream(accessToken: string, videoId: number) {
  return apiRequest<ImportedVideoApiResponse>(`/api/users/videos/${videoId}/refresh-stream`, {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getImportedVideoDetail(accessToken: string, videoId: number) {
  return getPublishedVideoDetail(accessToken, videoId);
}

export function updateVideoLearningState(
  accessToken: string,
  videoId: number,
  payload: {
    lastPositionSeconds?: number;
    playbackSpeed?: number;
    completed?: boolean;
    favorite?: boolean;
  },
) {
  return apiRequest<ImportedVideoApiResponse>(`/api/users/videos/${videoId}/state`, {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "PUT",
  });
}

export function addVideoBookmark(
  accessToken: string,
  videoId: number,
  payload: {
    timestampSeconds: number;
    label: string;
    note?: string;
  },
) {
  return apiRequest<VideoBookmarkApiResponse>(`/api/users/videos/${videoId}/bookmarks`, {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function deleteVideoBookmark(accessToken: string, videoId: number, bookmarkId: number) {
  return apiRequest<{ success: boolean }>(`/api/users/videos/${videoId}/bookmarks/${bookmarkId}`, {
    headers: buildAuthHeaders(accessToken),
    method: "DELETE",
  });
}

export async function exportVideoSubtitlesText(
  accessToken: string,
  videoId: number,
  format: "srt_en" | "srt_vi" | "srt_bilingual" | "vtt" | "json",
): Promise<string> {
  const res = await fetch(buildDirectApiUrl(`/api/users/videos/${videoId}/subtitles/export?format=${format}`), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Không thể xuất phụ đề (${res.status})`);
  }
  return res.text();
}

/* ============================================================================
 * SEMANTIC DICTIONARY LOOKUP & OBJECT IMAGE RECOGNITION
 * ============================================================================ */

export function suggestDictionaryWords(accessToken: string, query: string, limit = 12) {
  return apiRequest<DictionarySuggestApiResponse>(
    `/api/users/dictionary/suggest?q=${encodeURIComponent(query.trim())}&limit=${limit}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function lookupSemanticDictionary(
  accessToken: string,
  word: string,
  options?: { fast?: boolean },
) {
  const qs = options?.fast ? "&fast=true" : "";
  return apiRequest<SemanticDictionaryApiResponse>(
    `/api/users/dictionary/lookup?word=${encodeURIComponent(word.trim())}${qs}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function getDictionaryHistory(accessToken: string, limit = 30) {
  return apiRequest<DictionaryHistoryApiResponse>(
    `/api/users/dictionary/history?limit=${limit}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function deleteDictionaryHistoryWord(accessToken: string, word: string) {
  return apiRequest<DictionaryHistoryDeleteApiResponse>(
    `/api/users/dictionary/history/${encodeURIComponent(word.trim().toLowerCase())}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "DELETE",
    },
  );
}

export function clearDictionaryHistory(accessToken: string) {
  return apiRequest<DictionaryHistoryDeleteApiResponse>("/api/users/dictionary/history", {
    headers: buildAuthHeaders(accessToken),
    method: "DELETE",
  });
}

export async function recognizeObjectImage(
  accessToken: string,
  pickedFile: { uri?: string; name: string; mimeType?: string; webFile?: File | Blob },
): Promise<ImageObjectRecognitionApiResponse> {
  return uploadMultipartFile<ImageObjectRecognitionApiResponse>(
    "/api/users/dictionary/recognize-image",
    accessToken,
    pickedFile,
    "object_photo.jpg",
  );
}

/* ============================================================================
 * PROFILE INSIGHTS, AVATAR UPLOAD, COSMETICS SHOP, WEEKLY LEADERBOARD & CHAT
 * ============================================================================ */

export async function uploadMyAvatar(
  accessToken: string,
  pickedFile: { uri?: string; name: string; mimeType?: string; webFile?: File | Blob },
): Promise<UserProfileResponse> {
  return uploadMultipartFile<UserProfileResponse>(
    "/api/users/me/avatar",
    accessToken,
    pickedFile,
    "avatar.jpg",
  );
}

export function checkInTodayStreak(accessToken: string) {
  return apiRequest<UserStreakResponse>("/api/users/me/streak/checkin", {
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getMyProfileInsights(accessToken: string) {
  return apiRequest<ProfileInsightsApiResponse>("/api/users/me/insights", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getPublicUserProfile(accessToken: string, userId: number) {
  return apiRequest<ProfileInsightsApiResponse>(`/api/users/${userId}/public-profile`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function getWeeklyLeaderboard(accessToken: string, weekOffset = 0) {
  return apiRequest<WeeklyLeaderboardApiResponse>(
    `/api/users/leaderboard/weekly?weekOffset=${weekOffset}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function getCosmeticShop(accessToken: string) {
  return apiRequest<CosmeticShopApiResponse>("/api/users/shop", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function purchaseCosmeticItem(accessToken: string, cosmeticId: string) {
  return apiRequest<CosmeticShopApiResponse>("/api/users/shop/purchase", {
    body: JSON.stringify({ cosmeticId }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function equipCosmeticItem(
  accessToken: string,
  cosmeticId: string | null,
  category: "FRAME" | "AVATAR" = "FRAME",
) {
  return apiRequest<CosmeticShopApiResponse>("/api/users/shop/equip", {
    body: JSON.stringify({ cosmeticId, category }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getCommunityChatMessages(accessToken: string, limit = 50) {
  return apiRequest<ChatMessageListApiResponse>(`/api/users/chat/community?limit=${limit}`, {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function sendCommunityChatMessage(accessToken: string, content: string) {
  return apiRequest<ChatMessageSingleApiResponse>("/api/users/chat/community", {
    body: JSON.stringify({ content }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getChatFriends(accessToken: string) {
  return apiRequest<ChatFriendsApiResponse>("/api/users/chat/friends", {
    headers: buildAuthHeaders(accessToken),
    method: "GET",
  });
}

export function searchChatUsers(accessToken: string, q: string) {
  return apiRequest<ChatSearchUsersApiResponse>(
    `/api/users/chat/users/search?q=${encodeURIComponent(q.trim())}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function sendFriendRequest(
  accessToken: string,
  payload: { targetUserId?: number; username?: string },
) {
  return apiRequest<ChatFriendsApiResponse>("/api/users/chat/friends/request", {
    body: JSON.stringify(payload),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function acceptFriendRequest(accessToken: string, targetUserId: number) {
  return apiRequest<ChatFriendsApiResponse>("/api/users/chat/friends/accept", {
    body: JSON.stringify({ targetUserId }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function removeFriendship(accessToken: string, targetUserId: number) {
  return apiRequest<ChatFriendsApiResponse>("/api/users/chat/friends/remove", {
    body: JSON.stringify({ targetUserId }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function blockChatUser(accessToken: string, targetUserId: number) {
  return apiRequest<ChatFriendsApiResponse>("/api/users/chat/friends/block", {
    body: JSON.stringify({ targetUserId }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function unblockChatUser(accessToken: string, targetUserId: number) {
  return apiRequest<ChatFriendsApiResponse>("/api/users/chat/friends/unblock", {
    body: JSON.stringify({ targetUserId }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}

export function getDirectChatMessages(accessToken: string, peerUserId: number, limit = 50) {
  return apiRequest<ChatMessageListApiResponse>(
    `/api/users/chat/direct/${peerUserId}?limit=${limit}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    },
  );
}

export function sendDirectChatMessage(accessToken: string, peerUserId: number, content: string) {
  return apiRequest<ChatMessageSingleApiResponse>(`/api/users/chat/direct/${peerUserId}`, {
    body: JSON.stringify({ content }),
    headers: buildAuthHeaders(accessToken),
    method: "POST",
  });
}
