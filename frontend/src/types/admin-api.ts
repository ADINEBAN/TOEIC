import { ApiResponse } from '@/src/types/auth';

export type LearningPathApiItem = {
  id: number;
  code: string;
  title: string;
  description: string | null;
  targetScore: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LearningPathMilestoneApiItem = {
  id: number;
  learningPathId: number;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MilestoneModuleApiItem = {
  id: number;
  milestoneId: number;
  moduleId: number;
  sortOrder: number;
  required: boolean;
  unlockCondition: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LearningModuleApiItem = {
  id: number;
  moduleType: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  estimatedMinutes: number;
  difficultyLevel: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminFlashcardApiItem = {
  id: number;
  englishWord: string;
  meaningVi: string;
  exampleSentence: string | null;
  pronunciation: string | null;
  ownerId: number | null;
  moduleId: number | null;
  active: boolean;
  personalCard: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PracticeSetApiItem = {
  id: number;
  moduleId: number;
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

export type VideoLessonApiItem = {
  id: number;
  moduleId: number | null;
  title: string;
  description: string | null;
  videoUrl: string | null;
  durationSeconds: number | null;
  sortOrder: number | null;
  free: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VideoUploadApiItem = {
  publicId: string | null;
  resourceType: string | null;
  format: string | null;
  secureUrl: string | null;
  playbackUrl: string | null;
  durationSeconds: number | null;
  bytes: number | null;
};

export type GrammarApiItem = {
  id: number;
  title: string;
  content: string;
  tips: string | null;
  example: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QuestionOptionApiItem = {
  id: number;
  questionId: number;
  optionLabel: string;
  optionText: string;
  correct: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QuestionApiItem = {
  id: number;
  partNo: number | null;
  questionText: string;
  explanation: string | null;
  difficultyLevel: string | null;
  sourceType: string | null;
  sourceYear: number | null;
  audioUrl?: string | null;
  imageUrl?: string | null;
  passageText?: string | null;
  transcript?: string | null;
  questionGroupCode?: string | null;
  options: QuestionOptionApiItem[];
  createdAt: string;
  updatedAt: string;
};

export type PracticeSetQuestionApiItem = {
  id: number;
  practiceSetId: number;
  questionId: number;
  sortOrder: number;
  question: QuestionApiItem;
  createdAt: string;
  updatedAt: string;
};

export type PermissionApiItem = {
  id: number;
  code: string;
  role: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateAdminFlashcardRequest = {
  active?: boolean;
  englishWord: string;
  exampleSentence?: string | null;
  meaningVi: string;
  moduleId: number;
  pronunciation?: string | null;
};

export type CreateLearningPathRequest = {
  active?: boolean;
  code: string;
  description?: string | null;
  targetScore: number;
  title: string;
};

export type UpdateLearningPathRequest = Partial<CreateLearningPathRequest>;

export type CreateLearningPathMilestoneRequest = {
  description?: string | null;
  sortOrder: number;
  title: string;
};

export type UpdateLearningPathMilestoneRequest =
  Partial<CreateLearningPathMilestoneRequest>;

export type ModuleType =
  | 'VOCABULARY'
  | 'GRAMMAR'
  | 'PRACTICE'
  | 'MOCK_TEST'
  | 'VIDEO'
  | 'TIPS';

export type CreateLearningModuleRequest = {
  active?: boolean;
  description?: string | null;
  difficultyLevel?: string | null;
  estimatedMinutes: number;
  moduleType: ModuleType | string;
  thumbnailUrl?: string | null;
  title: string;
};

export type UpdateLearningModuleRequest = Partial<CreateLearningModuleRequest>;

export type CreateMilestoneModuleRequest = {
  moduleId: number;
  required?: boolean;
  sortOrder: number;
  unlockCondition?: string | null;
};

export type UpdateMilestoneModuleRequest = Partial<CreateMilestoneModuleRequest>;

export type CreateMilestoneQuickModuleRequest = {
  moduleType: ModuleType | string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  estimatedMinutes: number;
  difficultyLevel?: string | null;
  active?: boolean;
  sortOrder?: number;
  required?: boolean;
  unlockCondition?: string | null;
};

export type AdminMilestoneModuleLinkNode = {
  milestoneModuleId: number;
  milestoneId: number;
  moduleId: number;
  sortOrder: number;
  required: boolean;
  unlockCondition: string | null;
  moduleTitle: string;
  moduleDescription: string | null;
  moduleType: ModuleType | string;
  estimatedMinutes: number;
  difficultyLevel: string | null;
  moduleActive: boolean;
  videoLessonCount: number;
  flashcardCount: number;
  practiceSetCount: number;
};

export type AdminMilestoneNodeItem = {
  id: number;
  learningPathId: number;
  title: string;
  description: string | null;
  sortOrder: number;
  modules: AdminMilestoneModuleLinkNode[];
};

export type AdminLearningPathOverviewItem = {
  id: number;
  code: string;
  title: string;
  description: string | null;
  targetScore: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  milestoneCount: number;
  moduleCount: number;
  estimatedTotalMinutes: number;
  readyForUsers: boolean;
  milestones: AdminMilestoneNodeItem[];
};

export type AdminLearningPathOverviewListResponse = ApiResponse<
  AdminLearningPathOverviewItem[]
>;

export type UpdateAdminFlashcardRequest = {
  active?: boolean;
  englishWord?: string;
  exampleSentence?: string | null;
  meaningVi?: string;
  moduleId?: number;
  pronunciation?: string | null;
};

export type CreateVideoLessonRequest = {
  description?: string | null;
  durationSeconds: number;
  free?: boolean;
  moduleId: number;
  published?: boolean;
  sortOrder: number;
  title: string;
  videoUrl: string;
};

export type UpdateVideoLessonRequest = {
  description?: string | null;
  durationSeconds?: number;
  free?: boolean;
  moduleId?: number;
  published?: boolean;
  sortOrder?: number;
  title?: string;
  videoUrl?: string;
};

export type CreateGrammarRequest = {
  active?: boolean;
  content: string;
  example?: string | null;
  tips?: string | null;
  title: string;
};

export type UpdateGrammarRequest = Partial<CreateGrammarRequest>;

export type PracticeSetType = 'PLACEMENT' | 'PRACTICE';
export type QuestionSourceType = 'ETS' | 'HACKER' | 'INTERNAL';

export type CreatePracticeSetRequest = {
  description?: string | null;
  durationMinutes?: number;
  moduleId: number;
  partNo?: number | null;
  published?: boolean;
  setType?: PracticeSetType;
  targetScore?: number | null;
  title: string;
};

export type UpdatePracticeSetRequest = {
  description?: string | null;
  durationMinutes?: number;
  moduleId?: number;
  partNo?: number | null;
  published?: boolean;
  setType?: PracticeSetType;
  targetScore?: number | null;
  title?: string;
};

export type CreateQuestionOptionRequest = {
  correct: boolean;
  optionLabel: string;
  optionText: string;
};

export type CreateQuestionRequest = {
  audioUrl?: string | null;
  difficultyLevel?: string | null;
  explanation?: string | null;
  imageUrl?: string | null;
  options: CreateQuestionOptionRequest[];
  partNo?: number | null;
  passageText?: string | null;
  questionGroupCode?: string | null;
  questionText: string;
  sourceType?: QuestionSourceType | string | null;
  sourceYear?: number | null;
  transcript?: string | null;
};

export type UpdateQuestionRequest = Partial<CreateQuestionRequest>;

export type AssignPracticeSetQuestionItemRequest = {
  questionId: number;
  sortOrder: number;
};

export type AssignPracticeSetQuestionsRequest = {
  questions: AssignPracticeSetQuestionItemRequest[];
};

export type LearningPathListResponse = ApiResponse<LearningPathApiItem[]>;
export type LearningPathMilestoneListResponse = ApiResponse<
  LearningPathMilestoneApiItem[]
>;
export type MilestoneModuleListResponse = ApiResponse<MilestoneModuleApiItem[]>;
export type LearningModuleListResponse = ApiResponse<LearningModuleApiItem[]>;
export type FlashcardListResponse = ApiResponse<AdminFlashcardApiItem[]>;
export type PracticeSetListResponse = ApiResponse<PracticeSetApiItem[]>;
export type VideoLessonListResponse = ApiResponse<VideoLessonApiItem[]>;
export type VideoUploadResponse = ApiResponse<VideoUploadApiItem>;
export type GrammarListResponse = ApiResponse<GrammarApiItem[]>;
export type QuestionListResponse = ApiResponse<QuestionApiItem[]>;
export type PracticeSetQuestionListResponse = ApiResponse<PracticeSetQuestionApiItem[]>;

export type FlashcardResponse = ApiResponse<AdminFlashcardApiItem>;

export type FlashcardAiSuggestApiItem = {
  englishWord: string;
  meaningVi: string | null;
  pronunciation: string | null;
  exampleSentence: string | null;
  source: string | null;
};

export type FlashcardAiSuggestResponse = ApiResponse<FlashcardAiSuggestApiItem>;

export type FlashcardImportApiResult = {
  totalParsed: number;
  importedCount: number;
  skippedDuplicateCount: number;
  aiEnrichedCount: number;
  items: AdminFlashcardApiItem[];
};

export type FlashcardImportResponse = ApiResponse<FlashcardImportApiResult>;
export type LearningPathResponse = ApiResponse<LearningPathApiItem>;
export type LearningPathMilestoneResponse = ApiResponse<LearningPathMilestoneApiItem>;
export type MilestoneModuleResponse = ApiResponse<MilestoneModuleApiItem>;
export type LearningModuleResponse = ApiResponse<LearningModuleApiItem>;
export type PracticeSetResponse = ApiResponse<PracticeSetApiItem>;
export type VideoLessonResponse = ApiResponse<VideoLessonApiItem>;
export type GrammarResponse = ApiResponse<GrammarApiItem>;
export type QuestionResponse = ApiResponse<QuestionApiItem>;

export type DraftQuestionExplainRequest = {
  partNo?: number | null;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctLabel: string;
  passageText?: string | null;
  transcript?: string | null;
  explanation?: string | null;
};

export type QuestionDraftExplainApiItem = {
  correctAnswer: string;
  userAnswer: string | null;
  explanation: string;
  tips: string | null;
};

export type QuestionDraftExplainResponse = ApiResponse<QuestionDraftExplainApiItem>;

export type QuestionImportApiResult = {
  totalParsed: number;
  importedCount: number;
  skippedDuplicateCount: number;
  aiExplainedCount: number;
  items: QuestionApiItem[];
};

export type QuestionImportResponse = ApiResponse<QuestionImportApiResult>;

export type QuestionMediaBatchApiResult = {
  uploadedFileCount: number;
  storedAssetCount: number;
  matchedQuestionCount: number;
  skippedAlreadyLinkedCount: number;
  unmatchedFiles: string[];
  items: QuestionApiItem[];
};

export type QuestionMediaBatchResponse = ApiResponse<QuestionMediaBatchApiResult>;

export type QuestionMediaUploadApiItem = {
  url: string;
  mediaType: 'AUDIO' | 'IMAGE' | string;
  format: string;
  bytes: number;
};

export type QuestionMediaUploadResponse = ApiResponse<QuestionMediaUploadApiItem>;
export type AdminAnalyticsOverviewApiItem = {
  totalUsers: number;
  activeUsers: number;
  premiumUsers: number;
  usersWithStreak: number;
  totalQuestions: number;
  totalTests: number;
  publishedTests: number;
  totalTestAttempts: number;
  averageAccuracyPercent: number;
  averageToeicScore: number;
};

export type AdminUserApiItem = {
  id: number;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  currentLevel: string | null;
  targetScore: number | null;
  premium: boolean;
  verified?: boolean;
  role: string;
  status: 'ACTIVE' | 'BLOCKED' | 'DELETED' | string;
  createdAt: string;
};

export type ApiVoidResponse = ApiResponse<null>;

export type TestApiItem = {
  id: number;
  title: string;
  description: string | null;
  testType: string;
  totalDurationMinutes: number;
  targetScore: number;
  published: boolean;
  partCount: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  parts?: TestPartApiItem[];
};

export type TestPartApiItem = {
  id: number;
  partName: string;
  partNumber: number;
  partSection: string;
  description: string | null;
  sortOrder: number;
  durationMinutes: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  questions?: TestPartQuestionApiItem[];
};

export type TestPartQuestionApiItem = {
  id: number;
  questionId: number;
  sortOrder: number;
  questionText: string;
  partNo: number;
  difficultyLevel: string;
};

export type CreateTestRequest = {
  title: string;
  description?: string;
  testType: string;
  totalDurationMinutes: number;
  targetScore: number;
  published: boolean;
};

export type UpdateTestRequest = Partial<CreateTestRequest>;

export type CreateTestPartRequest = {
  partName: string;
  partNumber: number;
  partSection: string;
  description?: string;
  sortOrder: number;
  durationMinutes: number;
};

export type UpdateTestPartRequest = Partial<CreateTestPartRequest>;

export type AssignTestPartQuestionsRequest = {
  questionIds: number[];
};

export type AutoPopulateTestRequest = {
  groupPrefix?: string;
  replaceExisting?: boolean;
};

export type AutoPopulateTestApiItem = {
  testId: number;
  testTitle: string;
  createdPartCount: number;
  totalAssignedQuestions: number;
  assignedPerPart: Record<string, number>;
  parts: TestPartApiItem[];
};

export type AutoPopulateTestResponse = ApiResponse<AutoPopulateTestApiItem>;

export type TestListResponse = ApiResponse<TestApiItem[]>;
export type TestPartListResponse = ApiResponse<TestPartApiItem[]>;
export type TestPartQuestionListResponse = ApiResponse<TestPartQuestionApiItem[]>;

export type TestResponse = ApiResponse<TestApiItem>;
export type TestPartResponse = ApiResponse<TestPartApiItem>;

