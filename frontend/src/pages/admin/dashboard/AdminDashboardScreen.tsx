import * as DocumentPicker from "expo-document-picker";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, spacing } from "@/src/assets/styles/theme";
import AdminCrudPanel, {
  AdminField,
  FormValues,
} from "@/src/components/admin/AdminCrudPanel";
import AdminLearningPathBuilder from "@/src/components/admin/AdminLearningPathBuilder";
import AdminShell from "@/src/components/admin/AdminShell";
import AdminSidebar from "@/src/components/admin/AdminSidebar";
import AdminTopBar from "@/src/components/admin/AdminTopBar";
import AdminVideoLibraryPanel from "@/src/components/admin/AdminVideoLibraryPanel";
import QuestionPickerModal from "@/src/components/admin/QuestionPickerModal";
import VerifiedBadge from "@/src/components/common/VerifiedBadge";
import { useAuth } from "@/src/hooks/use-auth";
import { adminSidebarItems } from "@/src/pages/admin/dashboard/mock-data";
import { hasAdminConsoleAccess } from "@/src/services/admin-auth.service";
import { logout } from "@/src/services/auth.service";
import {
  AdminAnalyticsService,
  AdminFlashcardService,
  AdminGrammarService,
  AdminLearningModuleService,
  AdminLearningPathMilestoneService,
  AdminLearningPathService,
  AdminMilestoneModuleService,
  AdminPermissionService,
  AdminPracticeSetService,
  AdminQuestionService,
  AdminVideoLessonService,
  AdminTestService,
} from "@/src/services/admin";
import {
  AdminAnalyticsOverviewApiItem,
  AdminFlashcardApiItem,
  AdminLearningPathOverviewItem,
  AdminUserApiItem,
  CreateQuestionRequest,
  GrammarApiItem,
  LearningModuleApiItem,
  LearningPathApiItem,
  PermissionApiItem,
  PracticeSetApiItem,
  PracticeSetQuestionApiItem,
  QuestionApiItem,
  VideoLessonApiItem,
  TestApiItem,
  TestPartApiItem,
  TestPartQuestionApiItem,
} from "@/src/types/admin-api";
import { AdminSectionKey } from "@/src/types/admin";
import { confirmWeb } from "@/src/utils/web-dialog";

const practiceSetTypeOptions = ["PRACTICE", "PLACEMENT"].map((value) => ({
  label: value,
  value,
}));
const sourceTypeOptions = ["ETS", "HACKER", "INTERNAL"].map((value) => ({
  label: value,
  value,
}));
const correctLabelOptions = ["A", "B", "C", "D"].map((value) => ({
  label: value,
  value,
}));
const partNoOptions = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
  label: `Part ${value}`,
  value: String(value),
}));
const practicePartOptions = [
  { label: "Tổng hợp (Tất cả Part)", value: "" },
  ...partNoOptions,
];

function text(values: FormValues, key: string, required = false) {
  const value = String(values[key] ?? "").trim();
  if (required && !value) {
    throw new Error(`Thiếu thông tin bắt buộc: ${key}.`);
  }
  return value;
}

function nullableText(values: FormValues, key: string) {
  const value = text(values, key);
  return value.length > 0 ? value : null;
}

function numberValue(values: FormValues, key: string, required = false) {
  const raw = text(values, key, required);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} phai la so hop le.`);
  }
  return Math.floor(parsed);
}

function boolValue(values: FormValues, key: string) {
  return Boolean(values[key]);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function probeBrowserVideoDuration(file: File): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement("video");
    let settled = false;
    const finish = (seconds: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      videoEl.removeAttribute("src");
      resolve(seconds);
    };
    const timer = setTimeout(() => finish(null), 3000);
    videoEl.preload = "metadata";
    videoEl.onloadedmetadata = () => {
      clearTimeout(timer);
      const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? Math.round(videoEl.duration)
        : null;
      finish(dur);
    };
    videoEl.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    videoEl.src = objectUrl;
  });
}

const flashcardFields: AdminField[] = [
  { name: "englishWord", label: "English word", type: "text", required: true },
  { name: "meaningVi", label: "Meaning VI", type: "text", required: true },
  { name: "pronunciation", label: "Pronunciation", type: "text" },
  { name: "exampleSentence", label: "Example sentence", type: "textarea" },
  { name: "active", label: "Active", type: "switch" },
];

const grammarFields: AdminField[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "content", label: "Content", type: "textarea", required: true },
  { name: "tips", label: "Tips", type: "textarea" },
  { name: "example", label: "Example", type: "textarea" },
  { name: "active", label: "Active", type: "switch" },
];

const videoFields = (
  modules: LearningModuleApiItem[],
  uploadedVideoUrl?: string,
): AdminField[] => [
  {
    name: "moduleId",
    label: "Module",
    type: "select",
    required: true,
    options: modules.map((module) => ({
      label: `${module.id} - ${module.title}`,
      value: String(module.id),
    })),
  },
  { name: "title", label: "Title", type: "text", required: true },
  {
    name: "videoUrl",
    label: "Video URL",
    placeholder: uploadedVideoUrl ? "Đã upload xong, giữ URL này để tạo lesson." : "https://...",
    type: "text",
    required: true,
  },
  {
    name: "durationSeconds",
    label: "Duration seconds",
    type: "number",
    required: true,
  },
  { name: "sortOrder", label: "Sort order", type: "number", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "free", label: "Free", type: "switch" },
  { name: "published", label: "Published", type: "switch" },
];

const practiceSetFields: AdminField[] = [
  { name: "title", label: "Title", type: "text", required: true },
  {
    name: "setType",
    label: "Set type",
    type: "select",
    options: practiceSetTypeOptions,
    required: true,
  },
  {
    name: "partNo",
    label: "Part No",
    type: "select",
    options: practicePartOptions,
  },
  { name: "targetScore", label: "Target score", type: "number" },
  {
    name: "durationMinutes",
    label: "Duration minutes",
    type: "number",
    required: true,
  },
  { name: "description", label: "Description", type: "textarea" },
  { name: "published", label: "Published", type: "switch" },
];

const buildQuestionFields = (
  onExplainDraft?: (values: FormValues) => Promise<Partial<FormValues> | null>,
): AdminField[] => [
  {
    name: "partNo",
    label: "TOEIC Part",
    type: "select",
    options: partNoOptions,
    required: true,
  },
  {
    name: "questionText",
    label: "Question text",
    type: "textarea",
    required: true,
  },
  {
    name: "questionGroupCode",
    label: "Group code (Part 3/4/6/7)",
    type: "text",
    visibleWhen: (v) => ["3", "4", "6", "7"].includes(String(v.partNo ?? "")),
  },
  {
    name: "audioUrl",
    label: "Audio URL (Listening Part 1–4)",
    type: "text",
    visibleWhen: (v) => ["1", "2", "3", "4"].includes(String(v.partNo ?? "")),
  },
  {
    name: "imageUrl",
    label: "Image URL (Part 1 / Part 6–7)",
    type: "text",
    visibleWhen: (v) => ["1", "6", "7"].includes(String(v.partNo ?? "")),
  },
  {
    name: "passageText",
    label: "Passage text (Part 6–7)",
    type: "textarea",
    visibleWhen: (v) => ["6", "7"].includes(String(v.partNo ?? "")),
  },
  {
    name: "transcript",
    label: "Audio transcript (Listening Part 1–4)",
    type: "textarea",
    visibleWhen: (v) => ["1", "2", "3", "4"].includes(String(v.partNo ?? "")),
  },
  { name: "optionA", label: "Option A", type: "text", required: true },
  { name: "optionB", label: "Option B", type: "text", required: true },
  { name: "optionC", label: "Option C", type: "text", required: true },
  { name: "optionD", label: "Option D", type: "text", required: true },
  {
    name: "correctLabel",
    label: "Correct option",
    type: "select",
    options: correctLabelOptions,
    required: true,
  },
  { name: "difficultyLevel", label: "Difficulty level", type: "text" },
  {
    name: "sourceType",
    label: "Source type",
    type: "select",
    options: sourceTypeOptions,
  },
  { name: "sourceYear", label: "Source year", type: "number" },
  {
    name: "explanation",
    label: "Explanation",
    type: "textarea",
    actionButton: onExplainDraft
      ? {
          label: "AI tạo giải thích",
          loadingLabel: "Đang tạo...",
          isEnabled: (v) =>
            Boolean(
              String(v.questionText ?? "").trim() &&
                String(v.optionA ?? "").trim() &&
                String(v.optionB ?? "").trim(),
            ),
          onPress: onExplainDraft,
        }
      : undefined,
  },
];

const testTypeOptions = [
  { label: "Full Test (200 câu · 120p)", value: "FULL_TEST" },
  { label: "Mini Test", value: "MINI_TEST" },
  { label: "Reading Only (Part 5–7)", value: "READING_ONLY" },
  { label: "Listening Only (Part 1–4)", value: "LISTENING_ONLY" },
  { label: "Practice / Tùy chỉnh", value: "PRACTICE" },
];

const testFields: AdminField[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "testType", label: "Test type", type: "select", options: testTypeOptions, required: true },
  { name: "totalDurationMinutes", label: "Duration (minutes)", type: "number", required: true },
  { name: "targetScore", label: "Target score", type: "number", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "published", label: "Published", type: "switch" },
];

const partSectionOptions = [
  { label: "Listening (Part 1–4)", value: "LISTENING" },
  { label: "Reading (Part 5–7)", value: "READING" },
];

const testPartFields: AdminField[] = [
  { name: "partNumber", label: "TOEIC Part", type: "select", options: partNoOptions, required: true },
  { name: "partName", label: "Part name (tự gợi ý nếu để trống)", type: "text" },
  { name: "partSection", label: "Section", type: "select", options: partSectionOptions, required: true },
  { name: "sortOrder", label: "Sort order", type: "number", required: true },
  { name: "durationMinutes", label: "Duration (minutes)", type: "number", required: true },
  { name: "description", label: "Description", type: "textarea" },
];

const SAMPLE_BULK_JSON = `[
  {
    "partNo": 5,
    "questionText": "All employees are required to attend the quarterly safety ______ on Friday.",
    "sourceType": "ETS",
    "sourceYear": 2024,
    "difficultyLevel": "INTERMEDIATE",
    "explanation": "Cần danh từ đứng sau tính từ 'safety' và làm tân ngữ của 'attend'.",
    "options": [
      { "optionLabel": "A", "optionText": "brief", "correct": false },
      { "optionLabel": "B", "optionText": "briefing", "correct": true },
      { "optionLabel": "C", "optionText": "briefly", "correct": false },
      { "optionLabel": "D", "optionText": "briefed", "correct": false }
    ]
  }
]`;

const SAMPLE_BULK_CSV = `partNo,questionText,optionA,optionB,optionC,optionD,correctLabel,explanation,difficultyLevel
5,"The marketing director asked the team to ______ the campaign budget before Monday.",review,reviewing,reviewed,reviewer,A,"Sau 'to' dùng động từ nguyên thể (review).",MEDIUM`;

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseBulkQuestionsInput(raw: string): CreateQuestionRequest[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Hãy dán dữ liệu JSON hoặc CSV.");

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "questions" in parsed
        ? (parsed as { questions: unknown }).questions
        : null;
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error("JSON phải là mảng câu hỏi hoặc object có field 'questions'.");
    }
    return arr as CreateQuestionRequest[];
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV phải có dòng tiêu đề và ít nhất 1 dòng câu hỏi.");
  }

  const headers = splitCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    const correctLabel = (row.correctLabel || "A").toUpperCase();
    return {
      partNo: row.partNo ? Number(row.partNo) : 5,
      questionText: row.questionText,
      sourceType: row.sourceType || "ETS",
      sourceYear: row.sourceYear ? Number(row.sourceYear) : null,
      difficultyLevel: row.difficultyLevel || "MEDIUM",
      explanation: row.explanation || null,
      audioUrl: row.audioUrl || null,
      imageUrl: row.imageUrl || null,
      passageText: row.passageText || null,
      transcript: row.transcript || null,
      questionGroupCode: row.questionGroupCode || null,
      options: ["A", "B", "C", "D"].map((label) => ({
        optionLabel: label,
        optionText: row[`option${label}`] || `Option ${label}`,
        correct: label === correctLabel,
      })),
    };
  });
}

export default function AdminDashboardScreen() {
  const { auth, isHydrated, signOut } = useAuth();
  const isFullAdmin = auth.user?.role === "ADMIN";
  const [selectedSection, setActiveSection] = useState<AdminSectionKey>("paths");
  const activeSection: AdminSectionKey = isFullAdmin ? selectedSection : "video-library";
  const visibleSidebarItems = useMemo(
    () =>
      isFullAdmin
        ? adminSidebarItems
        : adminSidebarItems.filter((item) => item.id === "video-library"),
    [isFullAdmin],
  );
  const [paths, setPaths] = useState<LearningPathApiItem[]>([]);
  const [pathOverviews, setPathOverviews] = useState<AdminLearningPathOverviewItem[]>([]);
  const [modules, setModules] = useState<LearningModuleApiItem[]>([]);
  const [grammars, setGrammars] = useState<GrammarApiItem[]>([]);
  const [flashcards, setFlashcards] = useState<AdminFlashcardApiItem[]>([]);
  const [videos, setVideos] = useState<VideoLessonApiItem[]>([]);
  const [practiceSets, setPracticeSets] = useState<PracticeSetApiItem[]>([]);
  const [questions, setQuestions] = useState<QuestionApiItem[]>([]);
  const [practiceSetQuestions, setPracticeSetQuestions] = useState<
    PracticeSetQuestionApiItem[]
  >([]);
  const [permissions, setPermissions] = useState<PermissionApiItem[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [selectedPracticeSetId, setSelectedPracticeSetId] = useState<
    number | null
  >(null);
  const [tests, setTests] = useState<TestApiItem[]>([]);
  const [testParts, setTestParts] = useState<TestPartApiItem[]>([]);
  const [testPartQuestions, setTestPartQuestions] = useState<TestPartQuestionApiItem[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [selectedTestPartId, setSelectedTestPartId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [working, setWorking] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState("");
  const [uploadedVideoDuration, setUploadedVideoDuration] = useState<number | null>(null);
  const [importingFlashcards, setImportingFlashcards] = useState(false);
  const [flashcardImportAutoFillAi, setFlashcardImportAutoFillAi] = useState(true);
  const [flashcardImportSummary, setFlashcardImportSummary] = useState<string | null>(null);
  const [contentSubTab, setContentSubTab] = useState<"flashcards" | "video" | "practice">("flashcards");
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyticsOverview, setAnalyticsOverview] =
    useState<AdminAnalyticsOverviewApiItem | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserApiItem[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkImportRaw, setBulkImportRaw] = useState(SAMPLE_BULK_JSON);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [questionPartFilter, setQuestionPartFilter] = useState<string>("ALL");
  const [questionSourceFilter, setQuestionSourceFilter] = useState<string>("ALL");
  const [importingQuestions, setImportingQuestions] = useState(false);
  const [questionImportAutoExplainAi, setQuestionImportAutoExplainAi] = useState(false);
  const [questionImportSummary, setQuestionImportSummary] = useState<string | null>(null);
  const [showPracticePickerModal, setShowPracticePickerModal] = useState(false);
  const [savingPracticeQuestions, setSavingPracticeQuestions] = useState(false);
  const [testsSubTab, setTestsSubTab] = useState<"list" | "builder">("list");
  const [showTestPartPickerModal, setShowTestPartPickerModal] = useState(false);
  const [savingTestPartQuestions, setSavingTestPartQuestions] = useState(false);

  const services = useMemo(() => {
    if (!auth.accessToken) return null;
    return {
      flashcards: new AdminFlashcardService(auth.accessToken),
      grammars: new AdminGrammarService(auth.accessToken),
      milestones: new AdminLearningPathMilestoneService(auth.accessToken),
      modules: new AdminLearningModuleService(auth.accessToken),
      paths: new AdminLearningPathService(auth.accessToken),
      permissions: new AdminPermissionService(auth.accessToken),
      practiceSets: new AdminPracticeSetService(auth.accessToken),
      questions: new AdminQuestionService(auth.accessToken),
      links: new AdminMilestoneModuleService(auth.accessToken),
      videos: new AdminVideoLessonService(auth.accessToken),
      tests: new AdminTestService(auth.accessToken),
      analytics: new AdminAnalyticsService(auth.accessToken),
    };
  }, [auth.accessToken]);

  const selectedModule =
    modules.find((item) => item.id === selectedModuleId) ?? null;
  const selectedPracticeSet =
    practiceSets.find((item) => item.id === selectedPracticeSetId) ?? null;
  const selectedTest =
    tests.find((item) => item.id === selectedTestId) ?? null;
  const selectedTestPart =
    testParts.find((item) => item.id === selectedTestPartId) ?? null;

  const selectedModuleLocations = useMemo(() => {
    if (!selectedModuleId) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of pathOverviews) {
      for (const ms of p.milestones ?? []) {
        if ((ms.modules ?? []).some((m) => m.moduleId === selectedModuleId)) {
          const label = `${p.targetScore}+ › Chặng ${ms.sortOrder}: ${ms.title}`;
          if (!seen.has(label)) {
            seen.add(label);
            list.push(label);
          }
        }
      }
    }
    return list;
  }, [pathOverviews, selectedModuleId]);

  const activeSectionLabel =
    adminSidebarItems.find((item) => item.id === activeSection)?.label ??
    "Admin";

  const handleError = useCallback((error: unknown) => {
    setErrorMessage(
      error instanceof Error ? error.message : "Không thể xử lý yêu cầu.",
    );
  }, []);

  const handleUploadVideoFile = useCallback(async () => {
    if (!services) return;
    if (Platform.OS !== "web") {
      Alert.alert("Upload", "Upload file chỉ hỗ trợ trên web.");
      return;
    }

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "video/*";
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;

      try {
        setUploadingVideo(true);
        setErrorMessage(null);
        setSelectedVideoFile(file);
        const [response, localDuration] = await Promise.all([
          services.videos.upload(file),
          probeBrowserVideoDuration(file),
        ]);
        const uploadedUrl = response.data?.playbackUrl ?? response.data?.secureUrl ?? "";
        if (!uploadedUrl) {
          throw new Error("Upload xong nhưng không nhận được URL video.");
        }

        setUploadedVideoUrl(uploadedUrl);
        setUploadedVideoDuration(response.data?.durationSeconds ?? localDuration ?? null);
        Alert.alert("Upload", "Tải video lên thành công. URL đã được điền sẵn để tạo bài giảng.");
      } catch (error) {
        setSelectedVideoFile(null);
        handleError(error);
      } finally {
        setUploadingVideo(false);
      }
    };

    picker.click();
  }, [handleError, services]);

  const handleLogout = useCallback(async () => {
    if (!auth.accessToken || isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await logout(auth.accessToken, auth.tokenType ?? "Bearer");
    } catch {
      // Best-effort API logout. Local session still needs to be cleared.
    } finally {
      signOut();
      setIsLoggingOut(false);
    }
  }, [auth.accessToken, auth.tokenType, isLoggingOut, signOut]);

  const loadBaseData = useCallback(async () => {
    if (!services) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      const [
        pathResponse,
        overviewResponse,
        moduleResponse,
        grammarResponse,
        questionResponse,
        permissionResponse,
      ] = await Promise.all([
        services.paths.getAll(),
        services.paths.getOverview(),
        services.modules.getAll(),
        services.grammars.getAll(),
        services.questions.getAll(),
        services.permissions.getAll(),
      ]);
      const nextPaths = pathResponse.data ?? [];
      const nextOverviews = overviewResponse.data ?? [];
      const nextModules = moduleResponse.data ?? [];
      const nextGrammars = grammarResponse.data ?? [];
      setPaths(nextPaths);
      setPathOverviews(nextOverviews);
      setModules(nextModules);
      setGrammars(nextGrammars);
      setQuestions(questionResponse.data ?? []);
      setPermissions(permissionResponse ?? []);
      setSelectedPathId((current) =>
        current && nextPaths.some((p) => p.id === current)
          ? current
          : (nextOverviews[0]?.id ?? nextPaths[0]?.id ?? null),
      );
      setSelectedModuleId((current) =>
        current && nextModules.some((m) => m.id === current)
          ? current
          : (nextModules[0]?.id ?? null),
      );
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }, [handleError, services]);

  const loadContent = useCallback(async () => {
    if (!services || !selectedModuleId) {
      setFlashcards([]);
      setVideos([]);
      setPracticeSets([]);
      return;
    }
    try {
      const [flashcardResponse, videoResponse, practiceSetResponse] =
        await Promise.all([
          services.flashcards.getByModuleId(selectedModuleId),
          services.videos.getByModuleId(selectedModuleId),
          services.practiceSets.getByModuleId(selectedModuleId),
        ]);
      const nextPracticeSets = practiceSetResponse.data ?? [];
      setFlashcards(flashcardResponse.data ?? []);
      setVideos(videoResponse.data ?? []);
      setPracticeSets(nextPracticeSets);
      setSelectedPracticeSetId((current) =>
        current && nextPracticeSets.some((item) => item.id === current)
          ? current
          : (nextPracticeSets[0]?.id ?? null),
      );
    } catch (error) {
      handleError(error);
    }
  }, [handleError, selectedModuleId, services]);

  const handleImportFlashcardsFile = useCallback(async () => {
    if (!services) return;
    if (!selectedModuleId) {
      Alert.alert("Import từ vựng", "Vui lòng chọn Mô-đun trước khi import.");
      return;
    }

    const executeImport = async (
      file: File | { uri: string; name: string; type?: string },
      displayName: string,
    ) => {
      try {
        setImportingFlashcards(true);
        setErrorMessage(null);
        setFlashcardImportSummary(null);
        const res = await services.flashcards.importFile(
          selectedModuleId,
          file,
          flashcardImportAutoFillAi,
        );
        const stats = res.data;
        const imported = stats?.importedCount ?? 0;
        const aiFilled = stats?.aiEnrichedCount ?? 0;
        const skipped = stats?.skippedDuplicateCount ?? 0;
        const summary = `File "${displayName}": Đã thêm ${imported} thẻ từ vựng${
          aiFilled > 0 ? ` (AI tự điền ${aiFilled} từ)` : ""
        }${skipped > 0 ? `, bỏ qua ${skipped} từ trùng` : ""}.`;
        setFlashcardImportSummary(summary);
        await loadContent();
      } catch (error) {
        handleError(error);
      } finally {
        setImportingFlashcards(false);
      }
    };

    if (Platform.OS === "web") {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".xlsx,.xls,.docx,.doc,.csv,.tsv,.txt";
      picker.onchange = () => {
        const file = picker.files?.[0];
        if (!file) return;
        void executeImport(file, file.name);
      };
      picker.click();
      return;
    }

    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/csv",
        "text/plain",
      ],
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    await executeImport(
      {
        name: asset.name,
        type: asset.mimeType ?? "application/octet-stream",
        uri: asset.uri,
      },
      asset.name,
    );
  }, [flashcardImportAutoFillAi, handleError, loadContent, selectedModuleId, services]);

  const loadPracticeSetQuestions = useCallback(async () => {
    if (!services || !selectedPracticeSetId) {
      setPracticeSetQuestions([]);
      return;
    }
    try {
      const response = await services.practiceSets.getQuestions(
        selectedPracticeSetId,
      );
      setPracticeSetQuestions(
        [...(response.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
      );
    } catch (error) {
      handleError(error);
    }
  }, [handleError, selectedPracticeSetId, services]);

  const loadTests = useCallback(async () => {
    if (!services) return;
    try {
      const response = await services.tests.getAll();
      const nextTests = response.data ?? [];
      setTests(nextTests);
      setSelectedTestId((current) =>
        current && nextTests.some((item) => item.id === current)
          ? current
          : (nextTests[0]?.id ?? null),
      );
    } catch (error) {
      handleError(error);
    }
  }, [handleError, services]);

  const loadTestParts = useCallback(async () => {
    if (!services || !selectedTestId) {
      setTestParts([]);
      return;
    }
    try {
      const response = await services.tests.getParts(selectedTestId);
      const nextParts = [...(response.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
      setTestParts(nextParts);
      setSelectedTestPartId((current) =>
        current && nextParts.some((item) => item.id === current)
          ? current
          : (nextParts[0]?.id ?? null),
      );
    } catch (error) {
      handleError(error);
    }
  }, [handleError, selectedTestId, services]);

  const loadTestPartQuestions = useCallback(async () => {
    if (!services || !selectedTestPartId) {
      setTestPartQuestions([]);
      return;
    }
    try {
      const response = await services.tests.getPartQuestions(selectedTestPartId);
      setTestPartQuestions([...(response.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (error) {
      handleError(error);
    }
  }, [handleError, selectedTestPartId, services]);

  const loadUsersAndAnalytics = useCallback(async () => {
    if (!services) return;
    try {
      const [overviewRes, usersRes] = await Promise.all([
        services.analytics.getOverview(),
        services.analytics.getAllUsers(),
      ]);
      setAnalyticsOverview(overviewRes.data ?? null);
      setAdminUsers(usersRes.data ?? []);
    } catch (error) {
      handleError(error);
    }
  }, [handleError, services]);

  const handleBulkImportQuestions = async () => {
    if (!services) return;
    try {
      setBulkImporting(true);
      setErrorMessage(null);
      const parsed = parseBulkQuestionsInput(bulkImportRaw);
      await services.questions.bulkImport(parsed);
      setShowBulkImportModal(false);
      await Promise.all([loadBaseData(), loadUsersAndAnalytics()]);
      Alert.alert("Bulk Import", `Đã import thành công ${parsed.length} câu hỏi.`);
    } catch (error) {
      handleError(error);
    } finally {
      setBulkImporting(false);
    }
  };

  const handleImportQuestionsFile = useCallback(async () => {
    if (!services) return;
    const defaultPart =
      questionPartFilter !== "ALL" && questionPartFilter !== "INVALID"
        ? Number(questionPartFilter)
        : 5;

    const executeImport = async (
      file: File | { uri: string; name: string; type?: string },
      displayName: string,
    ) => {
      try {
        setImportingQuestions(true);
        setErrorMessage(null);
        setQuestionImportSummary(null);
        const res = await services.questions.importFile(
          file,
          defaultPart,
          questionImportAutoExplainAi,
        );
        const stats = res.data;
        const imported = stats?.importedCount ?? 0;
        const aiCount = stats?.aiExplainedCount ?? 0;
        const skipped = stats?.skippedDuplicateCount ?? 0;
        const summary = `File "${displayName}": Đã thêm ${imported} câu hỏi${
          aiCount > 0 ? ` (AI giải thích ${aiCount} câu)` : ""
        }${skipped > 0 ? `, bỏ qua ${skipped} câu trùng` : ""}.`;
        setQuestionImportSummary(summary);
        await Promise.all([loadBaseData(), loadUsersAndAnalytics()]);
      } catch (error) {
        handleError(error);
      } finally {
        setImportingQuestions(false);
      }
    };

    if (Platform.OS === "web") {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".xlsx,.xls,.docx,.doc,.pdf,.csv,.tsv,.txt";
      picker.onchange = () => {
        const file = picker.files?.[0];
        if (!file) return;
        void executeImport(file, file.name);
      };
      picker.click();
      return;
    }

    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: "*/*",
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    await executeImport(
      {
        name: asset.name,
        type: asset.mimeType ?? "application/octet-stream",
        uri: asset.uri,
      },
      asset.name,
    );
  }, [handleError, loadBaseData, loadUsersAndAnalytics, questionImportAutoExplainAi, questionPartFilter, services]);

  const openPracticeQuestionPicker = () => {
    if (!selectedPracticeSetId) {
      Alert.alert("Bộ thực hành", "Hãy chọn hoặc tạo một Bộ bài tập trước.");
      return;
    }
    setShowPracticePickerModal(true);
  };

  const savePracticeSetSelection = async (selectedIds: number[]) => {
    if (!services || !selectedPracticeSetId) return;
    try {
      setSavingPracticeQuestions(true);
      setErrorMessage(null);
      await services.practiceSets.assignQuestions(selectedPracticeSetId, {
        questions: selectedIds.map((questionId, index) => ({
          questionId,
          sortOrder: index + 1,
        })),
      });
      setShowPracticePickerModal(false);
      await loadPracticeSetQuestions();
    } catch (error) {
      handleError(error);
    } finally {
      setSavingPracticeQuestions(false);
    }
  };

  const saveTestPartSelection = async (selectedIds: number[]) => {
    if (!services || !selectedTestPartId) return;
    try {
      setSavingTestPartQuestions(true);
      setErrorMessage(null);
      await services.tests.syncPartQuestions(selectedTestPartId, selectedIds);
      setShowTestPartPickerModal(false);
      await Promise.all([loadTestParts(), loadTestPartQuestions()]);
    } catch (error) {
      handleError(error);
    } finally {
      setSavingTestPartQuestions(false);
    }
  };

  const moveTestPartQuestion = async (index: number, direction: -1 | 1) => {
    if (!services || !selectedTestPartId) return;
    const target = index + direction;
    if (target < 0 || target >= testPartQuestions.length) return;
    const reordered = [...testPartQuestions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await runAction(
      () =>
        services.tests
          .syncPartQuestions(
            selectedTestPartId,
            reordered.map((item) => item.questionId),
          )
          .then(() => undefined),
      loadTestPartQuestions,
    );
  };

  const removeTestPartQuestion = async (item: TestPartQuestionApiItem) => {
    if (!services || !selectedTestPartId) return;
    if (!confirmWeb(`Gỡ câu hỏi #${item.questionId} khỏi "${selectedTestPart?.partName ?? ""}"?`)) {
      return;
    }
    await runAction(
      () => services.tests.removeQuestion(selectedTestPartId, item.id).then(() => undefined),
      async () => {
        await Promise.all([loadTestParts(), loadTestPartQuestions()]);
      },
    );
  };

  const movePracticeQuestion = async (index: number, direction: -1 | 1) => {
    if (!services || !selectedPracticeSetId) return;
    const target = index + direction;
    if (target < 0 || target >= practiceSetQuestions.length) return;
    const reordered = [...practiceSetQuestions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    await runAction(
      () =>
        services.practiceSets
          .assignQuestions(selectedPracticeSetId, {
            questions: reordered.map((item, idx) => ({
              questionId: item.questionId,
              sortOrder: idx + 1,
            })),
          })
          .then(() => undefined),
      loadPracticeSetQuestions,
    );
  };

  const removePracticeQuestion = async (item: PracticeSetQuestionApiItem) => {
    if (!services || !selectedPracticeSetId) return;
    if (!confirmWeb(`Gỡ câu hỏi #${item.questionId} khỏi bộ "${selectedPracticeSet?.title ?? ""}"?`)) {
      return;
    }
    const remaining = practiceSetQuestions.filter((entry) => entry.id !== item.id);
    await runAction(
      () =>
        services.practiceSets
          .assignQuestions(selectedPracticeSetId, {
            questions: remaining.map((entry, idx) => ({
              questionId: entry.questionId,
              sortOrder: idx + 1,
            })),
          })
          .then(() => undefined),
      loadPracticeSetQuestions,
    );
  };

  useEffect(() => {
    if (!isFullAdmin) return;
    const t = setTimeout(() => {
      void loadBaseData();
      void loadTests();
      void loadUsersAndAnalytics();
    }, 0);
    return () => clearTimeout(t);
  }, [isFullAdmin, loadBaseData, loadTests, loadUsersAndAnalytics]);

  useEffect(() => {
    if (!isFullAdmin) return;
    const t = setTimeout(() => {
      void loadContent();
    }, 0);
    return () => clearTimeout(t);
  }, [isFullAdmin, loadContent]);

  useEffect(() => {
    if (!isFullAdmin) return;
    const t = setTimeout(() => {
      void loadPracticeSetQuestions();
    }, 0);
    return () => clearTimeout(t);
  }, [isFullAdmin, loadPracticeSetQuestions]);

  useEffect(() => {
    if (!isFullAdmin) return;
    const t = setTimeout(() => {
      void loadTestParts();
    }, 0);
    return () => clearTimeout(t);
  }, [isFullAdmin, loadTestParts]);

  useEffect(() => {
    if (!isFullAdmin) return;
    const t = setTimeout(() => {
      void loadTestPartQuestions();
    }, 0);
    return () => clearTimeout(t);
  }, [isFullAdmin, loadTestPartQuestions]);

  const runAction = useCallback(

    async (action: () => Promise<void>, reload?: () => Promise<void>) => {
      try {
        setWorking(true);
        setErrorMessage(null);
        await action();
        await (reload ?? loadBaseData)();
      } catch (error) {
        handleError(error);
      } finally {
        setWorking(false);
      }
    },
    [handleError, loadBaseData],
  );

  if (!isHydrated) return null;
  if (!auth.accessToken || !hasAdminConsoleAccess(auth.user?.role))
    return <Redirect href="/admin" />;

  if (Platform.OS !== "web") {
    return (
      <AdminShell>
        <Text style={styles.mobileNotice}>Bảng điều khiển admin chỉ hỗ trợ trên web.</Text>
      </AdminShell>
    );
  }

  const requireModule = () => {
    if (!selectedModuleId) throw new Error("Hãy chọn module trước.");
    return selectedModuleId;
  };

  const questionPayload = (values: FormValues) => {
    const correctLabel = text(values, "correctLabel", true);
    return {
      audioUrl: nullableText(values, "audioUrl"),
      difficultyLevel: nullableText(values, "difficultyLevel"),
      explanation: nullableText(values, "explanation"),
      imageUrl: nullableText(values, "imageUrl"),
      options: ["A", "B", "C", "D"].map((label) => ({
        correct: label === correctLabel,
        optionLabel: label,
        optionText: text(values, `option${label}`, true),
      })),
      partNo: numberValue(values, "partNo", true),
      passageText: nullableText(values, "passageText"),
      questionGroupCode: nullableText(values, "questionGroupCode"),
      questionText: text(values, "questionText", true),
      sourceType: text(values, "sourceType") || null,
      sourceYear: numberValue(values, "sourceYear"),
      transcript: nullableText(values, "transcript"),
    };
  };

  const getGrammarInitialValues = (item?: GrammarApiItem): FormValues => ({
    active: item?.active ?? true,
    content: item?.content ?? "",
    example: item?.example ?? "",
    tips: item?.tips ?? "",
    title: item?.title ?? "",
  });

  const reloadGrammars = async () => {
    await loadBaseData();
  };

  const renderSelector = <
    T extends { id: number; title?: string; code?: string },
  >(
    label: string,
    items: T[],
    selectedId: number | null,
    onSelect: (id: number) => void,
  ) => (
    <View style={styles.selectorBlock}>
      <Text style={styles.selectorLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.selectorRow}>
          {items.map((item) => {
            const active = item.id === selectedId;
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item.id)}
                style={[
                  styles.selectorChip,
                  active ? styles.selectorChipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.selectorText,
                    active ? styles.selectorTextActive : null,
                  ]}
                >
                  #{item.id} {item.title ?? item.code ?? ""}
                </Text>
              </Pressable>
            );
          })}
          {items.length === 0 ? (
            <Text style={styles.selectorEmpty}>Chưa có dữ liệu</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );

  const renderPaths = () => (
    <AdminLearningPathBuilder
      loading={loading}
      modules={modules}
      onCreateMilestone={(pathId, payload) =>
        runAction(() => services!.milestones.create(pathId, payload).then(() => undefined))
      }
      onCreatePath={(payload) =>
        runAction(async () => {
          const res = await services!.paths.create(payload);
          if (res.data?.id) {
            setSelectedPathId(res.data.id);
          }
        })
      }
      onCreateQuickModule={(milestoneId, payload) =>
        runAction(() => services!.links.createQuick(milestoneId, payload).then(() => undefined))
      }
      onCreateStandaloneModule={(payload) =>
        runAction(() => services!.modules.create(payload).then(() => undefined))
      }
      onDeleteMilestone={(pathId, milestoneId) =>
        runAction(() => services!.milestones.delete(pathId, milestoneId).then(() => undefined))
      }
      onDeletePath={(pathId) =>
        runAction(() => services!.paths.delete(pathId).then(() => undefined))
      }
      onDeleteStandaloneModule={(moduleId) =>
        runAction(() => services!.modules.delete(moduleId).then(() => undefined))
      }
      onLinkExistingModule={(milestoneId, payload) =>
        runAction(() => services!.links.create(milestoneId, payload).then(() => undefined))
      }
      onOpenModuleContent={(moduleId, moduleType) => {
        setSelectedModuleId(moduleId);
        setShowAllLocations(false);
        const normalizedType = (moduleType ?? "").toUpperCase();
        if (normalizedType === "VIDEO") {
          setContentSubTab("video");
        } else if (["QUIZ", "MOCK_TEST", "LISTENING", "READING"].includes(normalizedType)) {
          setContentSubTab("practice");
        } else {
          setContentSubTab("flashcards");
        }
        setActiveSection("content");
      }}
      onRefresh={loadBaseData}
      onSelectPathId={setSelectedPathId}
      onUnlinkModule={(milestoneId, linkId) =>
        runAction(() => services!.links.delete(milestoneId, linkId).then(() => undefined))
      }
      onUpdateMilestone={(pathId, milestoneId, payload) =>
        runAction(() =>
          services!.milestones.update(pathId, milestoneId, payload).then(() => undefined),
        )
      }
      onUpdateModuleLink={(milestoneId, linkId, payload) =>
        runAction(() => services!.links.update(milestoneId, linkId, payload).then(() => undefined))
      }
      onUpdatePath={(pathId, payload) =>
        runAction(() => services!.paths.update(pathId, payload).then(() => undefined))
      }
      onUpdateStandaloneModule={(moduleId, payload) =>
        runAction(() => services!.modules.update(moduleId, payload).then(() => undefined))
      }
      overviews={pathOverviews}
      selectedPathId={selectedPathId}
      working={working}
    />
  );

  const renderContent = () => {
    const visibleLocations = showAllLocations
      ? selectedModuleLocations
      : selectedModuleLocations.slice(0, 2);
    const hiddenLocationsCount = Math.max(0, selectedModuleLocations.length - 2);

    return (
      <View style={styles.stack}>
        <View style={styles.infoFlow}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 260, gap: 6 }}>
              <Text style={styles.infoFlowTitle}>
                {selectedModule
                  ? `Đang biên tập Mô-đun #${selectedModule.id}: ${selectedModule.title}`
                  : "Chọn Mô-đun để biên tập nội dung"}
              </Text>
              {selectedModuleLocations.length > 0 ? (
                <View style={styles.locationChipWrap}>
                  {visibleLocations.map((loc) => (
                    <View key={loc} style={styles.locationChip}>
                      <Text style={styles.locationChipText}>{loc}</Text>
                    </View>
                  ))}
                  {hiddenLocationsCount > 0 ? (
                    <Pressable
                      onPress={() => setShowAllLocations((prev) => !prev)}
                      style={styles.locationToggleChip}
                    >
                      <Text style={styles.locationToggleText}>
                        {showAllLocations ? "Thu gọn" : `+${hiddenLocationsCount} vị trí khác`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.infoFlowText}>
                  Mô-đun này chưa được gắn vào Lộ trình / Chặng nào.
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => setActiveSection("paths")}
              style={styles.selectorChip}
            >
              <Text style={styles.selectorTextActive}>← Quay lại Cây Lộ trình</Text>
            </Pressable>
          </View>
        </View>

        {renderSelector(
          "Chuyển nhanh Mô-đun",
          modules,
          selectedModuleId,
          (id) => {
            setSelectedModuleId(id);
            setShowAllLocations(false);
          },
        )}

        <View style={styles.contentTabRow}>
          {[
            { id: "flashcards" as const, label: `Thẻ từ vựng (${flashcards.length})` },
            { id: "video" as const, label: `Bài giảng Video (${videos.length})` },
            { id: "practice" as const, label: `Bộ bài tập (${practiceSets.length})` },
          ].map((tab) => {
            const active = contentSubTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setContentSubTab(tab.id)}
                style={[styles.contentTabBtn, active && styles.contentTabBtnActive]}
              >
                <Text style={[styles.contentTabText, active && styles.contentTabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {contentSubTab === "flashcards" ? (
          <>
            <View style={styles.uploadBox}>
              <View style={styles.uploadHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadTitle}>Import từ vựng từ Excel / Word</Text>
                  <Text style={styles.uploadSubtitle}>
                    Hỗ trợ .xlsx, .xls, .docx, .doc, .csv, .txt (có thể chỉ gồm cột/dòng từ tiếng Anh hoặc đủ 4 cột English | Meaning VI | Pronunciation | Example).
                  </Text>
                </View>
                {flashcardImportSummary ? (
                  <View style={styles.uploadStatusPill}>
                    <Text style={styles.uploadStatusText}>Import thành công ✓</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.uploadActionRow}>
                <Pressable
                  disabled={!services || !selectedModuleId || importingFlashcards || working}
                  onPress={handleImportFlashcardsFile}
                  style={[styles.uploadButton, { marginTop: 0 }]}
                >
                  <Text style={styles.uploadButtonText}>
                    {importingFlashcards
                      ? "Đang đọc file & AI bổ sung..."
                      : "Chọn file Excel / Word & Import"}
                  </Text>
                </Pressable>

                <View style={styles.importToggleRow}>
                  <Switch
                    onValueChange={setFlashcardImportAutoFillAi}
                    thumbColor={colors.surface}
                    trackColor={{ false: "#CBD5E1", true: colors.primary }}
                    value={flashcardImportAutoFillAi}
                  />
                  <Text style={styles.importToggleText}>
                    AI tự điền nghĩa, phát âm & ví dụ nếu thiếu
                  </Text>
                </View>
              </View>

              {flashcardImportSummary ? (
                <Text style={[styles.uploadHint, { color: colors.primaryDark, fontWeight: "700" }]}>
                  {flashcardImportSummary}
                </Text>
              ) : null}
            </View>

            <AdminCrudPanel
              autoFillAction={{
                autoTriggerOnType: true,
                buttonLabel: "AI tự điền",
                debounceMs: 800,
                onAutoFill: async (values) => {
                  const word = String(values.englishWord ?? "").trim();
                  if (!word || !services) return null;
                  const res = await services.flashcards.aiSuggest(word);
                  const data = res.data;
                  if (!data) return null;
                  return {
                    exampleSentence: data.exampleSentence ?? "",
                    meaningVi: data.meaningVi ?? "",
                    pronunciation: data.pronunciation ?? "",
                  };
                },
                targetFields: ["meaningVi", "pronunciation", "exampleSentence"],
                triggerField: "englishWord",
              }}
              columns={[
                { label: "ID", render: (item) => String(item.id) },
                { label: "Word", render: (item) => item.englishWord },
                { label: "IPA", render: (item) => item.pronunciation ?? "-" },
                { label: "Meaning", render: (item) => item.meaningVi },
                { label: "Active", render: (item) => yesNo(item.active) },
              ]}
            fields={flashcardFields}
            getInitialValues={(item?: AdminFlashcardApiItem) => ({
              active: item?.active ?? true,
              englishWord: item?.englishWord ?? "",
              exampleSentence: item?.exampleSentence ?? "",
              meaningVi: item?.meaningVi ?? "",
              pronunciation: item?.pronunciation ?? "",
            })}
            getItemId={(item) => item.id}
            onCreate={(values) =>
              runAction(
                () =>
                  services!.flashcards
                    .create({
                      active: boolValue(values, "active"),
                      englishWord: text(values, "englishWord", true),
                      exampleSentence: nullableText(values, "exampleSentence"),
                      meaningVi: text(values, "meaningVi", true),
                      moduleId: requireModule(),
                      pronunciation: nullableText(values, "pronunciation"),
                    })
                    .then(() => undefined),
                loadContent,
              )
            }
            onDelete={(item) =>
              confirmWeb(`Xóa thẻ từ vựng "${item.englishWord}"?`)
                ? runAction(
                    () =>
                      services!.flashcards.delete(item.id).then(() => undefined),
                    loadContent,
                  )
                : Promise.resolve()
            }
            onRefresh={loadContent}
            onUpdate={(item, values) =>
              runAction(
                () =>
                  services!.flashcards
                    .update(item.id, {
                      active: boolValue(values, "active"),
                      englishWord: text(values, "englishWord", true),
                      exampleSentence: nullableText(values, "exampleSentence"),
                      meaningVi: text(values, "meaningVi", true),
                      moduleId: requireModule(),
                      pronunciation: nullableText(values, "pronunciation"),
                    })
                    .then(() => undefined),
                loadContent,
              )
            }
            records={flashcards}
            subtitle={
              selectedModule
                ? `Mô-đun #${selectedModule.id}: ${selectedModule.title}`
                : "Vui lòng chọn mô-đun"
            }
            title="Quản lý Thẻ từ vựng (Flashcards)"
            working={working}
          />
          </>
        ) : null}

        {contentSubTab === "video" ? (
          <>
            <View style={styles.uploadBox}>
              <View style={styles.uploadHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadTitle}>Tải video từ máy tính lên hệ thống</Text>
                  <Text style={styles.uploadSubtitle}>
                    Hỗ trợ MP4, MOV, WebM (tối đa 1GB). Upload xong hệ thống tự điền URL & thời lượng thật để bạn bấm “+ Thêm mới”.
                  </Text>
                </View>
                {uploadedVideoUrl ? (
                  <View style={styles.uploadStatusPill}>
                    <Text style={styles.uploadStatusText}>Đã tải lên thành công ✓</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.uploadActionRow}>
                <Pressable
                  disabled={!services || uploadingVideo || working}
                  onPress={handleUploadVideoFile}
                  style={[styles.uploadButton, { flex: 1, marginTop: 0 }]}
                >
                  <Text style={styles.uploadButtonText}>
                    {uploadingVideo ? "Đang tải video lên..." : "Chọn file video & upload"}
                  </Text>
                </Pressable>

                {(uploadedVideoUrl || selectedVideoFile) ? (
                  <Pressable
                    onPress={() => {
                      setUploadedVideoUrl("");
                      setUploadedVideoDuration(null);
                      setSelectedVideoFile(null);
                    }}
                    style={styles.uploadClearBtn}
                  >
                    <Text style={styles.uploadClearText}>Xóa tệp đã chọn</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.uploadHint}>
                Tệp đã chọn: {selectedVideoFile?.name ?? "(chưa chọn tệp)"}
                {uploadedVideoDuration ? ` • Thời lượng phát hiện: ${uploadedVideoDuration}s` : ""}
              </Text>
              {uploadedVideoUrl ? (
                <Text numberOfLines={1} style={[styles.uploadHint, { color: colors.primaryDark, fontWeight: "700" }]}>
                  URL đã sẵn sàng: {uploadedVideoUrl}
                </Text>
              ) : null}
            </View>

            <AdminCrudPanel
              columns={[
                { label: "ID", render: (item) => String(item.id) },
                { label: "Title", render: (item) => item.title },
                {
                  label: "Duration",
                  render: (item) => String(item.durationSeconds ?? "-"),
                },
                { label: "Published", render: (item) => yesNo(item.published) },
              ]}
              fields={videoFields(modules, uploadedVideoUrl)}
              getInitialValues={(item?: VideoLessonApiItem) => ({
                description: item?.description ?? "",
                durationSeconds: String(item?.durationSeconds ?? uploadedVideoDuration ?? 300),
                free: item?.free ?? false,
                moduleId: String(item?.moduleId ?? selectedModuleId ?? ""),
                published: item?.published ?? true,
                sortOrder: String(item?.sortOrder ?? videos.length + 1),
                title: item?.title ?? "",
                videoUrl: item?.videoUrl ?? uploadedVideoUrl ?? "",
              })}
              getItemId={(item) => item.id}
              onCreate={(values) =>
                runAction(
                  () => {
                    const payload = {
                      description: nullableText(values, "description"),
                      free: boolValue(values, "free"),
                      moduleId: numberValue(values, "moduleId", true)!,
                      published: boolValue(values, "published"),
                      sortOrder: numberValue(values, "sortOrder", true)!,
                      title: text(values, "title", true),
                    };
                    if (selectedVideoFile && !uploadedVideoUrl) {
                      return services!.videos
                        .uploadAndCreate(selectedVideoFile, {
                          ...payload,
                          description: payload.description ?? null,
                        })
                        .then(() => {
                          setUploadedVideoUrl("");
                          setUploadedVideoDuration(null);
                          setSelectedVideoFile(null);
                        });
                    }

                    return services!.videos
                      .create({
                        ...payload,
                        durationSeconds: numberValue(values, "durationSeconds", true)!,
                        videoUrl: text(values, "videoUrl", true),
                      })
                      .then(() => {
                        setUploadedVideoUrl("");
                        setUploadedVideoDuration(null);
                        setSelectedVideoFile(null);
                      });
                  },
                  loadContent,
                )
              }
              onDelete={(item) =>
                confirmWeb(`Xóa video "${item.title}"?`)
                  ? runAction(
                      () => services!.videos.delete(item.id).then(() => undefined),
                      loadContent,
                    )
                  : Promise.resolve()
              }
              onRefresh={loadContent}
              onUpdate={(item, values) =>
                runAction(
                  () => {
                    const payload = {
                      description: nullableText(values, "description"),
                      durationSeconds: numberValue(
                        values,
                        "durationSeconds",
                        true,
                      )!,
                      free: boolValue(values, "free"),
                      moduleId: numberValue(values, "moduleId", true)!,
                      published: boolValue(values, "published"),
                      sortOrder: numberValue(values, "sortOrder", true)!,
                      title: text(values, "title", true),
                      videoUrl: text(values, "videoUrl", true),
                    };
                    return services!.videos.update(item.id, payload).then(() => undefined);
                  },
                  loadContent,
                )
              }
              records={videos}
              subtitle="Danh sách bài giảng video gắn với mô-đun đang chọn."
              title="Bài giảng Video"
              working={working}
            />
          </>
        ) : null}

        {contentSubTab === "practice" ? (
          <>
          <AdminCrudPanel
            columns={[
              { label: "ID", render: (item) => String(item.id) },
              { label: "Title", render: (item) => item.title },
              { label: "Type", render: (item) => item.setType },
              { label: "Published", render: (item) => yesNo(item.published) },
            ]}
            fields={practiceSetFields}
            getInitialValues={(item?: PracticeSetApiItem) => ({
              description: item?.description ?? "",
              durationMinutes: String(item?.durationMinutes ?? 20),
              partNo:
                item?.partNo && item.partNo >= 1 && item.partNo <= 7
                  ? String(item.partNo)
                  : "",
              published: item?.published ?? false,
              setType: item?.setType ?? "PRACTICE",
              targetScore: String(item?.targetScore ?? 300),
              title: item?.title ?? "",
            })}
            getItemId={(item) => item.id}
            onCreate={(values) =>
              runAction(
                () =>
                  services!.practiceSets
                    .create({
                      description: nullableText(values, "description"),
                      durationMinutes: numberValue(
                        values,
                        "durationMinutes",
                        true,
                      )!,
                      moduleId: requireModule(),
                      partNo: numberValue(values, "partNo"),
                      published: boolValue(values, "published"),
                      setType: text(values, "setType", true) as
                        | "PRACTICE"
                        | "PLACEMENT",
                      targetScore: numberValue(values, "targetScore"),
                      title: text(values, "title", true),
                    })
                    .then(() => undefined),
                loadContent,
              )
            }
            onDelete={(item) =>
              confirmWeb(`Xóa bộ thực hành "${item.title}"?`)
                ? runAction(
                    () =>
                      services!.practiceSets.delete(item.id).then(() => undefined),
                    loadContent,
                  )
                : Promise.resolve()
            }
            onRefresh={loadContent}
            onUpdate={(item, values) =>
              runAction(
                () =>
                  services!.practiceSets
                    .update(item.id, {
                      description: nullableText(values, "description"),
                      durationMinutes: numberValue(
                        values,
                        "durationMinutes",
                        true,
                      )!,
                      moduleId: requireModule(),
                      partNo: numberValue(values, "partNo"),
                      published: boolValue(values, "published"),
                      setType: text(values, "setType", true) as
                        | "PRACTICE"
                        | "PLACEMENT",
                      targetScore: numberValue(values, "targetScore"),
                      title: text(values, "title", true),
                    })
                    .then(() => undefined),
                loadContent,
              )
            }
            records={practiceSets}
            subtitle="Quản lý các bộ luyện tập & đánh giá đầu vào."
            title="Bộ bài tập thực hành"
            working={working}
          />
            <View style={styles.panelSection}>
              <View style={styles.bulkHeaderRow}>
                <View style={{ flex: 1, minWidth: 220 }}>
                  <Text style={styles.uploadTitle}>
                    Câu hỏi trong Bộ thực hành ({practiceSetQuestions.length})
                  </Text>
                  <Text style={styles.uploadSubtitle}>
                    {selectedPracticeSet
                      ? `Đang chọn bộ #${selectedPracticeSet.id}: "${selectedPracticeSet.title}". Chọn hàng loạt bằng checkbox hoặc đổi thứ tự nhanh.`
                      : "Tạo hoặc chọn một bộ bài tập phía trên để gán câu hỏi."}
                  </Text>
                </View>
                <Pressable
                  disabled={!selectedPracticeSetId || working}
                  onPress={openPracticeQuestionPicker}
                  style={[
                    styles.bulkOpenBtn,
                    (!selectedPracticeSetId || working) ? { opacity: 0.55 } : null,
                  ]}
                >
                  <Text style={styles.bulkOpenBtnText}>+ Chọn câu hỏi (Checkbox)</Text>
                </Pressable>
              </View>

              {practiceSets.length > 0 ? (
                <View style={[styles.chipRow, { marginTop: 10 }]}>
                  {practiceSets.map((ps) => {
                    const active = ps.id === selectedPracticeSetId;
                    return (
                      <Pressable
                        key={ps.id}
                        onPress={() => setSelectedPracticeSetId(ps.id)}
                        style={[styles.selectorChip, active ? styles.selectorChipActive : null]}
                      >
                        <Text style={[styles.selectorText, active ? styles.selectorTextActive : null]}>
                          #{ps.id} {ps.title}{ps.partNo ? ` (P${ps.partNo})` : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.assignedList}>
                {practiceSetQuestions.length === 0 ? (
                  <Text style={styles.uploadHint}>
                    Bộ bài tập này chưa có câu hỏi nào. Bấm “+ Chọn câu hỏi (Checkbox)” để gán nhanh nhiều câu cùng lúc.
                  </Text>
                ) : (
                  practiceSetQuestions.map((item, idx) => (
                    <View key={item.id} style={styles.assignedRow}>
                      <View style={styles.assignedOrderBadge}>
                        <Text style={styles.assignedOrderText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <View style={styles.partPill}>
                            <Text style={styles.partPillText}>
                              Part {item.question?.partNo ?? "-"}
                            </Text>
                          </View>
                          <Text style={styles.uploadHint}>#{item.questionId}</Text>
                        </View>
                        <Text numberOfLines={2} style={styles.assignedQuestionText}>
                          {item.question?.questionText ?? `Question #${item.questionId}`}
                        </Text>
                      </View>
                      <View style={styles.assignedActions}>
                        <Pressable
                          disabled={idx === 0 || working}
                          onPress={() => void movePracticeQuestion(idx, -1)}
                          style={[styles.miniIconBtn, idx === 0 ? { opacity: 0.4 } : null]}
                        >
                          <Text style={styles.miniIconBtnText}>↑</Text>
                        </Pressable>
                        <Pressable
                          disabled={idx === practiceSetQuestions.length - 1 || working}
                          onPress={() => void movePracticeQuestion(idx, 1)}
                          style={[
                            styles.miniIconBtn,
                            idx === practiceSetQuestions.length - 1 ? { opacity: 0.4 } : null,
                          ]}
                        >
                          <Text style={styles.miniIconBtnText}>↓</Text>
                        </Pressable>
                        <Pressable
                          disabled={working}
                          onPress={() => void removePracticeQuestion(item)}
                          style={[styles.miniIconBtn, styles.miniDangerBtn]}
                        >
                          <Text style={styles.miniDangerBtnText}>Gỡ</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>

            <QuestionPickerModal
              defaultPartFilter={
                selectedPracticeSet?.partNo && selectedPracticeSet.partNo >= 1 && selectedPracticeSet.partNo <= 7
                  ? String(selectedPracticeSet.partNo)
                  : "ALL"
              }
              initialSelectedIds={practiceSetQuestions.map((item) => item.questionId)}
              onClose={() => setShowPracticePickerModal(false)}
              onSave={savePracticeSetSelection}
              questions={questions}
              saving={savingPracticeQuestions}
              title={`Chọn câu hỏi cho “${selectedPracticeSet?.title ?? ""}”`}
              visible={showPracticePickerModal}
            />
          </>
        ) : null}
      </View>
    );
  };

  const renderGrammars = () => (
    <View style={styles.stack}>
      <View style={styles.grammarTopBar}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Tổng số chủ điểm</Text>
            <Text style={styles.summaryValue}>{grammars.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Đang hiển thị</Text>
            <Text style={styles.summaryValue}>
              {grammars.filter((item) => item.active).length}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Tạm ẩn</Text>
            <Text style={styles.summaryValue}>
              {grammars.filter((item) => !item.active).length}
            </Text>
          </View>
        </View>
        <View style={styles.grammarTopActions}>
          <Pressable
            disabled={working}
            onPress={reloadGrammars}
            style={styles.grammarGhostButton}
          >
            <Text style={styles.grammarGhostButtonText}>Tải lại dữ liệu</Text>
          </Pressable>
        </View>
      </View>

      <AdminCrudPanel
        columns={[
          { label: "Title", render: (item) => item.title },
          { label: "Status", render: (item) => (item.active ? "Active" : "Inactive") },
        ]}
        fields={grammarFields}
        getInitialValues={getGrammarInitialValues}
        getItemId={(item) => item.id}
        loading={loading}
        onCreate={(values) =>
          runAction(
            () =>
              services!.grammars
                .create({
                  active: boolValue(values, "active"),
                  content: text(values, "content", true),
                  example: nullableText(values, "example"),
                  tips: nullableText(values, "tips"),
                  title: text(values, "title", true),
                })
                .then(() => undefined),
            reloadGrammars,
          )
        }
        onDelete={(item) =>
          confirmWeb(`Xóa chủ điểm ngữ pháp "${item.title}"?`)
            ? runAction(
                () => services!.grammars.delete(item.id).then(() => undefined),
                reloadGrammars,
              )
            : Promise.resolve()
        }
        onRefresh={reloadGrammars}
        onUpdate={(item, values) =>
          runAction(
            () =>
              services!.grammars
                .update(item.id, {
                  active: boolValue(values, "active"),
                  content: text(values, "content", true),
                  example: nullableText(values, "example"),
                  tips: nullableText(values, "tips"),
                  title: text(values, "title", true),
                })
                .then(() => undefined),
            reloadGrammars,
          )
        }
        records={grammars}
        subtitle="Nhấn biểu tượng Sửa ở cột Thao tác để chỉnh sửa nội dung chi tiết."
        title="Bảng chủ điểm Ngữ pháp"
        working={working}
      />
    </View>
  );

  const renderQuestions = () => {
    const invalidPartCount = questions.filter(
      (q) => !q.partNo || q.partNo < 1 || q.partNo > 7,
    ).length;

    const filteredQuestions = questions.filter((q) => {
      if (questionPartFilter === "INVALID") {
        if (q.partNo && q.partNo >= 1 && q.partNo <= 7) return false;
      } else if (questionPartFilter !== "ALL") {
        if (String(q.partNo ?? "") !== questionPartFilter) return false;
      }

      if (questionSourceFilter !== "ALL") {
        if ((q.sourceType ?? "INTERNAL").toUpperCase() !== questionSourceFilter) return false;
      }
      return true;
    });

    const dynamicQuestionFields = buildQuestionFields(async (values) => {
      if (!services) return null;
      const correctLabel = String(values.correctLabel ?? "A").trim() || "A";
      const res = await services.questions.explainDraft({
        correctLabel,
        explanation: nullableText(values, "explanation"),
        optionA: String(values.optionA ?? "").trim(),
        optionB: String(values.optionB ?? "").trim(),
        optionC: String(values.optionC ?? "").trim(),
        optionD: String(values.optionD ?? "").trim(),
        partNo: numberValue(values, "partNo"),
        passageText: nullableText(values, "passageText"),
        questionText: String(values.questionText ?? "").trim(),
        transcript: nullableText(values, "transcript"),
      });
      if (!res.data?.explanation) return null;
      return { explanation: res.data.explanation };
    });

    return (
      <View style={styles.stack}>
        <View style={styles.uploadBox}>
          <View style={styles.uploadHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.uploadTitle}>Import câu hỏi TOEIC (Excel / Word / PDF)</Text>
              <Text style={styles.uploadSubtitle}>
                Hỗ trợ .xlsx, .xls, .docx, .doc, .pdf, .csv, .txt. Hoặc dùng dán JSON/CSV nhanh nếu đã chuẩn bị sẵn.
              </Text>
            </View>
            {questionImportSummary ? (
              <View style={styles.uploadStatusPill}>
                <Text style={styles.uploadStatusText}>Import thành công ✓</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.uploadActionRow}>
            <Pressable
              disabled={!services || importingQuestions || working}
              onPress={handleImportQuestionsFile}
              style={[styles.uploadButton, { marginTop: 0 }]}
            >
              <Text style={styles.uploadButtonText}>
                {importingQuestions
                  ? "Đang đọc file & tạo câu hỏi..."
                  : "Chọn file Excel / Word / PDF & Import"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowBulkImportModal(true)}
              style={styles.uploadClearBtn}
            >
              <Text style={styles.uploadClearText}>Dán JSON / CSV</Text>
            </Pressable>

            <View style={styles.importToggleRow}>
              <Switch
                onValueChange={setQuestionImportAutoExplainAi}
                thumbColor={colors.surface}
                trackColor={{ false: "#CBD5E1", true: colors.primary }}
                value={questionImportAutoExplainAi}
              />
              <Text style={styles.importToggleText}>
                AI tự tạo giải thích nếu thiếu
              </Text>
            </View>
          </View>

          {questionImportSummary ? (
            <Text style={[styles.uploadHint, { color: colors.primaryDark, fontWeight: "700" }]}>
              {questionImportSummary}
            </Text>
          ) : null}
        </View>

        <Modal
          animationType="fade"
          onRequestClose={() => setShowBulkImportModal(false)}
          transparent
          visible={showBulkImportModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalPanel}>
              <Text style={styles.uploadTitle}>Bulk Import Question Bank (JSON / CSV)</Text>
              <Text style={styles.uploadSubtitle}>
                Hỗ trợ dán mảng JSON câu hỏi hoặc CSV có header partNo,questionText,optionA..D,correctLabel.
              </Text>
              <View style={styles.templateRow}>
                <Pressable
                  onPress={() => setBulkImportRaw(SAMPLE_BULK_JSON)}
                  style={styles.templateBtn}
                >
                  <Text style={styles.templateBtnText}>Dán mẫu JSON</Text>
                </Pressable>
                <Pressable
                  onPress={() => setBulkImportRaw(SAMPLE_BULK_CSV)}
                  style={styles.templateBtn}
                >
                  <Text style={styles.templateBtnText}>Dán mẫu CSV</Text>
                </Pressable>
              </View>
              <TextInput
                multiline
                onChangeText={setBulkImportRaw}
                placeholder="Dán JSON hoặc CSV tại đây..."
                placeholderTextColor={colors.textMuted}
                style={styles.bulkInput}
                textAlignVertical="top"
                value={bulkImportRaw}
              />
              <View style={styles.templateRow}>
                <Pressable
                  onPress={() => setShowBulkImportModal(false)}
                  style={styles.modalSecondaryBtn}
                >
                  <Text style={styles.modalSecondaryBtnText}>Đóng</Text>
                </Pressable>
                <Pressable
                  disabled={bulkImporting}
                  onPress={() => void handleBulkImportQuestions()}
                  style={styles.bulkOpenBtn}
                >
                  <Text style={styles.bulkOpenBtnText}>
                    {bulkImporting ? "Đang import..." : "Import vào Question Bank"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <AdminCrudPanel
          columns={[
            { label: "ID", render: (item) => String(item.id) },
            {
              label: "Part",
              render: (item) =>
                item.partNo && item.partNo >= 1 && item.partNo <= 7
                  ? `Part ${item.partNo}`
                  : `⚠️ Part ${item.partNo ?? "-"}`,
            },
            {
              label: "Question",
              render: (item) => {
                const correct = item.options?.find((o) => o.correct)?.optionLabel;
                const tags = [
                  correct ? `Đáp án ${correct}` : null,
                  item.audioUrl ? "Audio" : null,
                  item.imageUrl ? "Ảnh" : null,
                  item.passageText ? "Đoạn văn" : null,
                ].filter(Boolean);
                return tags.length > 0
                  ? `${item.questionText} [${tags.join(" · ")}]`
                  : item.questionText;
              },
            },
            { label: "Source", render: (item) => item.sourceType ?? "-" },
          ]}
          fields={dynamicQuestionFields}
          filterBar={
            <View style={styles.filterBarStack}>
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => setQuestionPartFilter("ALL")}
                  style={[
                    styles.selectorChip,
                    questionPartFilter === "ALL" ? styles.selectorChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectorText,
                      questionPartFilter === "ALL" ? styles.selectorTextActive : null,
                    ]}
                  >
                    Tất cả ({questions.length})
                  </Text>
                </Pressable>
                {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                  const key = String(p);
                  const count = questions.filter((q) => q.partNo === p).length;
                  const active = questionPartFilter === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setQuestionPartFilter(key)}
                      style={[styles.selectorChip, active ? styles.selectorChipActive : null]}
                    >
                      <Text style={[styles.selectorText, active ? styles.selectorTextActive : null]}>
                        Part {p} ({count})
                      </Text>
                    </Pressable>
                  );
                })}
                {invalidPartCount > 0 ? (
                  <Pressable
                    onPress={() => setQuestionPartFilter("INVALID")}
                    style={[
                      styles.selectorChip,
                      { borderColor: "#FCA5A5" },
                      questionPartFilter === "INVALID"
                        ? { backgroundColor: colors.danger, borderColor: colors.danger }
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectorText,
                        { color: questionPartFilter === "INVALID" ? colors.onPrimary : colors.danger },
                      ]}
                    >
                      Part lỗi ⚠️ ({invalidPartCount})
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.chipRow}>
                {["ALL", "ETS", "HACKER", "INTERNAL"].map((src) => {
                  const active = questionSourceFilter === src;
                  return (
                    <Pressable
                      key={src}
                      onPress={() => setQuestionSourceFilter(src)}
                      style={[styles.selectorChip, active ? styles.selectorChipActive : null]}
                    >
                      <Text style={[styles.selectorText, active ? styles.selectorTextActive : null]}>
                        {src === "ALL" ? "Mọi nguồn" : src}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          getInitialValues={(item?: QuestionApiItem) => {
            const option = (label: string) =>
              item?.options?.find((entry) => entry.optionLabel === label);
            const correct =
              item?.options?.find((entry) => entry.correct)?.optionLabel ?? "A";
            const validPart =
              item?.partNo && item.partNo >= 1 && item.partNo <= 7
                ? item.partNo
                : 5;
            return {
              audioUrl: item?.audioUrl ?? "",
              correctLabel: correct,
              difficultyLevel: item?.difficultyLevel ?? "BEGINNER",
              explanation: item?.explanation ?? "",
              imageUrl: item?.imageUrl ?? "",
              optionA: option("A")?.optionText ?? "",
              optionB: option("B")?.optionText ?? "",
              optionC: option("C")?.optionText ?? "",
              optionD: option("D")?.optionText ?? "",
              partNo: String(validPart),
              passageText: item?.passageText ?? "",
              questionGroupCode: item?.questionGroupCode ?? "",
              questionText: item?.questionText ?? "",
              sourceType: item?.sourceType ?? "INTERNAL",
              sourceYear: String(item?.sourceYear ?? new Date().getFullYear()),
              transcript: item?.transcript ?? "",
            };
          }}
          getItemId={(item) => item.id}
          onCreate={(values) =>
            runAction(
              () =>
                services!.questions
                  .create(questionPayload(values))
                  .then(() => undefined),
              loadBaseData,
            )
          }
          onDelete={(item) =>
            confirmWeb(`Xóa câu hỏi #${item.id}?`)
              ? runAction(
                  () => services!.questions.delete(item.id).then(() => undefined),
                  loadBaseData,
                )
              : Promise.resolve()
          }
          onRefresh={loadBaseData}
          onUpdate={(item, values) =>
            runAction(
              () =>
                services!.questions
                  .update(item.id, questionPayload(values))
                  .then(() => undefined),
              loadBaseData,
            )
          }
          records={filteredQuestions}
          subtitle="Kho câu hỏi Part 1–7 dùng chung (việc gán vào Bộ thực hành đã chuyển sang Nội dung Mô-đun → Bộ bài tập)."
          title="Ngân hàng câu hỏi TOEIC"
          working={working}
        />
      </View>
    );
  };

  const renderPermissions = () => (
    <AdminCrudPanel
      columns={[
        { label: "ID", render: (item) => String(item.id) },
        { label: "Code", render: (item) => item.code },
        { label: "Role", render: (item) => item.role },
      ]}
      fields={[]}
      getInitialValues={() => ({})}
      getItemId={(item) => item.id}
      loading={loading}
      onRefresh={loadBaseData}
      records={permissions}
      subtitle="Danh sách quyền hạn và vai trò hiện hành trong hệ thống."
      title="Phân quyền hệ thống"
      working={working}
    />
  );

  const renderUsers = () => {
    const query = userSearch.trim().toLowerCase();
    const filteredUsers = query
      ? adminUsers.filter(
          (u) =>
            u.email.toLowerCase().includes(query) ||
            (u.fullName ?? "").toLowerCase().includes(query) ||
            u.role.toLowerCase().includes(query),
        )
      : adminUsers;

    return (
      <View style={styles.stack}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Tổng người dùng</Text>
            <Text style={styles.summaryValue}>{analyticsOverview?.totalUsers ?? adminUsers.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Đang hoạt động</Text>
            <Text style={styles.summaryValue}>{analyticsOverview?.activeUsers ?? 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Premium</Text>
            <Text style={styles.summaryValue}>{analyticsOverview?.premiumUsers ?? 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Có Streak</Text>
            <Text style={styles.summaryValue}>{analyticsOverview?.usersWithStreak ?? 0}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Câu hỏi Bank</Text>
            <Text style={styles.summaryValue}>{analyticsOverview?.totalQuestions ?? questions.length}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Đề thi (Published/All)</Text>
            <Text style={styles.summaryValue}>
              {analyticsOverview?.publishedTests ?? 0}/{analyticsOverview?.totalTests ?? tests.length}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Lượt làm bài</Text>
            <Text style={styles.summaryValue}>{analyticsOverview?.totalTestAttempts ?? 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Điểm TB TOEIC</Text>
            <Text style={styles.summaryValue}>
              {analyticsOverview ? `${Math.round(analyticsOverview.averageToeicScore)} (${analyticsOverview.averageAccuracyPercent.toFixed(1)}%)` : "--"}
            </Text>
          </View>
        </View>

        <View style={styles.bulkCard}>
          <View style={styles.usersToolbar}>
            <TextInput
              onChangeText={setUserSearch}
              placeholder="Tìm theo email, tên hoặc role..."
              placeholderTextColor={colors.textMuted}
              style={styles.userSearchInput}
              value={userSearch}
            />
            <Pressable onPress={() => void loadUsersAndAnalytics()} style={styles.bulkOpenBtn}>
              <Text style={styles.bulkOpenBtnText}>Làm mới</Text>
            </Pressable>
          </View>

          <View style={styles.usersTable}>
            {filteredUsers.map((user) => {
              const isSelf = user.id === auth.user?.id;
              const isBlocked = user.status === "BLOCKED";
              return (
                <View key={user.id} style={styles.userRowCard}>
                  <View style={styles.userInfoCol}>
                    <View style={styles.userTitleRow}>
                      <Text style={styles.userNameText}>
                        #{user.id} {user.fullName || user.email}
                      </Text>
                      <VerifiedBadge size={16} verified={user.verified} />
                      <View
                        style={[
                          styles.statusPill,
                          isBlocked ? styles.statusPillBlocked : styles.statusPillActive,
                        ]}
                      >
                        <Text style={styles.statusPillText}>{user.status}</Text>
                      </View>
                      {user.premium ? (
                        <View style={styles.premiumPill}>
                          <Text style={styles.premiumPillText}>PREMIUM</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.uploadSubtitle}>
                      {user.email} • Role: {user.role} • Level: {user.currentLevel || "--"} • Target:{" "}
                      {user.targetScore ?? "--"}
                    </Text>
                  </View>

                  <View style={styles.userActionsCol}>
                    <Pressable
                      disabled={working || isSelf}
                      onPress={() =>
                        void runAction(
                          () =>
                            services!.analytics
                              .updateUserStatus(user.id, isBlocked ? "ACTIVE" : "BLOCKED")
                              .then(() => undefined),
                          loadUsersAndAnalytics,
                        )
                      }
                      style={[
                        styles.userActionBtn,
                        isBlocked ? styles.userUnlockBtn : styles.userBlockBtn,
                        isSelf ? { opacity: 0.45 } : null,
                      ]}
                    >
                      <Text style={styles.userActionBtnText}>
                        {isSelf ? "Tài khoản của bạn" : isBlocked ? "Mở khóa" : "Khóa"}
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={working}
                      onPress={() =>
                        void runAction(
                          () =>
                            services!.analytics
                              .updateUserPremium(user.id, !user.premium)
                              .then(() => undefined),
                          loadUsersAndAnalytics,
                        )
                      }
                      style={[styles.userActionBtn, styles.userPremiumBtn]}
                    >
                      <Text style={styles.userActionBtnText}>
                        {user.premium ? "Hủy Premium" : "Cấp Premium"}
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={working}
                      onPress={() =>
                        void runAction(
                          () =>
                            services!.analytics
                              .updateUserVerified(user.id, !user.verified)
                              .then(() => undefined),
                          loadUsersAndAnalytics,
                        )
                      }
                      style={[
                        styles.userActionBtn,
                        user.verified ? styles.userVerifiedRevokeBtn : styles.userVerifiedBtn,
                      ]}
                    >
                      <Text style={styles.userActionBtnText}>
                        {user.verified ? "Gỡ tích xanh" : "Cấp tích xanh"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            {filteredUsers.length === 0 ? (
              <Text style={styles.uploadSubtitle}>Không có người dùng nào phù hợp.</Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderTests = () => {
    const validTestTypeValues = new Set(testTypeOptions.map((o) => o.value));
    return (
      <View style={styles.stack}>
        <View style={styles.contentTabRow}>
          <Pressable
            onPress={() => setTestsSubTab("list")}
            style={[
              styles.contentTabBtn,
              testsSubTab === "list" ? styles.contentTabBtnActive : null,
            ]}
          >
            <Text
              style={[
                styles.contentTabText,
                testsSubTab === "list" ? styles.contentTabTextActive : null,
              ]}
            >
              {`1. Danh sách Đề thi (${tests.length})`}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTestsSubTab("builder")}
            style={[
              styles.contentTabBtn,
              testsSubTab === "builder" ? styles.contentTabBtnActive : null,
            ]}
          >
            <Text
              style={[
                styles.contentTabText,
                testsSubTab === "builder" ? styles.contentTabTextActive : null,
              ]}
            >
              {selectedTest
                ? `2. Cấu hình Part & Câu hỏi (#${selectedTest.id})`
                : "2. Cấu hình Part & Câu hỏi"}
            </Text>
          </Pressable>
        </View>

        {testsSubTab === "list" ? (
          <>
            <AdminCrudPanel
              columns={[
                { label: "ID", render: (item) => String(item.id), width: 70 },
                { label: "Title", render: (item) => item.title },
                { label: "Type", render: (item) => item.testType, width: 140 },
                { label: "Duration", render: (item) => `${item.totalDurationMinutes}m`, width: 100 },
                { label: "Published", render: (item) => yesNo(item.published), width: 105 },
              ]}
              fields={testFields}
              getInitialValues={(item?: TestApiItem) => ({
                title: item?.title ?? "",
                testType:
                  item?.testType && validTestTypeValues.has(item.testType)
                    ? item.testType
                    : "FULL_TEST",
                totalDurationMinutes: String(item?.totalDurationMinutes ?? 120),
                targetScore: String(item?.targetScore ?? 500),
                description: item?.description ?? "",
                published: item?.published ?? false,
              })}
              getItemId={(item) => item.id}
              onCreate={(values) =>
                runAction(
                  () =>
                    services!.tests
                      .create({
                        title: text(values, "title", true),
                        testType: text(values, "testType", true),
                        totalDurationMinutes: numberValue(values, "totalDurationMinutes", true)!,
                        targetScore: numberValue(values, "targetScore", true)!,
                        description: text(values, "description"),
                        published: boolValue(values, "published"),
                      })
                      .then((res) => {
                        if (res.data?.id) {
                          setSelectedTestId(res.data.id);
                          setTestsSubTab("builder");
                        }
                      }),
                  loadTests,
                )
              }
              onDelete={(item) =>
                confirmWeb(`Xóa đề thi "${item.title}"?`)
                  ? runAction(
                      () => services!.tests.delete(item.id).then(() => undefined),
                      loadTests,
                    )
                  : Promise.resolve()
              }
              onRefresh={loadTests}
              onUpdate={(item, values) =>
                runAction(
                  () =>
                    services!.tests
                      .update(item.id, {
                        title: text(values, "title", true),
                        testType: text(values, "testType", true),
                        totalDurationMinutes: numberValue(values, "totalDurationMinutes", true)!,
                        targetScore: numberValue(values, "targetScore", true)!,
                        description: text(values, "description"),
                        published: boolValue(values, "published"),
                      })
                      .then(() => undefined),
                  loadTests,
                )
              }
              records={tests}
              subtitle="Bước 1: Tạo đề thi rồi bấm vào đề bên dưới để soạn Part & gán câu hỏi."
              title="Quản lý Đề thi TOEIC"
              working={working}
            />

            {tests.length > 0 ? (
              <View style={styles.infoFlow}>
                <Text style={styles.infoFlowTitle}>
                  Chọn nhanh đề thi để soạn Part & gán câu hỏi →
                </Text>
                <View style={[styles.chipRow, { marginTop: 10 }]}>
                  {tests.map((t) => {
                    const active = t.id === selectedTestId;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => {
                          setSelectedTestId(t.id);
                          setTestsSubTab("builder");
                        }}
                        style={[styles.selectorChip, active ? styles.selectorChipActive : null]}
                      >
                        <Text style={[styles.selectorText, active ? styles.selectorTextActive : null]}>
                          {`#${t.id} ${t.title} (${t.testType}) →`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.infoFlow}>
              <View style={styles.bulkHeaderRow}>
                <View style={{ flex: 1, minWidth: 240, gap: 4 }}>
                  <Text style={styles.infoFlowTitle}>
                    {selectedTest
                      ? `Đang cấu hình Đề #${selectedTest.id}: ${selectedTest.title}`
                      : "Chưa chọn đề thi"}
                  </Text>
                  <Text style={styles.infoFlowText}>
                    {selectedTest
                      ? `Loại đề: ${selectedTest.testType} • Tổng thời gian: ${selectedTest.totalDurationMinutes} phút • Target: ${selectedTest.targetScore}`
                      : "Vui lòng chọn hoặc tạo mới một đề thi ở tab Danh sách Đề thi."}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {selectedTestId ? (
                    <Pressable
                      disabled={working}
                      onPress={() =>
                        void runAction(
                          () => services!.tests.initStandardParts(selectedTestId).then(() => undefined),
                          loadTestParts,
                        )
                      }
                      style={styles.bulkOpenBtn}
                    >
                      <Text style={styles.bulkOpenBtnText}>
                        ⚡ Tạo nhanh Part chuẩn TOEIC
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => setTestsSubTab("list")}
                    style={styles.selectorChip}
                  >
                    <Text style={styles.selectorTextActive}>← Quay lại Danh sách Đề</Text>
                  </Pressable>
                </View>
              </View>
              {tests.length > 1 ? (
                <View style={[styles.chipRow, { marginTop: 10 }]}>
                  {tests.map((t) => {
                    const active = t.id === selectedTestId;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => setSelectedTestId(t.id)}
                        style={[styles.selectorChip, active ? styles.selectorChipActive : null]}
                      >
                        <Text style={[styles.selectorText, active ? styles.selectorTextActive : null]}>
                          {`#${t.id} ${t.title}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <AdminCrudPanel
              columns={[
                { label: "Part", render: (item) => `Part ${item.partNumber}`, width: 92 },
                { label: "Name", render: (item) => item.partName, width: 230 },
                { label: "Section", render: (item) => item.partSection, width: 120 },
                { label: "Duration", render: (item) => `${item.durationMinutes}m`, width: 96 },
                { label: "Questions", render: (item) => `${item.questionCount} câu`, width: 105 },
              ]}
              fields={testPartFields}
              getInitialValues={(item?: TestPartApiItem) => {
                const nextPartNo = item?.partNumber && item.partNumber >= 1 && item.partNumber <= 7
                  ? item.partNumber
                  : Math.min(7, testParts.length + 1);
                return {
                  partName: item?.partName ?? "",
                  partNumber: String(nextPartNo),
                  partSection: item?.partSection ?? (nextPartNo <= 4 ? "LISTENING" : "READING"),
                  sortOrder: String(item?.sortOrder ?? nextPartNo),
                  durationMinutes: String(item?.durationMinutes ?? (nextPartNo <= 4 ? 10 : 15)),
                  description: item?.description ?? "",
                };
              }}
              getItemId={(item) => item.id}
              onCreate={(values) =>
                runAction(
                  () => {
                    const partNum = numberValue(values, "partNumber", true)!;
                    const defaultName = `Part ${partNum}`;
                    return services!.tests
                      .createPart(selectedTestId!, {
                        partName: text(values, "partName") || defaultName,
                        partNumber: partNum,
                        partSection: text(values, "partSection") || (partNum <= 4 ? "LISTENING" : "READING"),
                        sortOrder: numberValue(values, "sortOrder", true)!,
                        durationMinutes: numberValue(values, "durationMinutes", true)!,
                        description: text(values, "description"),
                      })
                      .then((res) => {
                        if (res.data?.id) setSelectedTestPartId(res.data.id);
                      });
                  },
                  loadTestParts,
                )
              }
              onDelete={(item) =>
                confirmWeb(`Xóa "${item.partName}"?`)
                  ? runAction(
                      () => services!.tests.deletePart(item.id).then(() => undefined),
                      loadTestParts,
                    )
                  : Promise.resolve()
              }
              onRefresh={loadTestParts}
              onUpdate={(item, values) =>
                runAction(
                  () => {
                    const partNum = numberValue(values, "partNumber", true)!;
                    return services!.tests
                      .updatePart(item.id, {
                        partName: text(values, "partName") || `Part ${partNum}`,
                        partNumber: partNum,
                        partSection: text(values, "partSection") || (partNum <= 4 ? "LISTENING" : "READING"),
                        sortOrder: numberValue(values, "sortOrder", true)!,
                        durationMinutes: numberValue(values, "durationMinutes", true)!,
                        description: text(values, "description"),
                      })
                      .then(() => undefined);
                  },
                  loadTestParts,
                )
              }
              records={testParts}
              subtitle="Có thể bấm “⚡ Tạo nhanh Part chuẩn TOEIC” phía trên hoặc tự thêm từng Part."
              title="Danh sách Part trong đề thi"
              working={working}
            />

            <View style={styles.panelSection}>
              <View style={styles.bulkHeaderRow}>
                <View style={{ flex: 1, minWidth: 220 }}>
                  <Text style={styles.uploadTitle}>
                    {selectedTestPart
                      ? `Câu hỏi trong Part ${selectedTestPart.partNumber}: ${selectedTestPart.partName} (${testPartQuestions.length})`
                      : "Chọn một Part bên dưới để gán câu hỏi"}
                  </Text>
                  <Text style={styles.uploadSubtitle}>
                    Chọn hàng loạt câu hỏi bằng checkbox (tự lọc theo đúng Part) và sắp xếp thứ tự nhanh.
                  </Text>
                </View>
                <Pressable
                  disabled={!selectedTestPartId || working}
                  onPress={() => setShowTestPartPickerModal(true)}
                  style={[
                    styles.bulkOpenBtn,
                    (!selectedTestPartId || working) ? { opacity: 0.55 } : null,
                  ]}
                >
                  <Text style={styles.bulkOpenBtnText}>+ Chọn câu hỏi (Checkbox)</Text>
                </Pressable>
              </View>

              {testParts.length > 0 ? (
                <View style={[styles.chipRow, { marginTop: 10 }]}>
                  {testParts.map((part) => {
                    const active = part.id === selectedTestPartId;
                    return (
                      <Pressable
                        key={part.id}
                        onPress={() => setSelectedTestPartId(part.id)}
                        style={[styles.selectorChip, active ? styles.selectorChipActive : null]}
                      >
                        <Text style={[styles.selectorText, active ? styles.selectorTextActive : null]}>
                          {`Part ${part.partNumber}: ${part.partName} (${part.questionCount} câu)`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.uploadHint}>
                  Đề thi này chưa có Part nào. Bấm “⚡ Tạo nhanh Part chuẩn TOEIC” để tạo tự động.
                </Text>
              )}

              <View style={styles.assignedList}>
                {selectedTestPart && testPartQuestions.length === 0 ? (
                  <Text style={styles.uploadHint}>
                    Part này chưa có câu hỏi nào. Bấm “+ Chọn câu hỏi (Checkbox)” để thêm nhiều câu cùng lúc.
                  </Text>
                ) : null}
                {testPartQuestions.map((item, idx) => (
                  <View key={item.id} style={styles.assignedRow}>
                    <View style={styles.assignedOrderBadge}>
                      <Text style={styles.assignedOrderText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <View style={styles.partPill}>
                          <Text style={styles.partPillText}>
                            {`Part ${item.partNo ?? "-"}`}
                          </Text>
                        </View>
                        <Text style={styles.uploadHint}>#{item.questionId}</Text>
                      </View>
                      <Text numberOfLines={2} style={styles.assignedQuestionText}>
                        {item.questionText || `Question #${item.questionId}`}
                      </Text>
                    </View>
                    <View style={styles.assignedActions}>
                      <Pressable
                        disabled={idx === 0 || working}
                        onPress={() => void moveTestPartQuestion(idx, -1)}
                        style={[styles.miniIconBtn, idx === 0 ? { opacity: 0.4 } : null]}
                      >
                        <Text style={styles.miniIconBtnText}>↑</Text>
                      </Pressable>
                      <Pressable
                        disabled={idx === testPartQuestions.length - 1 || working}
                        onPress={() => void moveTestPartQuestion(idx, 1)}
                        style={[
                          styles.miniIconBtn,
                          idx === testPartQuestions.length - 1 ? { opacity: 0.4 } : null,
                        ]}
                      >
                        <Text style={styles.miniIconBtnText}>↓</Text>
                      </Pressable>
                      <Pressable
                        disabled={working}
                        onPress={() => void removeTestPartQuestion(item)}
                        style={[styles.miniIconBtn, styles.miniDangerBtn]}
                      >
                        <Text style={styles.miniDangerBtnText}>Gỡ</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <QuestionPickerModal
              defaultPartFilter={
                selectedTestPart?.partNumber && selectedTestPart.partNumber >= 1 && selectedTestPart.partNumber <= 7
                  ? String(selectedTestPart.partNumber)
                  : "ALL"
              }
              initialSelectedIds={testPartQuestions.map((item) => item.questionId)}
              onClose={() => setShowTestPartPickerModal(false)}
              onSave={saveTestPartSelection}
              questions={questions}
              saving={savingTestPartQuestions}
              title={
                selectedTestPart
                  ? `Chọn câu hỏi cho Part ${selectedTestPart.partNumber}: “${selectedTestPart.partName}”`
                  : "Chọn câu hỏi cho Part"
              }
              visible={showTestPartPickerModal}
            />
          </>
        )}
      </View>
    );
  };

  const renderActiveSection = () => {
    if (activeSection === "video-library") {
      return <AdminVideoLibraryPanel accessToken={auth.accessToken!} />;
    }
    if (activeSection === "paths") return renderPaths();
    if (activeSection === "grammars") return renderGrammars();
    if (activeSection === "content") return renderContent();
    if (activeSection === "questions") return renderQuestions();
    if (activeSection === "tests") return renderTests();
    if (activeSection === "users") return renderUsers();
    return renderPermissions();
  };

  return (
    <AdminShell>
      <AdminTopBar
        adminName={auth.user?.fullName ?? "Admin"}
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      />
      <View style={styles.layout}>
        <AdminSidebar
          activeItemId={activeSection}
          items={visibleSidebarItems}
          onSelect={(id) => setActiveSection(id as AdminSectionKey)}
        />
        <View style={styles.mainPanel}>
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderCopy}>
              <Text style={styles.pageEyebrow}>TOEIC Trainer Workspace</Text>
              <Text style={styles.pageTitle}>{activeSectionLabel}</Text>
            </View>
            <View style={styles.metricRow}>
              <View style={[styles.metricCard, { borderTopColor: colors.primary }]}>
                <Text style={styles.metricValue}>{paths.length}</Text>
                <Text style={styles.metricLabel}>Lộ trình</Text>
              </View>
              <View style={[styles.metricCard, { borderTopColor: colors.accent }]}>
                <Text style={styles.metricValue}>{modules.length}</Text>
                <Text style={styles.metricLabel}>Mô-đun</Text>
              </View>
              <View style={[styles.metricCard, { borderTopColor: '#7C3AED' }]}>
                <Text style={styles.metricValue}>{questions.length}</Text>
                <Text style={styles.metricLabel}>Câu hỏi</Text>
              </View>
              <View style={[styles.metricCard, { borderTopColor: colors.warning }]}>
                <Text style={styles.metricValue}>{grammars.length}</Text>
                <Text style={styles.metricLabel}>Ngữ pháp</Text>
              </View>
            </View>
          </View>
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
          <ScrollView style={styles.contentScroller}>
            {renderActiveSection()}
          </ScrollView>
        </View>
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  contentScroller: {
    flex: 1,
  },
  errorText: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#FECACA",
    borderRadius: 10,
    borderWidth: 1,
    color: colors.danger,
    fontSize: 13.5,
    fontWeight: "600",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  layout: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
  },
  mainPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    padding: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  metricCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 12,
    borderTopColor: colors.primary,
    borderTopWidth: 3,
    borderWidth: 1,
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  mobileNotice: {
    color: colors.text,
    fontSize: 16,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  selectorBlock: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  selectorChip: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectorChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  selectorEmpty: {
    color: colors.textMuted,
    fontSize: 13,
  },
  selectorLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  selectorRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  selectorText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  selectorTextActive: {
    color: colors.primaryDark,
    fontWeight: "800",
  },
  detailCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  detailHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  detailTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  detailSubtitle: {
    color: colors.textMuted,
    fontSize: 12.5,
    marginTop: 2,
  },
  detailButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  detailButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  detailItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minWidth: 220,
    padding: spacing.md,
  },
  detailItemWide: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: "100%",
    padding: spacing.md,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "600",
    lineHeight: 20,
  },
  grammarWorkspace: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    alignItems: "flex-start",
  },
  grammarTopBar: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  grammarTopActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginLeft: "auto",
  },
  grammarListCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: 320,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 380,
    padding: spacing.md,
  },
  grammarDetailCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexBasis: 560,
    flexGrow: 999,
    flexShrink: 1,
    minHeight: 520,
    minWidth: 0,
    padding: spacing.lg,
  },
  grammarTableWrap: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
  },
  grammarTableScroller: {
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  grammarTable: {
    backgroundColor: colors.surface,
    minWidth: 1480,
  },
  grammarTableHeaderRow: {
    backgroundColor: colors.surfaceAlt,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  grammarTableDataRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  grammarTableDataRowActive: {
    backgroundColor: colors.primarySoft,
  },
  grammarTableEmptyRow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 88,
    paddingHorizontal: spacing.md,
  },
  grammarHeaderCell: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    paddingRight: spacing.md,
    textTransform: "uppercase",
  },
  grammarBodyCell: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 22,
    paddingRight: spacing.md,
  },
  grammarIdCol: {
    width: 72,
  },
  grammarTitleCol: {
    width: 220,
  },
  grammarContentCol: {
    width: 360,
  },
  grammarTipsCol: {
    width: 280,
  },
  grammarExampleCol: {
    width: 280,
  },
  grammarStatusCol: {
    width: 120,
  },
  grammarActionsCol: {
    width: 180,
  },
  grammarStatusCellWrap: {
    alignItems: "flex-start",
    justifyContent: "center",
  },
  grammarActionsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  grammarMiniPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 12,
  },
  grammarMiniPrimaryButtonText: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  grammarBlockHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  grammarBlockTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  grammarBlockSubtitle: {
    color: colors.textMuted,
    fontSize: 12.5,
    marginTop: 4,
  },
  grammarHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "flex-start",
  },
  grammarGhostButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  grammarGhostButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  grammarPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  grammarPrimaryButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  grammarDangerButton: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: "#FECACA",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  grammarDangerButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  grammarList: {
    gap: spacing.sm,
  },
  grammarListItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
  },
  grammarListItemActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  grammarListItemTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  grammarListItemTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    paddingRight: spacing.sm,
  },
  grammarListItemExcerpt: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  grammarStatusBadge: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: "uppercase",
  },
  grammarStatusBadgeOn: {
    backgroundColor: colors.successSoft,
    color: "#15803D",
  },
  grammarStatusBadgeOff: {
    backgroundColor: colors.surfaceAlt,
    color: colors.textMuted,
  },
  grammarHero: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  grammarHeroMain: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexBasis: 380,
    minWidth: 0,
    padding: spacing.lg,
  },
  grammarHeroTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  grammarHeroContent: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 24,
  },
  grammarMetaCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 220,
    flexGrow: 1,
    justifyContent: "center",
    minWidth: 220,
    padding: spacing.lg,
  },
  grammarMetaLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  grammarMetaValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  grammarInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  grammarInfoCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minWidth: 260,
    padding: spacing.lg,
  },
  grammarMetaList: {
    gap: spacing.sm,
  },
  grammarMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  grammarMetaRowLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  grammarMetaRowValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  grammarInfoLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  grammarInfoValue: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 24,
  },
  uploadBox: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: spacing.md,
  },
  uploadHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  uploadActionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  uploadStatusPill: {
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  uploadStatusText: {
    color: "#15803D",
    fontSize: 12,
    fontWeight: "800",
  },
  uploadClearBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  uploadClearText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  uploadButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginTop: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  uploadButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  uploadHint: {
    color: colors.textMuted,
    fontSize: 12.5,
  },
  importToggleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  importToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  uploadSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  uploadTitle: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: "800",
  },
  locationChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  locationChip: {
    backgroundColor: colors.surface,
    borderColor: "#BFDBFE",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  locationChipText: {
    color: colors.primaryDark,
    fontSize: 11.5,
    fontWeight: "700",
  },
  locationToggleChip: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  locationToggleText: {
    color: colors.onPrimary,
    fontSize: 11.5,
    fontWeight: "800",
  },
  contentTabRow: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 6,
  },
  contentTabBtn: {
    borderRadius: 10,
    flex: 1,
    minWidth: 150,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  contentTabBtnActive: {
    backgroundColor: colors.primary,
  },
  contentTabText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  contentTabTextActive: {
    color: colors.onPrimary,
    fontWeight: "800",
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    minWidth: 128,
    padding: spacing.md,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
  },
  infoFlow: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  infoFlowText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  infoFlowTitle: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "800",
  },
  stack: {
    gap: spacing.lg,
  },
  pageEyebrow: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pageHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
  },
  pageHeaderCopy: {
    flexShrink: 1,
    minWidth: 200,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 2,
  },
  bulkCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
  },
  bulkHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  bulkOpenBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bulkOpenBtnText: {
    color: colors.onPrimary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 740,
    padding: spacing.lg,
    width: "100%",
  },
  templateRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  templateBtn: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  templateBtnText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: "700",
  },
  bulkInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontFamily: "monospace",
    fontSize: 12.5,
    minHeight: 220,
    padding: spacing.md,
  },
  modalSecondaryBtn: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modalSecondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  usersToolbar: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  userSearchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 13.5,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  usersTable: {
    gap: spacing.sm,
  },
  userRowCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  userInfoCol: {
    flex: 1,
    gap: 4,
    minWidth: 240,
  },
  userTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  userNameText: {
    color: colors.text,
    fontSize: 14.5,
    fontWeight: "800",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusPillActive: {
    backgroundColor: colors.successSoft,
  },
  statusPillBlocked: {
    backgroundColor: colors.dangerSoft,
  },
  statusPillText: {
    color: colors.text,
    fontSize: 10.5,
    fontWeight: "800",
  },
  premiumPill: {
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  premiumPillText: {
    color: "#B45309",
    fontSize: 10.5,
    fontWeight: "800",
  },
  userActionsCol: {
    flexDirection: "row",
    gap: 8,
  },
  userActionBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userBlockBtn: {
    backgroundColor: colors.danger,
  },
  userUnlockBtn: {
    backgroundColor: colors.success,
  },
  userPremiumBtn: {
    backgroundColor: colors.primary,
  },
  userVerifiedBtn: {
    backgroundColor: "#1D9BF0",
  },
  userVerifiedRevokeBtn: {
    backgroundColor: "#64748B",
  },
  userActionBtnText: {
    color: colors.onPrimary,
    fontSize: 12.5,
    fontWeight: "700",
  },
  filterBarStack: {
    gap: 8,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  panelSection: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: spacing.md,
  },
  assignedList: {
    gap: 8,
    marginTop: 4,
  },
  assignedRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  assignedOrderBadge: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  assignedOrderText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
  },
  partPill: {
    backgroundColor: "#EEF2FF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  partPillText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
  },
  assignedQuestionText: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "600",
  },
  assignedActions: {
    flexDirection: "row",
    gap: 6,
  },
  miniIconBtn: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 30,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  miniIconBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  miniDangerBtn: {
    borderColor: "#FCA5A5",
  },
  miniDangerBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  pickerScroll: {
    maxHeight: 340,
  },
  pickerRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    padding: 10,
  },
  pickerRowChecked: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  checkboxBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "900",
  },
});
