# Document-to-Test AI & Admin-Controlled Video Learning Library

## 1. AI Document-to-TOEIC Test Generator (Module 1)

### Pipeline Overview
1. **Upload & Validation (`POST /api/users/documents/upload`)**: Accepts `.pdf`, `.docx`, `.doc`, `.txt`, and image formats (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tif`, `.tiff`) via `DocumentTextExtractionService`.
2. **Text, Table & OCR Extraction**:
   - Digital PDFs are parsed page-by-page using Apache PDFBox 3.0.3 (`Loader.loadPDF`). Sparse/scanned PDF pages are rendered at 220 DPI (`PDFRenderer`) and processed alongside raw uploaded images through `ocr_bridge.py` (`rapidocr-onnxruntime` with column-aware sorting).
   - Word documents extract paragraphs and table structures via Apache POI (`poi-ooxml` for `.docx`, `poi-scratchpad` for `.doc`).
3. **TOEIC Part 5 / 6 / 7 Classification & Strict Source Fidelity (`ToeicDocumentParserService`)**:
   - Extracts **only Reading Part 5 (Incomplete Sentences), Part 6 (Text Completion), and Part 7 (Reading Comprehension)**.
   - Sections labeled Part 1, Part 2, Part 3, or Part 4 (Listening) are explicitly detected and excluded with warnings because audio recordings are unavailable.
   - Preserves verbatim English prompts, question numbers, answer options `(A)–(D)`, single/double/triple passages, tables, and source page numbers without generating or paraphrasing questions from general knowledge.
   - If the document contains an answer key section, official keys are mapped (`answerKeyVerified = true`). If absent, keys remain unset (`answerKeyVerified = false`) and users may optionally trigger separate AI analysis (`POST /api/users/documents/{id}/analyze-answers`), which populates `aiSuggestedLabel` without overwriting official ground truth.
4. **Validation & Interactive Preview (`ToeicDocumentValidationService`)**:
   - Detects missing options, duplicate question numbers, unlinked Part 6/7 passages, excluded Listening items, and empty text.
   - Users review, edit text/choices/answers, reclassify Part 5/6/7, or remove invalid questions (`PUT`/`DELETE .../questions/{questionId}`) before confirming exam generation (`POST .../confirm-exam`).
5. **Exam Generation & Practice Reuse (`DocumentExamService`, `UserTestService`)**:
   - Generates standard `Test`, `TestPart`, `Question`, `QuestionOption`, and `TestPartQuestion` rows with `visibilityScope = PRIVATE` and `ownerUserId` scoping.
   - Reuses existing `ExamScreen` (with part filtering `?partFilter=` and wrong-question retry `?retryIds=`), `AttemptReviewScreen`, and OpenAI answer explanation endpoints.

---

## 2. Admin-Controlled Video Learning Library & Bilingual Subtitle Engine

### Architecture & Role-Based Access Control (RBAC)
Video URL import, AI transcription/translation job control, subtitle editing, and content publishing are centralized in the **Admin Console** (`/admin/dashboard` → **Thư viện Video AI**) and strictly protected on the backend via Spring Security (`SecurityConfig`, `@PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER')")`, and service-level `requireAdminOrContentManager`):

- **Permitted Content Roles (`ROLE_ADMIN`, `ROLE_CONTENT_MANAGER`)**:
  - `POST /api/admin/videos/import` — Import full-length YouTube or media URLs (`1m`, `10m`, `45m`, `60m+` without 60s truncation). `title`, `description`, `topicHint`, and `preferredLevel` (`AUTO`) may be left blank; AI automatically summarizes them from the transcript without overwriting manually supplied fields. Jobs dispatch cleanly via `TransactionSynchronizationManager.afterCommit()` and are backed by a `@Scheduled` `QUEUED`-job watchdog.
  - `POST /api/admin/videos/{videoId}/ai-summarize?overwriteAll=false|true` — Re-run AI metadata summarization (concise Title, Domain Topic, Vietnamese Description, and CEFR Level `A2`–`C1`) from the video transcript/subtitles.
  - `GET /api/admin/videos` & `GET /api/admin/videos/{videoId}` — Inspect all videos across workflow states, job metrics, and publish readiness blockers.
  - `PUT /api/admin/videos/{videoId}` — Edit title, description, channel/author, level, topic, and thumbnail metadata.
  - `PUT /api/admin/videos/{videoId}/subtitles` & `PUT /api/admin/videos/{videoId}/subtitles/{segmentId}` — Edit full English transcripts and synchronized bilingual EN–VI subtitle segments; refreshes extracted TOEIC vocabulary automatically.
  - `POST /api/admin/videos/{videoId}/publish`, `/unpublish`, `/archive`, `DELETE /api/admin/videos/{videoId}` — Manage the publication lifecycle.
  - `GET /api/admin/videos/jobs/{jobId}`, `POST .../cancel`, `POST .../retry` — Monitor background processing jobs, cancel active FFmpeg/Python subprocesses, or resume interrupted/failed jobs from `lastCompletedChunk`.
- **Fast-Path & Parallel Processing Pipeline**:
  - When `forceAsr=false` and subtitles exist, Stage 1 runs Python `metadata-and-captions` (`yt-dlp` metadata + `youtube-transcript-api` concurrently), bypassing audio download and Whisper ASR.
  - When Whisper ASR is needed, `prepare-audio` uses single-pass `ffmpeg` segmentation (default `480s` chunks at `16kHz` mono `32kbps`) followed by bounded parallel chunk transcription (`chunkAsrPool`).
  - Translation processes batches of 35 segments in 4-way parallel waves (`translationWavePool`, with 6-thread parallel Google fallback) plus single-batch key vocabulary translation.
- **HTTP 403 Enforcement for Regular Users (`ROLE_USER`)**:
  - Regular users attempting any restricted operation (`/api/admin/videos/**`, `/api/users/videos/import`, `/api/users/videos/jobs/**`, or `/api/users/youtube/subtitles`) receive **HTTP 403 Forbidden** (`ErrorCode.ACCESS_DENIED`).

### Publishing Workflow & Readiness Gate
Videos progress through:
`DRAFT` → `DOWNLOADING` → `TRANSCRIBING` → `TRANSLATING` → `REVIEWING` → `PUBLISHED` (plus `ARCHIVED` and `FAILED`).

`VideoLearningService.publishVideo` enforces all five readiness checks before setting `published = true` and `workflowStatus = "PUBLISHED"`:
1. Background `VideoProcessingJob` status is `COMPLETED`.
2. Full media duration is verified (`durationSeconds > 0`, `verifiedMediaDurationSeconds > 0`, and within tolerance).
3. Full English transcript (`VideoTranscript.fullEnglishText`) is non-blank.
4. Synchronized subtitle segments (`VideoSubtitleSegment`) are present and **every segment** has non-blank English and Vietnamese text.
5. Required metadata (`title`, `sourceUrl`) is valid.

### User Video Learning Library (`/user/youtube-studio`)
- Regular learners have **no** URL import or video creation UI.
- Learners browse **only `PUBLISHED` videos** (`GET /api/users/videos?search=&level=&topic=&favoritesOnly=`). `DRAFT`, `DOWNLOADING`, `TRANSCRIBING`, `TRANSLATING`, `REVIEWING`, `ARCHIVED`, and `FAILED` videos remain invisible in both list and detail endpoints.
- Learners watch published videos in-app, switch between **EN–VI Bilingual**, **EN-only**, and **VI-only** subtitles, adjust playback speed (`0.5x–2.0x`), tap any subtitle line to seek, tap any word to look up contextual meanings (`POST /api/users/youtube/word-lookup`) and save to personal **Flashcards**, bookmark videos (`UserVideoLearningState.favorite` isolated per user) and timestamps (`VideoBookmark` isolated per user), track playback progress (`lastPositionSeconds`, `completed`), and export UTF-8 SRT/WebVTT/JSON subtitles.

### Database Migrations (`V2`, `V3`, `V4`)
- `V2__document_test_and_video_engine.sql`: Core document import and full-length video tables (`imported_videos`, `video_processing_jobs`, `video_audio_tracks`, `video_transcripts`, `video_subtitle_segments`, `user_video_learning_states`, `video_bookmarks`, `video_vocabulary_items`).
- `V3__admin_controlled_video_library.sql`: Non-destructively widens `users.role` for `CONTENT_MANAGER`, adds `description`, `workflow_status`, `is_published`, `published_at`, `reviewed_by_user_id` on `imported_videos`, adds per-user `is_favorite` on `user_video_learning_states`, and preserves all pre-existing completed videos and user learning progress.
- `V4__expand_permission_role_constraint.sql`: Widens Hibernate's ordinal check constraint on `permissions.role` so `CONTENT_MANAGER` seeds cleanly alongside `USER` and `ADMIN`.

---

## 3. Environment Variables & Known Limitations

### Required / Optional API Keys
- `OPENAI_API_KEY`: Recommended for Part 5/6/7 AI answer suggestions, Question AI Explanation, cloud Whisper ASR (`whisper-1`), and contextual GPT EN–VI subtitle translation. Without it, OCR/PDFBox/POI extraction, local `faster-whisper` ASR, and fallback translation/dictionary lookup remain functional.
- `SPEECHIFY_API_KEY`: Used by `SpeechifyTtsService` for realistic English neural TTS voices; falls back gracefully when absent.
- Python packages on the backend host: `yt-dlp`, `youtube-transcript-api`, `imageio-ffmpeg`, `faster-whisper`, `rapidocr-onnxruntime`, `pypdf`, `python-docx`, `pillow`.
