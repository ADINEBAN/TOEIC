# Implementation Checklist - TOEIC Backend

## ✅ Phase 1: Core Security & User Management (COMPLETED)

### Authentication
- [x] JWT Custom Implementation (JwtService)
- [x] JWT Authentication Filter (JwtAuthenticationFilter)
- [x] OAuth2 Integration (Google, GitHub)
- [x] User Details Service (CustomUserDetailsService)
- [x] User Principal (UserPrincipal)
- [x] Auth Service (AuthService)
- [x] Auth Controller (AuthController)
- [x] Register Endpoint
- [x] Login Endpoint

### User Management
- [x] User Entity with Role
- [x] UserProfile Entity
- [x] User Repository
- [x] User Service
- [x] User Controller
- [x] Create User Endpoint
- [x] Get All Users Endpoint
- [x] Permission Entity & Repository

### Security Configuration
- [x] SecurityConfig with Role-Based Access Control
- [x] CorsConfig
- [x] JWT Filter Chain
- [x] OAuth2 User Service

---

## ✅ Phase 2: Placement Test & Learning Path Assignment (COMPLETED)

### Placement Test Domain
- [x] PracticeSet Enum: PracticeSetType (PLACEMENT, PRACTICE)
- [x] PracticeSet Entity: Add setType, durationMinutes fields
- [x] UserPracticeAttempt Entity: Add status field (IN_PROGRESS, SUBMITTED, TIMEOUT)
- [x] UserPracticeAnswer Entity
- [x] Question & QuestionOption Entities
- [x] PracticeSetQuestion Entity

### Placement Onboarding Service
- [x] PlacementOnboardingService
  - [x] assignRecommendedLearningPath(email) method
  - [x] resolvePlacementScore(userId) helper
  - [x] selectRecommendedLearningPath(targetScore) helper
  - [x] archiveActivePaths(userId) helper
- [x] PlacementOnboardingController with POST /api/placement-onboarding/assign-path

### Learning Path Domain
- [x] LearningPath Entity
- [x] LearningPathMilestone Entity
- [x] LearningModule Entity
- [x] MilestoneModule Entity
- [x] UserLearningPath Entity
- [x] UserModuleProgress Entity

### Repository Enhancements
- [x] UserPracticeAttemptRepository: findTopByUserIdAndPracticeSetSetTypeAndStatusOrderBySubmittedAtDesc()
- [x] LearningPathRepository: findFirstByActiveTrueAndTargetScoreGreaterThanEqualOrderByTargetScoreAsc()
- [x] LearningPathRepository: findFirstByActiveTrueOrderByTargetScoreDesc()
- [x] UserLearningPathRepository: findByUserIdAndStatus()

### Error & Success Codes
- [x] ErrorCode.LEARNING_PATH_NOT_FOUND (7001)
- [x] SuccessCode.LEARNING_PATH_ASSIGNED (1043)

### Security Authorization Fixes
- [x] JwtAuthenticationFilter: Load full authorities from DB
- [x] PlacementOnboardingController: @PreAuthorize("hasRole('USER')")
- [x] UserController: @PreAuthorize("hasRole('USER')")
- [x] PermissionController: @PreAuthorize("hasRole('ADMIN')")

---

## 📋 Phase 3: TODO - Practice/Test Management (Not Yet)

### Practice Attempt Management
- [ ] PracticeSetService
- [ ] UserPracticeAttemptService
  - [ ] startPracticeAttempt()
  - [ ] submitPracticeAttempt()
  - [ ] calculateScore()
  - [ ] savePracticeAnswers()
- [ ] PlacementTestController (separate from onboarding)
  - [ ] POST /api/placement/start/{practiceSetId}
  - [ ] POST /api/placement/{attemptId}/submit
  - [ ] GET /api/practice-sets
  - [ ] GET /api/placement/{attemptId}

### Scoring Engine
- [ ] Auto-scoring for multiple choice
- [ ] Score normalization to TOEIC scale
- [ ] Question analytics (difficulty tracking)

---

## 📋 Phase 4: TODO - Learning Progress Tracking (Not Yet)

### Module Progress
- [ ] UserModuleProgressService
  - [ ] startModule()
  - [ ] updateProgress()
  - [ ] completeModule()
  - [ ] getModuleProgress()
- [ ] ModuleProgressController
  - [ ] GET /api/users/me/modules
  - [ ] POST /api/users/me/modules/{moduleId}/start
  - [ ] PUT /api/users/me/modules/{moduleId}/progress

### Path Progress
- [ ] UserLearningPathService
  - [ ] getCurrentPath()
  - [ ] getUserProgress()
  - [ ] completePath()
- [ ] UserPathController
  - [ ] GET /api/users/me/path/current
  - [ ] GET /api/users/me/progress
  - [ ] PUT /api/users/me/goal

---

## 📋 Phase 5: TODO - Video Lessons (Not Yet)

### Video Content
- [ ] VideoLesson Entity (already created)
- [ ] VideoNote Entity
- [ ] UserVideoProgress Entity
- [ ] VideoLessonService
- [ ] VideoLessonController
  - [ ] GET /api/videos
  - [ ] GET /api/videos/{videoId}
  - [ ] POST /api/videos/{videoId}/progress

---

## 📋 Phase 6: TODO - Vocabulary Learning (Not Yet)

### Vocabulary System
- [ ] Vocabulary Entity (already created)
- [ ] VocabularyTopic Entity
- [ ] UserVocabularyProgress Entity
- [ ] VocabularyService
- [ ] VocabularyController
  - [ ] GET /api/vocabularies
  - [ ] GET /api/vocabularies/{topicId}
  - [ ] POST /api/users/me/vocabulary/{vocabId}/progress

---

## 📋 Phase 7: TODO - Admin Features (Not Yet)

### Content Management
- [ ] AdminPracticeSetController
  - [ ] POST /api/admin/practice-sets
  - [ ] PUT /api/admin/practice-sets/{id}
  - [ ] DELETE /api/admin/practice-sets/{id}
  - [ ] POST /api/admin/practice-sets/{id}/questions

- [ ] AdminLearningPathController
  - [ ] POST /api/admin/learning-paths
  - [ ] PUT /api/admin/learning-paths/{id}
  - [ ] DELETE /api/admin/learning-paths/{id}

- [ ] AdminPermissionController (already has GET)
  - [ ] POST /api/admin/permissions
  - [ ] PUT /api/admin/permissions/{id}
  - [ ] DELETE /api/admin/permissions/{id}

### Analytics
- [ ] UserAnalyticsController
  - [ ] GET /api/admin/analytics/users
  - [ ] GET /api/admin/analytics/users/{userId}
  - [ ] GET /api/admin/analytics/performance

---

## 📋 Phase 8: TODO - Advanced Features (Not Yet)

### Recommendations
- [ ] PlacementScoreBand Enum (350-400, 400-500, 500-600, ...)
- [ ] RecommendationEngine Service (ML-ready)
- [ ] Smart path selection based on user behavior

### Notifications
- [ ] Notification Entity
- [ ] NotificationService
- [ ] Email notifications (SMTP)
- [ ] Push notifications (FCM)

### Gamification
- [ ] Achievement/Badge System
- [ ] Streak Tracking
- [ ] Leaderboard

---

## 📋 Phase 9: TODO - Testing (Not Yet)

### Unit Tests
- [ ] AuthServiceTest
- [ ] UserServiceTest
- [ ] PlacementOnboardingServiceTest
- [ ] JwtServiceTest

### Integration Tests
- [ ] AuthControllerTest
- [ ] UserControllerTest
- [ ] PlacementOnboardingControllerTest
- [ ] SecurityConfigTest

### API Tests
- [ ] Postman Collection (with pre-defined test data)

---

## 📊 Database Schema Status

### Tables Created (Auto by Hibernate ddl-auto: update)
- [x] users
- [x] user_profiles
- [x] permissions
- [x] learning_paths
- [x] learning_path_milestones
- [x] learning_modules
- [x] milestone_modules
- [x] user_learning_paths
- [x] user_module_progress
- [x] practice_sets (with setType, durationMinutes added)
- [x] practice_set_questions
- [x] questions
- [x] question_options
- [x] user_practice_attempts (with status added)
- [x] user_practice_answers
- [x] courses
- [x] video_lessons
- [x] video_notes
- [x] user_video_progress
- [x] vocabularies
- [x] vocabulary_topics
- [x] user_vocabulary_progress

---

## 🔧 Configuration Status

### Environment Variables
- [x] JWT Secret
- [x] JWT Expiration
- [x] Database URL, Username, Password
- [ ] GOOGLE_CLIENT_ID (need to set)
- [ ] GOOGLE_CLIENT_SECRET (need to set)
- [ ] GITHUB_CLIENT_ID (need to set)
- [ ] GITHUB_CLIENT_SECRET (need to set)
- [ ] Email SMTP (for notifications - future)
- [ ] FCM credentials (for push notifications - future)

### Application Properties
- [x] Server Port: 8080
- [x] Context Path: /api
- [x] JPA DDL Auto: update
- [x] Show SQL: true
- [x] Multipart Max File Size: 10MB

---

## 🐛 Known Issues & Fixes Applied

### Fixed Issues
- [x] 403 Forbidden on /api/placement-onboarding/assign-path
  - Root Cause: Authority mismatch (hasAuthority('USER') vs ROLE_USER)
  - Fix: Changed to hasRole('USER'), updated JwtAuthenticationFilter to load full authorities

- [x] Authority sync between token and JWT filter
  - Root Cause: Only role claim was extracted from JWT
  - Fix: JWT filter now loads full UserDetails from DB including permissions

---

## 📝 Documentation

- [x] README.md - Complete API documentation
- [x] API_TESTING.md - Postman collection & testing guide
- [x] IMPLEMENTATION.md - This checklist

---

## 🚀 Next Steps (Recommended Order)

1. **Complete Phase 3** - Implement PlacementTestController and scoring logic
2. **Complete Phase 4** - Implement learning progress tracking
3. **Add test data** - Create seed SQL for practice sets and learning paths
4. **Complete Phase 5** - Video lessons (if needed)
5. **Complete Phase 6** - Vocabulary learning (if needed)
6. **Complete Phase 7** - Admin CRUD operations
7. **Testing** - Write comprehensive unit & integration tests
8. **Deployment** - Docker containerization, CI/CD pipeline

---

## 📞 Support

For API issues: Check API_TESTING.md for examples and error codes
For architecture questions: Refer to README.md Domain Model section
For security questions: Check SecurityConfig.java and JwtService.java



- **Milestone M3 & M4 Backend Sign-off:** Completed Vocabulary, Question Bank, Practice Sets, Placement Onboarding (CR-02), and Timed Mock Exam APIs.

---

## Document-to-Test AI & Full-Length Video Engine (Flyway V2 Upgrade)

### Database Schema Additions (`V2__document_test_and_video_engine.sql`)
- [x] `imported_documents`, `imported_document_passages`, `imported_document_questions` (source fidelity metadata, Part 5/6/7 classification, official vs unverified answer keys, validation warnings)
- [x] `imported_videos`, `video_processing_jobs` (async chunk checkpoints, cancel/retry state, duration verification)
- [x] `video_audio_tracks`, `video_transcripts`, `video_subtitle_segments` (per-segment confidence, uncertainty markers, chunk index)
- [x] `user_video_learning_states`, `video_bookmarks`, `video_vocabulary_items`
- [x] Safe additive columns on `tests` (`source_document_id`, `owner_user_id`, `visibility_scope`, `ai_generated`) and `questions` (`source_document_id`, `source_page_number`, `source_question_number`, `extraction_confidence`, `answer_key_verified`, `ai_suggested_label`)

### Python Tooling & Runtime Properties (`application.yaml`)
- [x] `toeic.storage-dir` (`./data` default for document uploads & video audio chunks)
- [x] `toeic.python-bin` (`python`) + scripts `ocr_bridge.py` (`rapidocr-onnxruntime`) & `video_processor.py` (`yt-dlp`, `youtube-transcript-api`, `imageio-ffmpeg`, `faster-whisper`)
- [x] `toeic.whisper-model` (`tiny.en`), `toeic.video-chunk-seconds` (`300`), `toeic.resume-jobs-on-startup` (`true`)
- [x] `openai.api-key` (`OPENAI_API_KEY`) and `speechify.api-key` (`SPEECHIFY_API_KEY`) for cloud LLM/Whisper/TTS with graceful local fallbacks

---

## Admin-Controlled Video Learning Library (Flyway V3 & V4 Upgrade)
- [x] `V3__admin_controlled_video_library.sql` & `V4__expand_permission_role_constraint.sql`: Non-destructive migration adding `CONTENT_MANAGER` role support, `workflow_status` (`DRAFT` → `DOWNLOADING` → `TRANSCRIBING` → `TRANSLATING` → `REVIEWING` → `PUBLISHED` / `ARCHIVED` / `FAILED`), `is_published`, `published_at`, `reviewed_by_user_id`, `description`, and per-user `user_video_learning_states.is_favorite` while preserving all existing videos and progress.
- [x] `AdminVideoLibraryController` (`/api/admin/videos`) + `SecurityConfig` + service-level RBAC enforcing **HTTP 403 Forbidden** for regular `USER` accounts on all video import, job control, subtitle edit, publish, unpublish, archive, and delete endpoints.
- [x] Strict Publish Readiness Gate (`evaluatePublishBlockers`) verifying `COMPLETED` job, verified full media duration, non-blank transcript, completed EN–VI bilingual subtitle segments, and valid metadata before publication.
- [x] `UserVideoController` (`/api/users/videos`) exposing only `PUBLISHED` videos to regular learners with search/level/topic/favorites filtering, per-user progress tracking, and per-user timestamp bookmarks.


