import { ApiResponse } from "@/src/types/auth";

export type LearningPath = {
  id: number;
  code: string;
  title: string;
  description: string;
  targetScore: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LearningPathListResponse = ApiResponse<LearningPath[]>;

export type UserLearningPathCatalogItem = {
  id: number;
  code: string;
  title: string;
  description: string | null;
  targetScore: number;
  active: boolean;
  milestoneCount: number;
  moduleCount: number;
  videoLessonCount: number;
  flashcardCount: number;
  practiceSetCount: number;
  estimatedTotalMinutes: number;
  milestoneTitles: string[];
  recommended: boolean;
  enrolled: boolean;
};

export type UserLearningPathCatalogListResponse = ApiResponse<UserLearningPathCatalogItem[]>;

export type UserProfile = {
  id: number;
  email: string;
  fullName: string;
  username?: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  equippedFrameId?: string | null;
  equippedAvatarId?: string | null;
  authProvider: string;
  providerUserId: string | null;
  currentLevel: string;
  targetScore: number;
  premium: boolean;
  verified?: boolean;
  diamonds?: number;
  arenaWins?: number;
  arenaLosses?: number;
  arenaElo?: number;
  learningXp?: number;
  totalStudyMinutes?: number;
  level?: number;
  role: string;
  status: string;
  profileId: number;
  createdAt: string;
  updatedAt: string;
};

export type FlashcardApiItem = {
  id: number;
  englishWord: string;
  meaningVi: string;
  exampleSentence: string;
  pronunciation: string;
  ownerId: number;
  moduleId: number | null;
  active: boolean;
  personalCard: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserLearningPathAssignment = {
  id: number;
  userId: number;
  learningPathId: number;
  source: string;
  status: string;
  assignedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserStreak = {
  email: string;
  timezone: string;
  currentLoginStreak: number;
  longestLoginStreak: number;
  lastLoginDate: string | null;
  lastLoginAt: string | null;
  todayLoggedIn: boolean;
  diamondsEarned?: number | null;
  currentDiamonds?: number | null;
};

export type UserLessonApiItem = {
  lessonId: number;
  moduleId: number | null;
  moduleTitle: string | null;
  lessonTitle: string;
  lessonDescription: string | null;
  videoUrl: string;
  durationSeconds: number;
  sortOrder: number;
  free: boolean;
  completionPercent: number;
  lastPositionSeconds: number;
  progressStatus: string;
};

export type UserRoadmapModuleItem = {
  moduleId: number;
  title: string;
  description: string | null;
  moduleType: string;
  estimatedMinutes: number | null;
  difficultyLevel: string | null;
  sortOrder: number;
  required: boolean;
  unlockCondition: string | null;
  progressStatus: string;
  progressPercent: number;
  videoLessonCount: number;
  flashcardCount: number;
  practiceSetCount: number;
};

export type UserRoadmapMilestoneItem = {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  modules: UserRoadmapModuleItem[];
};

export type UserRoadmap = {
  assignmentId: number;
  learningPathId: number;
  learningPathCode: string;
  learningPathTitle: string;
  learningPathDescription: string | null;
  targetScore: number;
  status: string;
  progressPercent: number;
  currentModuleId: number | null;
  assignedAt: string;
  completedAt?: string | null;
  milestones: UserRoadmapMilestoneItem[];
};

export type PracticeSetApiItem = {
  id: number;
  moduleId: number | null;
  title: string;
  description: string | null;
  partNo: number | null;
  targetScore: number | null;
  setType: string;
  durationMinutes: number | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserPracticeQuestionOptionResponse = {
  id: number;
  optionLabel: string;
  optionText: string;
};

export type UserPracticeQuestionResponse = {
  id: number;
  practiceSetQuestionId?: number;
  questionId: number;
  sortOrder: number;
  partNo?: number | null;
  questionText: string;
  difficultyLevel?: string | null;
  sourceType?: string | null;
  sourceYear?: number | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  passageText?: string | null;
  questionGroupCode?: string | null;
  options: UserPracticeQuestionOptionResponse[];
};

export type UserPracticeSetDetailResponseData = {
  id: number;
  moduleId: number | null;
  title: string;
  description: string | null;
  partNo: number | null;
  targetScore: number | null;
  setType: string;
  durationMinutes: number | null;
  published: boolean;
  questionCount?: number | null;
  questions?: UserPracticeQuestionResponse[];
};

export type UserPracticeAttemptResponse = {
  id: number;
  attemptId?: number;
  userId?: number;
  practiceSetId: number;
  practiceSetTitle: string;
  moduleId?: number | null;
  moduleTitle?: string | null;
  startedAt: string;
  submittedAt?: string | null;
  score?: number | null;
  correctCount?: number | null;
  totalQuestions: number;
  durationSeconds?: number | null;
  status?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type UserPracticeAnswerResult = {
  practiceSetQuestionId: number;
  questionId?: number;
  sortOrder?: number | null;
  partNo?: number | null;
  questionText: string;
  explanation?: string | null;
  difficultyLevel?: string | null;
  sourceType?: string | null;
  sourceYear?: number | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  passageText?: string | null;
  transcript?: string | null;
  questionGroupCode?: string | null;
  selectedOptionId?: number | null;
  selectedLabel: string;
  selectedText?: string | null;
  correctOptionId?: number | null;
  correctLabel: string;
  correctText?: string | null;
  correct: boolean;
  options?: {
    id: number;
    optionLabel: string;
    optionText: string;
    correct?: boolean | null;
  }[];
};

export type UserPracticeAttemptDetailResponseData = {
  attemptId: number;
  practiceSetId: number;
  practiceSetTitle: string;
  startedAt: string;
  submittedAt?: string | null;
  score?: number | null;
  correctCount?: number | null;
  totalQuestions: number;
  diamondsEarned?: number | null;
  currentDiamonds?: number | null;
  answers?: UserPracticeAnswerResult[];
};

export type PracticeAnswerSubmission = {
  practiceSetQuestionId: number;
  selectedLabel: string;
};

export type SubmitPracticeAttemptRequest = {
  answers: PracticeAnswerSubmission[];
};

export type UserModuleContent = {
  moduleId: number;
  title: string;
  description: string | null;
  moduleType: string;
  estimatedMinutes: number | null;
  difficultyLevel: string | null;
  videoLessons: UserLessonApiItem[];
  flashcards: FlashcardApiItem[];
  practiceSets: PracticeSetApiItem[];
  practiceCompleted?: boolean | null;
  submittedPracticeCount?: number | null;
  moduleCompleted?: boolean | null;
};

export type PlacementQuickOption = {
  label: string;
  text: string;
};

export type PlacementQuickQuestion = {
  questionKey: string;
  partNo: number;
  skillArea: string;
  questionText: string;
  passageText: string | null;
  options: PlacementQuickOption[];
};

export type PlacementQuickTestData = {
  questions: PlacementQuickQuestion[];
};

export type PlacementEvaluationData = {
  correctCount: number;
  totalQuestions: number;
  accuracyPercent: number;
  estimatedScore: number;
  recommendedTargetScore: number;
  levelLabel: string;
  recommendedPathId: number | null;
  recommendedPathTitle: string | null;
  partBreakdown: {
    partNo: number;
    skillArea: string;
    correct: number;
    total: number;
    accuracyPercent: number;
  }[];
  weakAreas: string[];
  strengths: string[];
};

export type AdaptiveRecommendationData = {
  targetScore: number | null;
  currentLevel: string | null;
  weakestPartNo: number | null;
  weakestPartAccuracy: number | null;
  mistakeCount: number;
  dueVocabCount: number;
  nextModuleId: number | null;
  nextModuleTitle: string | null;
  nextModuleReason: string | null;
  prioritizedModuleIds: number[];
  partAccuracies: {
    partNo: number;
    correct: number;
    total: number;
    accuracyPercent: number;
  }[];
  dailyPlan: {
    id: string;
    title: string;
    subtitle: string;
    badge: string;
    route: string;
  }[];
};

export type UserGrammarListItem = {
  id: number;
  title: string;
  content: string;
  tips: string | null;
  example: string | null;
  active: boolean;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type UserFavoriteGrammarTitleItem = {
  id: number;
  savedAt: string;
  title: string;
};

export type LessonProgressUpdate = {
  lessonId: number;
  moduleId: number;
  lessonStatus: string;
  lessonCompletionPercent: number;
  lastPositionSeconds: number;
  watchedSeconds: number;
  moduleStatus: string;
  moduleProgressPercent: number;
  nextModuleId: number | null;
  nextModuleUnlocked: boolean;
  pathCompleted: boolean;
  diamondsEarned?: number | null;
  currentDiamonds?: number | null;
};

export type ModuleUnlock = {
  moduleId: number;
  moduleStatus: string;
  moduleProgressPercent: number;
  moduleCompleted: boolean;
  nextModuleId: number | null;
  nextModuleUnlocked: boolean;
  pathCompleted: boolean;
  diamondsEarned?: number | null;
  currentDiamonds?: number | null;
};

export type FlashcardCollectionApiItem = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  flashcardCount: number;
  flashcards?: FlashcardApiItem[] | null;
  createdAt: string;
  updatedAt: string;
};

export type UserTestResponse = {
  id: number;
  title: string;
  description: string | null;
  testType: string;
  totalDurationMinutes: number;
  published: boolean;
  partCount?: number;
  questionCount?: number;
  parts?: UserTestPartResponse[];
};

export type UserTestPartResponse = {
  id: number;
  partName: string;
  partNumber: number;
  description: string | null;
  durationMinutes: number;
  questionCount: number;
  questions?: UserTestPartQuestionResponse[];
};

export type UserTestPartQuestionResponse = {
  id: number;
  questionId: number;
  sortOrder: number;
  questionText: string;
  partNo?: number | null;
  difficultyLevel?: string | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  passageText?: string | null;
  questionGroupCode?: string | null;
  options: {
    id: number;
    optionLabel: string;
    optionText: string;
  }[];
};

export type UserTestLeaderboardItem = {
  userId: number;
  fullName: string;
  avatarUrl: string | null;
  totalScore: number;
  totalAttempts: number;
  position: number;
};

export type PartScoreBreakdownItem = {
  partNo: number;
  partSection: string;
  correctCount: number;
  totalCount: number;
  accuracy: number;
};

export type TestAttemptResponse = {
  attemptId: number;
  testId: number;
  testTitle: string;
  startedAt: string;
  submittedAt?: string | null;
  score?: number | null;
  listeningScore?: number | null;
  readingScore?: number | null;
  toeicScore?: number | null;
  correctCount?: number | null;
  totalQuestions: number;
  diamondsEarned?: number | null;
  currentDiamonds?: number | null;
  partBreakdown?: PartScoreBreakdownItem[] | null;
  answers?: QuestionAnswerResult[];
};

export type QuestionAnswerResult = {
  testPartQuestionId: number;
  partNo?: number | null;
  questionText: string;
  explanation?: string | null;
  difficultyLevel?: string | null;
  sourceType?: string | null;
  sourceYear?: number | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  passageText?: string | null;
  transcript?: string | null;
  questionGroupCode?: string | null;
  selectedLabel: string;
  correctLabel: string;
  correct: boolean;
  options?: {
    optionLabel: string;
    optionText: string;
    correct?: boolean | null;
  }[];
};

export type ExplainQuestionRequest = {
  testPartQuestionId?: number;
  practiceSetQuestionId?: number;
  questionId?: number;
  selectedAnswer: string;
  type: "EXPLANATION" | "TIPS" | "BOTH";
};

export type VideoNoteApiItem = {
  id: number;
  userId: number;
  lessonId: number;
  lessonTitle?: string | null;
  moduleId?: number | null;
  moduleTitle?: string | null;
  timestampSeconds: number;
  noteText: string;
  createdAt: string;
  updatedAt: string;
};

export type MistakeItem = {
  questionId: number;
  partNo?: number | null;
  sourceType: string;
  sourceTitle: string;
  questionText: string;
  audioUrl?: string | null;
  imageUrl?: string | null;
  passageText?: string | null;
  transcript?: string | null;
  questionGroupCode?: string | null;
  explanation?: string | null;
  difficultyLevel?: string | null;
  lastSelectedLabel?: string | null;
  correctLabel?: string | null;
  wrongCount: number;
  lastWrongAt?: string | null;
  options?: {
    id: number;
    optionLabel: string;
    optionText: string;
    correct?: boolean | null;
  }[];
};

export type VocabularyTopicItem = {
  id: number;
  name: string;
  description?: string | null;
  level?: string | null;
  wordCount: number;
  studiedCount?: number | null;
  masteredCount?: number | null;
};

export type VocabularyStudyItem = {
  vocabularyId: number;
  topicId?: number | null;
  topicName?: string | null;
  word: string;
  ipa?: string | null;
  audioUrl?: string | null;
  meaningVi: string;
  meaningEn?: string | null;
  exampleSentence?: string | null;
  exampleTranslation?: string | null;
  partOfSpeech?: string | null;
  difficultyLevel?: string | null;
  familiarityLevel?: number | null;
  easeFactor?: number | null;
  intervalDays?: number | null;
  repetitions?: number | null;
  lastReviewedAt?: string | null;
  nextReviewAt?: string | null;
  status: "LEARNING" | "REVIEWING" | "MASTERED" | string;
  diamondsEarned?: number | null;
  currentDiamonds?: number | null;
};

export type Sm2Rating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export type ArenaMode = "VOCAB" | "PART5";

export type ArenaEmoteEvent = {
  id: number;
  senderEmail: string;
  senderName: string;
  emoteCode: string;
  emoji: string;
  label: string;
  sentAtEpochMs: number;
};

export type ArenaPlayerState = {
  userId: number;
  email: string;
  fullName: string;
  username?: string | null;
  avatarUrl?: string | null;
  equippedFrameId?: string | null;
  verified?: boolean;
  level?: number;
  score: number;
  roundWins: number;
  correctCount: number;
  answeredCount: number;
  diamonds: number;
  diamondDelta: number;
  totalResponseMs: number;
  lastRoundResponseMs: number;
  answeredCurrentRound: boolean;
  eloRating: number;
  wins: number;
  losses: number;
  activeEmote?: ArenaEmoteEvent | null;
};

export type ArenaQuestionItem = {
  questionId: number;
  partNo?: number | null;
  type?: ArenaMode | string;
  questionText: string;
  questionTranslationVi?: string | null;
  wordLength?: number | null;
  hintMask?: string | null;
  meaningVi?: string | null;
  explanation?: string | null;
  explanationVi?: string | null;
  maskedExample?: string | null;
  exampleTranslation?: string | null;
  partOfSpeech?: string | null;
  pronunciation?: string | null;
  topicName?: string | null;
  options?: {
    optionLabel: string;
    optionText: string;
  }[];
};

export type ArenaRoomItem = {
  roomCode: string;
  status: "WAITING" | "IN_PROGRESS" | "FINISHED" | string;
  mode: ArenaMode | string;
  matchType?: "ROOM" | "RANDOM" | string;
  isPrivate?: boolean;
  hasPassword?: boolean;
  hostName: string;
  hostEmail?: string | null;
  winnerName?: string | null;
  winnerEmail?: string | null;
  totalQuestions: number;
  currentRoundIndex: number;
  roundPhase: "WAITING" | "QUESTION" | "REVEAL" | "FINISHED" | string;
  roundDurationSeconds: number;
  remainingSeconds: number;
  elapsedMatchSeconds: number;
  roundWinnerName?: string | null;
  roundWinnerEmail?: string | null;
  roundDiamondReward?: number;
  currentRevealWord?: string | null;
  currentRevealMeaningVi?: string | null;
  currentRevealCorrectLabel?: string | null;
  currentRevealExplanation?: string | null;
  audioHintUnlocked?: boolean;
  audioHintUnlockAtSeconds?: number;
  audioHintWord?: string | null;
  feedbackMessage?: string | null;
  latestEmote?: ArenaEmoteEvent | null;
  createdAt: string;
  players: ArenaPlayerState[];
  questions: ArenaQuestionItem[];
};

export type ArenaMatchmakingStatusData = {
  status: "IDLE" | "SEARCHING" | "MATCHED" | string;
  mode?: ArenaMode | string;
  waitedSeconds?: number;
  queueSize?: number;
  room?: ArenaRoomItem | null;
};

export type ArenaLeaderboardEntry = {
  rank: number;
  userId: number;
  fullName: string;
  username?: string | null;
  avatarUrl?: string | null;
  equippedFrameId?: string | null;
  verified?: boolean;
  level?: number;
  elo: number;
  wins: number;
  losses: number;
  winRate: number;
  diamonds: number;
};

export type ArenaLeaderboardData = {
  myDiamonds: number;
  myElo: number;
  myWins: number;
  myLosses: number;
  myWinRate: number;
  entries: ArenaLeaderboardEntry[];
};

export type TtsVoiceItem = {
  id: string;
  displayName: string;
  locale: string;
  gender?: string | null;
  model?: string | null;
  previewAudio?: string | null;
};

export type TtsVoicesData = {
  configured: boolean;
  provider: string;
  defaultUsVoiceId?: string | null;
  defaultUkVoiceId?: string | null;
  statusMessage?: string | null;
  voices: TtsVoiceItem[];
};

export type TtsSynthesizeData = {
  available: boolean;
  provider: "SPEECHIFY" | "FALLBACK" | string;
  cacheId?: string | null;
  streamPath?: string | null;
  audioBase64?: string | null;
  audioFormat?: string | null;
  mimeType?: string | null;
  voiceId?: string | null;
  voiceName?: string | null;
  locale?: string | null;
  billableCharacters?: number | null;
  message?: string | null;
};

export type YoutubeSubtitleLineItem = {
  index: number;
  startSeconds: number;
  endSeconds?: number;
  timestampLabel: string;
  rangeLabel?: string;
  englishText: string;
  vietnameseText: string;
  englishNote?: string;
};

export type YoutubeExerciseItem = {
  index: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanationVi: string;
  relatedTimestamp?: string;
};

export type YoutubeSubtitleData = {
  videoId: string;
  youtubeUrl: string;
  streamVideoUrl?: string;
  title: string;
  authorName: string;
  thumbnailUrl: string;
  sourceMode: string;
  level?: string;
  topic?: string;
  durationSeconds?: number;
  durationLabel?: string;
  lines: YoutubeSubtitleLineItem[];
  vocabulary?: YoutubeWordLookupData[];
  exercises?: YoutubeExerciseItem[];
};

export type YoutubeWordLookupData = {
  word: string;
  normalizedWord: string;
  pronunciation: string;
  partOfSpeech: string;
  meaningVi: string;
  meaningEn: string;
  exampleSentence: string;
  exampleTranslation: string;
  grammarNote: string;
  source?: string;
  toeicTip?: string;
};

export type QuestionExplainResponse = {
  correctAnswer: string;
  explanation: string;
  tips: string;
  userAnswer: string;
};

export type SubmitTestAttemptRequest = {
  answers: AnswerSubmission[];
};

export type AnswerSubmission = {
  testPartQuestionId: number;
  selectedLabel: string;
};

export type UserProfileResponse = ApiResponse<UserProfile>;
export type UserStreakResponse = ApiResponse<UserStreak>;
export type FlashcardsResponse = ApiResponse<FlashcardApiItem[]>;
export type FlashcardResponse = ApiResponse<FlashcardApiItem>;
export type UserLearningPathAssignmentResponse =
  ApiResponse<UserLearningPathAssignment>;
export type UserLessonsResponse = ApiResponse<UserLessonApiItem[]>;
export type UserRoadmapResponse = ApiResponse<UserRoadmap>;
export type UserModuleContentResponse = ApiResponse<UserModuleContent>;
export type LessonProgressUpdateResponse = ApiResponse<LessonProgressUpdate>;
export type ModuleUnlockResponse = ApiResponse<ModuleUnlock>;
export type FlashcardCollectionListResponse = ApiResponse<FlashcardCollectionApiItem[]>;
export type FlashcardCollectionResponse = ApiResponse<FlashcardCollectionApiItem>;

export type UserTestListResponse = ApiResponse<UserTestResponse[]>;
export type UserTestDetailResponse = ApiResponse<UserTestResponse>;
export type UserTestLeaderboardResponse = ApiResponse<UserTestLeaderboardItem[]>;
export type TestAttemptApiResponse = ApiResponse<TestAttemptResponse>;
export type TestAttemptListApiResponse = ApiResponse<TestAttemptResponse[]>;
export type QuestionExplainApiResponse = ApiResponse<QuestionExplainResponse>;

export type UserPracticeSetListApiResponse = ApiResponse<PracticeSetApiItem[]>;
export type UserPracticeSetDetailApiResponse = ApiResponse<UserPracticeSetDetailResponseData>;
export type UserPracticeAttemptApiResponse = ApiResponse<UserPracticeAttemptResponse>;
export type UserPracticeAttemptListApiResponse = ApiResponse<UserPracticeAttemptResponse[]>;
export type UserPracticeAttemptDetailApiResponse = ApiResponse<UserPracticeAttemptDetailResponseData>;

export type UserGrammarListResponse = ApiResponse<UserGrammarListItem[]>;
export type UserGrammarDetailResponse = ApiResponse<UserGrammarListItem>;
export type UserFavoriteGrammarTitleListResponse = ApiResponse<UserFavoriteGrammarTitleItem[]>;
export type VideoNoteListResponse = ApiResponse<VideoNoteApiItem[]>;
export type VideoNoteDetailResponse = ApiResponse<VideoNoteApiItem>;
export type MistakeListResponse = ApiResponse<MistakeItem[]>;
export type VocabularyTopicListResponse = ApiResponse<VocabularyTopicItem[]>;
export type VocabularyStudyListResponse = ApiResponse<VocabularyStudyItem[]>;
export type VocabularyStudyDetailResponse = ApiResponse<VocabularyStudyItem>;
export type ArenaRoomResponse = ApiResponse<ArenaRoomItem>;
export type ArenaRoomListResponse = ApiResponse<ArenaRoomItem[]>;
export type ArenaMatchmakingStatusResponse = ApiResponse<ArenaMatchmakingStatusData>;
export type ArenaLeaderboardResponse = ApiResponse<ArenaLeaderboardData>;
export type TtsVoicesResponse = ApiResponse<TtsVoicesData>;
export type TtsSynthesizeResponse = ApiResponse<TtsSynthesizeData>;
export type YoutubeSubtitleApiResponse = ApiResponse<YoutubeSubtitleData>;
export type YoutubeWordLookupApiResponse = ApiResponse<YoutubeWordLookupData>;

/* ============================================================================
 * MODULE 1: DOCUMENT-TO-TOEIC TEST AI GENERATOR TYPES
 * ============================================================================ */

export type ImportedDocumentOptionItem = {
  optionLabel: string;
  optionText: string;
};

export type ImportedDocumentPassageItem = {
  id: number;
  passageCode: string;
  partNo: number;
  passageType: "PART6" | "SINGLE" | "DOUBLE" | "TRIPLE" | string;
  documentKind?: string | null;
  pageNumber: number;
  content: string;
  tableJson?: string | null;
  linkedPassageCodes?: string | null;
  sortOrder: number;
};

export type ImportedDocumentQuestionItem = {
  id: number;
  passageId?: number | null;
  passageCode?: string | null;
  partNo: number;
  originalQuestionNumber?: number | null;
  pageNumber: number;
  questionText: string;
  options: ImportedDocumentOptionItem[];
  officialCorrectLabel?: string | null;
  answerKeyVerified: boolean;
  aiSuggestedLabel?: string | null;
  aiSuggestedExplanation?: string | null;
  extractionConfidence?: number | null;
  validationStatus: "VALID" | "WARNING" | "INVALID" | string;
  validationIssues: string[];
  included: boolean;
  savedQuestionId?: number | null;
  sortOrder: number;
};

export type ImportedDocumentValidationSummary = {
  totalQuestions?: number;
  totalPassages?: number;
  partCounts?: Record<string, number>;
  validCount?: number;
  warningCount?: number;
  invalidCount?: number;
  unverifiedAnswerCount?: number;
  brokenPassageLinksCount?: number;
  duplicateCount?: number;
  missingChoicesCount?: number;
  missingNumbersInSequence?: number[];
  issues?: string[];
};

export type ImportedDocumentItem = {
  id: number;
  fileName: string;
  fileFormat: string;
  fileSizeBytes: number;
  sha256Hash: string;
  pageCount: number;
  ocrUsed: boolean;
  ocrEngine?: string | null;
  status: string;
  rawTextPreview?: string;
  generatedTestId?: number | null;
  validationSummary?: ImportedDocumentValidationSummary;
  passages: ImportedDocumentPassageItem[];
  questions: ImportedDocumentQuestionItem[];
  generatedExams?: UserTestResponse[];
  createdAt: string;
  updatedAt: string;
};

export type ImportedDocumentApiResponse = ApiResponse<ImportedDocumentItem>;
export type ImportedDocumentListApiResponse = ApiResponse<ImportedDocumentItem[]>;

/* ============================================================================
 * MODULES 2 & 3: FULL-LENGTH VIDEO IMPORT, ASR & BILINGUAL SUBTITLE ENGINE
 * ============================================================================ */

export type VideoProcessingJobItem = {
  jobId: number;
  videoId: number;
  status:
    | "QUEUED"
    | "FETCHING_METADATA"
    | "DOWNLOADING"
    | "EXTRACTING_AUDIO"
    | "TRANSCRIBING"
    | "TRANSLATING"
    | "SAVING"
    | "COMPLETED"
    | "FAILED"
    | "CANCELLED"
    | string;
  overallProgress: number;
  downloadProgress: number;
  audioExtractionProgress: number;
  transcriptionProgress: number;
  translationProgress: number;
  totalChunks: number;
  completedChunks: number;
  lastCompletedChunk: number;
  currentStageMessage?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  cancelRequested: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type VideoSubtitleSegmentItem = {
  id?: number;
  sequenceNumber: number;
  startTime: number;
  endTime: number;
  timestampLabel: string;
  rangeLabel: string;
  englishText: string;
  vietnameseText: string;
  englishNote?: string | null;
  confidence?: number | null;
  uncertain?: boolean;
};

export type VideoBookmarkItem = {
  id: number;
  timestampSeconds: number;
  timestampLabel: string;
  label: string;
  note?: string | null;
  createdAt?: string;
};

export type ImportedVideoDetailData = {
  id: number;
  videoUid: string;
  sourceUrl: string;
  canonicalUrl?: string | null;
  platform: string;
  title: string;
  description?: string | null;
  authorName?: string | null;
  thumbnailUrl?: string | null;
  streamVideoUrl?: string | null;
  audioLanguage?: string | null;
  durationSeconds: number;
  verifiedMediaDurationSeconds: number;
  durationLabel: string;
  level?: string | null;
  topic?: string | null;
  workflowStatus?:
    | "DRAFT"
    | "DOWNLOADING"
    | "TRANSCRIBING"
    | "TRANSLATING"
    | "REVIEWING"
    | "PUBLISHED"
    | "ARCHIVED"
    | "FAILED"
    | string
    | null;
  published?: boolean;
  publishedAt?: string | null;
  readyToPublish?: boolean | null;
  publishBlockers?: string[] | null;
  fullEnglishTranscript?: string | null;
  favorite: boolean;
  lastPositionSeconds: number;
  playbackSpeed: number;
  completed: boolean;
  diamondsEarned?: number | null;
  currentDiamonds?: number | null;
  detectedLanguage?: string | null;
  asrEngine?: string | null;
  averageConfidence?: number | null;
  uncertainSegmentCount?: number;
  latestJob?: VideoProcessingJobItem | null;
  segments: VideoSubtitleSegmentItem[];
  vocabulary: YoutubeWordLookupData[];
  exercises: YoutubeExerciseItem[];
  bookmarks: VideoBookmarkItem[];
  createdAt: string;
  updatedAt: string;
};

export type ImportedVideoApiResponse = ApiResponse<ImportedVideoDetailData>;
export type ImportedVideoListApiResponse = ApiResponse<ImportedVideoDetailData[]>;
export type VideoJobApiResponse = ApiResponse<VideoProcessingJobItem>;
export type VideoBookmarkApiResponse = ApiResponse<VideoBookmarkItem>;

export type DictionarySemanticNode = {
  vocabularyId?: number | null;
  word: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  meaningVi?: string | null;
  cefrLevel?: string | null;
  relationType?: string | null;
  relationLabel?: string | null;
};

export type DictionaryExampleEntry = {
  english: string;
  vietnamese?: string | null;
};

export type DictionaryCollocationEntry = {
  phrase: string;
  meaningVi?: string | null;
};

export type DictionarySemanticNetwork = {
  synonyms: DictionarySemanticNode[];
  antonyms: DictionarySemanticNode[];
  wordFamily: DictionarySemanticNode[];
  relatedWords: DictionarySemanticNode[];
  collocations: DictionaryCollocationEntry[];
};

export type SemanticDictionaryData = {
  vocabularyId?: number | null;
  word: string;
  normalizedWord: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  cefrLevel?: string | null;
  topicName?: string | null;
  meaningVi: string;
  meaningEn?: string | null;
  usageNote?: string | null;
  source?: string | null;
  cached?: boolean;
  partial?: boolean;
  examples: DictionaryExampleEntry[];
  semanticNetwork: DictionarySemanticNetwork;
};

export type DictionaryHistoryItem = {
  id?: number | null;
  word: string;
  normalizedWord: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  cefrLevel?: string | null;
  meaningVi?: string | null;
  source?: string | null;
  lookupCount?: number | null;
  lastLookedUpAt?: string | null;
  entry?: SemanticDictionaryData | null;
};

export type DetectedObjectItem = {
  vocabularyId?: number | null;
  word: string;
  ipa?: string | null;
  partOfSpeech?: string | null;
  cefrLevel?: string | null;
  meaningVi: string;
  meaningEn?: string | null;
  exampleSentence?: string | null;
  exampleTranslation?: string | null;
  category?: string | null;
  confidence?: number | null;
};

export type ImageObjectRecognitionData = {
  primaryObject: DetectedObjectItem;
  sceneDescriptionEn?: string | null;
  sceneDescriptionVi?: string | null;
  source?: string | null;
  detectedObjects: DetectedObjectItem[];
  relatedWords: DictionarySemanticNode[];
};

export type DictionarySuggestApiResponse = ApiResponse<DictionarySemanticNode[]>;
export type SemanticDictionaryApiResponse = ApiResponse<SemanticDictionaryData>;
export type ImageObjectRecognitionApiResponse = ApiResponse<ImageObjectRecognitionData>;
export type DictionaryHistoryApiResponse = ApiResponse<DictionaryHistoryItem[]>;
export type DictionaryHistoryDeleteApiResponse = ApiResponse<void>;

export type WeeklyLeaderboardEntry = {
  rank: number;
  userId: number;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  equippedFrameId?: string | null;
  verified?: boolean;
  level: number;
  weeklyStudyDiamonds: number;
  totalDiamonds: number;
  activitiesCount: number;
  currentStreak: number;
  topBadgeIcons: string[];
};

export type WeeklyRewardTier = {
  rankLabel: string;
  rewardDiamonds: number;
  badgeTitle: string;
  badgeEmoji: string;
};

export type WeeklyLeaderboardData = {
  weekOffset: number;
  weekStartDate: string;
  weekEndDate: string;
  weekLabel: string;
  secondsUntilWeekClose: number;
  totalActiveLearners: number;
  myEntry: WeeklyLeaderboardEntry;
  rewardTiers: WeeklyRewardTier[];
  entries: WeeklyLeaderboardEntry[];
};

export type CosmeticCatalogItem = {
  id: string;
  category: "FRAME" | "AVATAR" | string;
  animationType: "STATIC" | "ANIMATED" | string;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | string;
  name: string;
  description: string;
  priceDiamonds: number;
  badgeEmoji?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  previewKey: string;
  owned: boolean;
  equipped: boolean;
};

export type CosmeticShopData = {
  myDiamonds: number;
  equippedFrameId?: string | null;
  equippedAvatarId?: string | null;
  items: CosmeticCatalogItem[];
};

export type ProfileAchievementItem = {
  code: string;
  title: string;
  description: string;
  iconName: string;
  accentColor: string;
  rewardDiamonds: number;
  currentProgress: number;
  targetProgress: number;
  unlocked: boolean;
  unlockedAt?: string | null;
};

export type ProfileStudyStats = {
  completedLessons: number;
  completedModules: number;
  completedPracticeSets: number;
  submittedTests: number;
  reviewedVocabCount: number;
  masteredVocabCount: number;
  completedVideos: number;
  arenaWins: number;
  arenaLosses: number;
  arenaElo: number;
  totalAchievementsUnlocked: number;
};

export type DiamondHistoryItem = {
  id: number;
  sourceType: string;
  diamondsDelta: number;
  studyReward: boolean;
  description: string;
  createdAt: string;
};

export type ProfileInsightsData = {
  userId: number;
  fullName: string;
  username: string;
  bio?: string | null;
  avatarUrl?: string | null;
  equippedFrameId?: string | null;
  equippedAvatarId?: string | null;
  currentLevel?: string | null;
  targetScore?: number | null;
  premium?: boolean | null;
  verified?: boolean;
  diamonds: number;
  weeklyStudyDiamonds: number;
  level: number;
  learningXp: number;
  currentLevelMinXp?: number;
  nextLevelXp: number;
  levelProgressPercent?: number;
  levelTitle?: string;
  currentStreak: number;
  longestStreak: number;
  totalStudyMinutes: number;
  lastActiveAt?: string | null;
  relationStatus?:
    | "SELF"
    | "ACCEPTED"
    | "PENDING_INCOMING"
    | "PENDING_OUTGOING"
    | "BLOCKED"
    | "BLOCKED_BY_OTHER"
    | "NONE"
    | string
    | null;
  stats: ProfileStudyStats;
  achievements: ProfileAchievementItem[];
  recentDiamonds: DiamondHistoryItem[];
};

export type ChatMessageItem = {
  id: number;
  channelType: "COMMUNITY" | "DIRECT" | string;
  messageType: "TEXT" | "SYSTEM_MILESTONE" | string;
  senderId?: number | null;
  senderFullName: string;
  senderUsername: string;
  senderAvatarUrl?: string | null;
  senderEquippedFrameId?: string | null;
  senderVerified?: boolean;
  senderLevel: number;
  recipientId?: number | null;
  content: string;
  createdAt: string;
  mine: boolean;
};

export type FriendPerson = {
  friendshipId?: number | null;
  userId: number;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  equippedFrameId?: string | null;
  verified?: boolean;
  level: number;
  diamonds: number;
  relationStatus: "ACCEPTED" | "PENDING_INCOMING" | "PENDING_OUTGOING" | "BLOCKED" | "NONE" | string;
  lastMessageId?: number | null;
  lastMessageSenderId?: number | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
};

export type ChatFriendsData = {
  totalUnreadDirectMessages?: number;
  friends: FriendPerson[];
  incomingRequests: FriendPerson[];
  outgoingRequests: FriendPerson[];
  blockedUsers: FriendPerson[];
};

export type WeeklyLeaderboardApiResponse = ApiResponse<WeeklyLeaderboardData>;
export type CosmeticShopApiResponse = ApiResponse<CosmeticShopData>;
export type ProfileInsightsApiResponse = ApiResponse<ProfileInsightsData>;
export type ChatMessageListApiResponse = ApiResponse<ChatMessageItem[]>;
export type ChatMessageSingleApiResponse = ApiResponse<ChatMessageItem>;
export type ChatFriendsApiResponse = ApiResponse<ChatFriendsData>;
export type ChatSearchUsersApiResponse = ApiResponse<FriendPerson[]>;
