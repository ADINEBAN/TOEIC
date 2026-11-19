# API Testing Guide - TOEIC Backend

## Postman Collection - Quick Start

### 1. REGISTER (Đăng ký)
```http
POST http://localhost:8080/api/auth/register
Content-Type: application/json

{
  "email": "testuser@example.com",
  "password": "Test@123456",
  "fullName": "Test User",
  "avatarUrl": "https://example.com/avatar.jpg",
  "currentLevel": "BEGINNER",
  "targetScore": 500
}
```

**Response 201:**
```json
{
  "code": 1042,
  "message": "User created successfully",
  "status": "CREATED",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlckBleGFtcGxlLmNvbSIsInJvbGUiOiJST0xFX1VTRVIiLCJpYXQiOjE2OTQ1MzQ3MzgsImV4cCI6MTY5NDYyMTEzOH0.abc123...",
    "tokenType": "Bearer",
    "expiresIn": 86400000,
    "user": {
      "id": 1,
      "email": "testuser@example.com",
      "fullName": "Test User",
      "role": "USER",
      "targetScore": 500
    }
  },
  "timestamp": "10:45:38 13-04-2026"
}
```

---

### 2. LOGIN (Đăng nhập)
```http
POST http://localhost:8080/api/auth/login
Content-Type: application/json

{
  "email": "testuser@example.com",
  "password": "Test@123456"
}
```

**Response 200:**
```json
{
  "code": 1040,
  "message": "Login successfully",
  "status": "OK",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 86400000,
    "user": {
      "id": 1,
      "email": "testuser@example.com",
      "fullName": "Test User",
      "role": "USER"
    }
  },
  "timestamp": "10:45:38 13-04-2026"
}
```

> **Lưu lại `accessToken` để dùng cho các API khác!**

---

### 3. GET ALL USERS (Lấy danh sách người dùng)
```http
GET http://localhost:8080/api/users
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json
```

**Response 200:**
```json
{
  "code": 1042,
  "message": "User created successfully",
  "status": "OK",
  "data": [
    {
      "id": 1,
      "email": "testuser@example.com",
      "fullName": "Test User",
      "role": "USER",
      "targetScore": 500,
      "premium": false,
      "status": "ACTIVE"
    },
    {
      "id": 2,
      "email": "admin@example.com",
      "fullName": "Admin User",
      "role": "ADMIN",
      "targetScore": 800,
      "premium": true,
      "status": "ACTIVE"
    }
  ],
  "timestamp": "10:45:38 13-04-2026"
}
```

---

### 4. GET PRACTICE SETS (Lấy danh sách đề test)
```http
GET http://localhost:8080/api/practice-sets
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json
```

**Response 200:**
```json
{
  "code": 1000,
  "message": "Practice sets retrieved",
  "status": "OK",
  "data": [
    {
      "id": 1,
      "title": "Placement Test - Beginner",
      "description": "Initial assessment test",
      "partNo": 1,
      "targetScore": 300,
      "setType": "PLACEMENT",
      "durationMinutes": 20,
      "published": true,
      "createdAt": "2026-04-13T00:00:00",
      "updatedAt": "2026-04-13T00:00:00"
    },
    {
      "id": 2,
      "title": "Part 1 Practice Set",
      "description": "Listening - Photography",
      "partNo": 1,
      "targetScore": null,
      "setType": "PRACTICE",
      "durationMinutes": 15,
      "published": true,
      "createdAt": "2026-04-13T00:00:00",
      "updatedAt": "2026-04-13T00:00:00"
    }
  ],
  "timestamp": "10:45:38 13-04-2026"
}
```

---

### 5. START PLACEMENT TEST (Bắt đầu làm bài test)
```http
POST http://localhost:8080/api/placement/start/1
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json
```

**Response 201:**
```json
{
  "code": 1000,
  "message": "Practice attempt created",
  "status": "CREATED",
  "data": {
    "id": 10,
    "userId": 1,
    "practiceSetId": 1,
    "startedAt": "2026-04-13T10:45:38",
    "submittedAt": null,
    "score": null,
    "correctCount": 0,
    "totalQuestions": 50,
    "durationSeconds": 0,
    "status": "IN_PROGRESS",
    "createdAt": "2026-04-13T10:45:38",
    "updatedAt": "2026-04-13T10:45:38"
  },
  "timestamp": "10:45:38 13-04-2026"
}
```

> **Lưu lại `id: 10` (attemptId) để submit bài test!**

---

### 6. SUBMIT PLACEMENT TEST (Nộp bài test)
```http
POST http://localhost:8080/api/placement/10/submit
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json

{
  "answers": [
    {
      "questionId": 1,
      "selectedOptionId": 5
    },
    {
      "questionId": 2,
      "selectedOptionId": 8
    },
    {
      "questionId": 3,
      "selectedOptionId": 12
    }
  ],
  "durationSeconds": 1200
}
```

**Response 200:**
```json
{
  "code": 1000,
  "message": "Practice attempt submitted",
  "status": "OK",
  "data": {
    "id": 10,
    "userId": 1,
    "practiceSetId": 1,
    "startedAt": "2026-04-13T10:45:38",
    "submittedAt": "2026-04-13T10:55:38",
    "score": 650.0,
    "correctCount": 39,
    "totalQuestions": 50,
    "durationSeconds": 1200,
    "status": "SUBMITTED",
    "createdAt": "2026-04-13T10:45:38",
    "updatedAt": "2026-04-13T10:55:38"
  },
  "timestamp": "10:55:38 13-04-2026"
}
```

---

### 7. UPDATE TARGET SCORE (Cập nhật mục tiêu điểm)
```http
PUT http://localhost:8080/api/users/me/goal
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json

{
  "targetScore": 800
}
```

**Response 200:**
```json
{
  "code": 1030,
  "message": "User goal updated",
  "status": "OK",
  "data": {
    "id": 1,
    "email": "testuser@example.com",
    "fullName": "Test User",
    "role": "USER",
    "targetScore": 800,
    "currentLevel": "BEGINNER",
    "status": "ACTIVE"
  },
  "timestamp": "10:55:38 13-04-2026"
}
```

---

### 8. ASSIGN LEARNING PATH (Gán lộ trình - Placement Onboarding) ⭐
```http
POST http://localhost:8080/api/placement-onboarding/assign-path
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json
```

**Response 200 (Thành công):**
```json
{
  "code": 1043,
  "message": "Learning path assigned successfully",
  "status": "OK",
  "data": {
    "id": 15,
    "userId": 1,
    "learningPathId": 3,
    "source": "PLACEMENT_ONBOARDING",
    "status": "ACTIVE",
    "assignedAt": "2026-04-13T10:55:38",
    "completedAt": null,
    "createdAt": "2026-04-13T10:55:38",
    "updatedAt": "2026-04-13T10:55:38"
  },
  "timestamp": "10:55:38 13-04-2026"
}
```

**Response 404 (Nếu không có path nào phù hợp):**
```json
{
  "code": 7001,
  "message": "No active learning path found",
  "status": "NOT_FOUND",
  "timestamp": "10:55:38 13-04-2026"
}
```

---

### 9. GET CURRENT LEARNING PATH (Lấy lộ trình hiện tại)
```http
GET http://localhost:8080/api/users/me/path/current
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json
```

**Response 200:**
```json
{
  "code": 1000,
  "message": "Current learning path retrieved",
  "status": "OK",
  "data": {
    "id": 15,
    "userId": 1,
    "learningPathId": 3,
    "source": "PLACEMENT_ONBOARDING",
    "status": "ACTIVE",
    "assignedAt": "2026-04-13T10:55:38",
    "completedAt": null,
    "path": {
      "id": 3,
      "code": "PATH_500_800",
      "title": "500+ to 800+ Score Path",
      "description": "Advanced learning path for students aiming 800+",
      "targetScore": 800,
      "active": true,
      "milestones": [
        {
          "id": 10,
          "title": "Advanced Grammar",
          "sortOrder": 1,
          "modules": []
        },
        {
          "id": 11,
          "title": "Reading Comprehension",
          "sortOrder": 2,
          "modules": []
        }
      ]
    },
    "createdAt": "2026-04-13T10:55:38",
    "updatedAt": "2026-04-13T10:55:38"
  },
  "timestamp": "10:55:38 13-04-2026"
}
```

---

### 10. GET USER PROGRESS (Lấy tiến độ học)
```http
GET http://localhost:8080/api/users/me/progress
Authorization: Bearer <YOUR_JWT_TOKEN>
Content-Type: application/json
```

**Response 200:**
```json
{
  "code": 1000,
  "message": "User progress retrieved",
  "status": "OK",
  "data": {
    "userId": 1,
    "email": "testuser@example.com",
    "fullName": "Test User",
    "currentPath": {
      "id": 15,
      "pathId": 3,
      "pathTitle": "500+ to 800+ Score Path",
      "status": "ACTIVE",
      "assignedAt": "2026-04-13T10:55:38"
    },
    "moduleProgress": [
      {
        "id": 1,
        "moduleName": "Grammar Basics",
        "status": "NOT_STARTED",
        "progressPercent": 0.0,
        "startedAt": null,
        "completedAt": null,
        "score": null
      },
      {
        "id": 2,
        "moduleName": "Listening Part 1",
        "status": "IN_PROGRESS",
        "progressPercent": 45.0,
        "startedAt": "2026-04-13T08:00:00",
        "completedAt": null,
        "score": null
      }
    ],
    "overallProgress": 22.5,
    "lastAccessedAt": "2026-04-13T10:55:38"
  },
  "timestamp": "10:55:38 13-04-2026"
}
```

---

### 11. GET ADMIN PERMISSIONS (Lấy danh sách quyền - Admin Only)
```http
GET http://localhost:8080/api/admin/permissions
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```

**Response 200:**
```json
{
  "code": 1000,
  "message": "Permissions retrieved",
  "status": "OK",
  "data": [
    {
      "id": 1,
      "code": "USER_LESSON_VIEW",
      "description": "View lessons",
      "role": "USER"
    },
    {
      "id": 2,
      "code": "USER_TEST_TAKE",
      "description": "Take tests",
      "role": "USER"
    },
    {
      "id": 10,
      "code": "ADMIN_PERMISSION_VIEW",
      "description": "View permissions",
      "role": "ADMIN"
    }
  ],
  "timestamp": "10:55:38 13-04-2026"
}
```

---

## Error Responses

### 401 - Unauthorized (Token không hợp lệ/hết hạn)
```json
{
  "code": 401,
  "message": "Unauthorized",
  "status": "UNAUTHORIZED",
  "timestamp": "10:55:38 13-04-2026"
}
```

### 403 - Forbidden (Không có quyền)
```json
{
  "code": 403,
  "message": "Forbidden",
  "status": "FORBIDDEN",
  "timestamp": "10:55:38 13-04-2026"
}
```

### 400 - Bad Request
```json
{
  "code": 1008,
  "message": "Invalid account data",
  "status": "BAD_REQUEST",
  "timestamp": "10:55:38 13-04-2026"
}
```

### 404 - Not Found
```json
{
  "code": 7001,
  "message": "No active learning path found",
  "status": "NOT_FOUND",
  "timestamp": "10:55:38 13-04-2026"
}
```

---

## Testing Workflow

### Scenario 1: New User Onboarding
```
1. REGISTER                    → Nhận token
2. LOGIN                       → Nhận token mới
3. GET PRACTICE SETS           → Tìm placement test (setType = PLACEMENT)
4. START PLACEMENT TEST        → Bắt đầu test với id=1
5. SUBMIT PLACEMENT TEST       → Nộp bài, nhận score
6. UPDATE TARGET SCORE         → (Optional) Cập nhật mục tiêu
7. ASSIGN LEARNING PATH        → Gán lộ trình tự động
8. GET CURRENT LEARNING PATH   → Xem lộ trình được gán
9. GET USER PROGRESS           → Xem tiến độ học
```

### Scenario 2: Admin Check Permissions
```
1. LOGIN AS ADMIN              → Nhận admin token
2. GET ADMIN PERMISSIONS       → Xem tất cả permissions
```

---

## Notes

- **Token Expiry**: 24 hours (86400000 ms)
- **Base URL**: `http://localhost:8080/api`
- **Context Path**: `/api` (tự động thêm vào tất cả endpoint)
- **Headers cần thiết**: `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Default Test Email**: `testuser@example.com`
- **Default Test Password**: `Test@123456`

---

## Admin Learning Path Content APIs (New)

> Tất cả API dưới đây cần token admin: `Authorization: Bearer <ADMIN_TOKEN>`

### 1) Create milestone cho learning path
```http
POST http://localhost:8080/api/admin/learning-paths/{learningPathId}/milestones
Content-Type: application/json

{
  "title": "Giai đoạn 1 - Nền tảng",
  "description": "Xây nền từ vựng và nghe cơ bản",
  "sortOrder": 1
}
```

### 2) Add module vào milestone
```http
POST http://localhost:8080/api/admin/milestones/{milestoneId}/modules
Content-Type: application/json

{
  "moduleId": 1,
  "sortOrder": 1,
  "required": true,
  "unlockCondition": "DEFAULT"
}
```

### 3) Create video lesson cho module VIDEO
```http
POST http://localhost:8080/api/admin/video-lessons
Content-Type: application/json

{
  "moduleId": 1,
  "title": "Part 1 Strategy Intro",
  "description": "Giới thiệu chiến lược làm Part 1",
  "videoUrl": "https://cdn.example.com/video-part1.mp4",
  "durationSeconds": 900,
  "sortOrder": 1,
  "free": true,
  "published": true
}
```

### 4) Create practice set cho module PRACTICE
```http
POST http://localhost:8080/api/admin/practice-sets
Content-Type: application/json

{
  "moduleId": 2,
  "title": "Part 5 Mini Test 01",
  "description": "Bộ câu hỏi ngữ pháp cơ bản",
  "partNo": 5,
  "targetScore": 500,
  "setType": "PRACTICE",
  "durationMinutes": 20,
  "published": true
}
```

### 5) APIs list nhanh theo module/milestone & Catalog theo mục tiêu điểm
- `GET /api/admin/learning-paths/overview` — Admin Visual Curriculum Builder tree (`LearningPath -> Milestones -> MilestoneModules` kèm đếm Flashcard / Video / Practice Set)
- `POST /api/admin/milestones/{milestoneId}/modules/quick` — Tạo Mô-đun mới và gắn thẳng vào Chặng trong 1 transaction
- `GET /api/users/learning/paths` — User catalog chỉ gồm các lộ trình `active=true`, kèm số chặng, số mô-đun, tài nguyên thực tế và cờ `recommended` / `enrolled` khớp theo `user.targetScore`
- `GET /api/admin/learning-paths/{learningPathId}/milestones`
- `GET /api/admin/milestones/{milestoneId}/modules`
- `GET /api/admin/video-lessons/modules/{moduleId}`
- `GET /api/admin/practice-sets/modules/{moduleId}`




- **QA Regression Sign-off:** 100% pass rate across JUnit controller tests (AdminLearningPathControllerTest) and Postman E2E collections (TOEIC_Trainer_Admin_Flow, TOEIC_Trainer_Admin_LearningPath_Milestones).

---

## AI Document-to-TOEIC Test Generator (`/api/users/documents`)

> Requires User or Admin JWT: `Authorization: Bearer <TOKEN>`. Only Parts **5, 6, and 7** are extracted and generated (Parts 1–4 are excluded because source audio is absent). Private user exams are isolated by `ownerUserId`.

### 1) Upload & Extract TOEIC Document (`PDF`, `DOCX`, `DOC`, `TXT`, Scanned PDF / PNG / JPG)
```http
POST http://localhost:8082/api/users/documents/upload
Content-Type: multipart/form-data

file=@sample-toeic-part5-6-7.pdf
```

### 2) List User's Uploaded Documents & Generated Exams
- `GET /api/users/documents` — List uploaded documents and extraction validation status
- `GET /api/users/documents/{documentId}` — Inspect passages, questions, warnings, source page numbers, and verification status
- `GET /api/users/documents/exams` — List exams generated by the authenticated user

### 3) Interactive Review, Edit, Reclassify, Remove & AI Key Analysis
```http
PUT http://localhost:8082/api/users/documents/{documentId}/questions/{questionId}
Content-Type: application/json

{
  "partNo": 5,
  "originalQuestionNumber": 101,
  "pageNumber": 1,
  "questionText": "All employees must submit their travel expense reports ______ Friday afternoon.",
  "options": [
    {"optionLabel": "A", "optionText": "by"},
    {"optionLabel": "B", "optionText": "until"},
    {"optionLabel": "C", "optionText": "during"},
    {"optionLabel": "D", "optionText": "among"}
  ],
  "officialCorrectLabel": "A",
  "answerKeyVerified": true,
  "included": true
}
```
- `DELETE /api/users/documents/{documentId}/questions/{questionId}` — Remove an invalid extracted item (`included = false`)
- `POST /api/users/documents/{documentId}/analyze-answers` — Run AI-assisted answer suggestion separately (`aiSuggestedLabel`, keeps `answerKeyVerified = false` unless confirmed by user)

### 4) Confirm & Generate Interactive TOEIC Exam
```http
POST http://localhost:8082/api/users/documents/{documentId}/confirm-exam
Content-Type: application/json

{
  "testTitle": "Imported TOEIC Reading Practice",
  "description": "Generated from official Reading PDF",
  "selectedParts": [5, 6, 7],
  "durationMinutes": 45
}
```
Generated exams work directly with `/api/users/tests/{testId}`, `/api/users/tests/{testId}/start`, `/api/users/tests/attempts/{attemptId}/submit`, `/api/users/tests/attempts/{attemptId}/details`, and `/api/users/tests/questions/explain`.

---

## Admin-Controlled Video Learning Library (`/api/admin/videos` & `/api/users/videos`)

> Centralized video content management with strict RBAC (`ROLE_ADMIN`, `ROLE_CONTENT_MANAGER`). Regular `ROLE_USER` accounts receive **HTTP 403 Forbidden** when attempting import, job control, subtitle editing, publishing, unpublishing, archiving, or deletion.

### 1) Admin / Content Manager: Import & Process Full Video (`POST /api/admin/videos/import`)
> Omit or leave `title`, `description`, `topicHint`, or `preferredLevel` (`"AUTO"` / omitted) blank to let AI automatically summarize them from the extracted transcript. Set `"forceAsr": false` for the fast `metadata-and-captions` + parallel translation path.
```http
POST http://localhost:8082/api/admin/videos/import
Authorization: Bearer <ADMIN_OR_CONTENT_MANAGER_JWT>
Content-Type: application/json

{
  "videoUrl": "https://www.youtube.com/watch?v=8jPQjjsBbIc",
  "forceAsr": false
}
```

### 2) Admin / Content Manager: Review, Edit Subtitles, AI Summarize & Publish Workflow
Workflow states: `DRAFT` → `DOWNLOADING` → `TRANSCRIBING` → `TRANSLATING` → `REVIEWING` → `PUBLISHED` (plus `ARCHIVED` / `FAILED`).

- `GET /api/admin/videos?status=ALL|PROCESSING|REVIEWING|PUBLISHED|FAILED_OR_ARCHIVED&search=...` — List all videos with job metrics & `publishBlockers`
- `GET /api/admin/videos/{videoId}` — Retrieve full detail, `fullEnglishTranscript`, `segments`, `readyToPublish`, and `publishBlockers`
- `PUT /api/admin/videos/{videoId}` — Edit `title`, `description`, `authorName`, `level`, `topic`, `thumbnailUrl`
- `POST /api/admin/videos/{videoId}/ai-summarize?overwriteAll=false|true` — AI-summarize concise Title, Topic, Vietnamese Description, and CEFR Level (`A2`–`C1`) from transcript/subtitles (`overwriteAll=false` preserves manually entered values)
- `PUT /api/admin/videos/{videoId}/subtitles` — Update synchronized bilingual subtitle segments (`startTime`, `endTime`, `englishText`, `vietnameseText`) and `fullEnglishTranscript`
- `POST /api/admin/videos/{videoId}/publish` — Publish to User Library (requires `COMPLETED` job, verified full duration, non-blank transcript, completed EN+VI subtitles, and valid metadata)
- `POST /api/admin/videos/{videoId}/unpublish` — Unpublish back to `REVIEWING`
- `POST /api/admin/videos/{videoId}/archive` — Archive video (`ARCHIVED`, unpublished)
- `DELETE /api/admin/videos/{videoId}` — Delete video and associated tracks/subtitles/jobs
- `GET /api/admin/videos/jobs/{jobId}`, `POST .../cancel`, `POST .../retry` — Monitor, cancel, or retry background processing jobs

### 3) Learner: Published Video Learning Library (`/api/users/videos`)
- `GET /api/users/videos?search=&level=&topic=&favoritesOnly=true|false` — Browse **only `PUBLISHED`** videos (draft/reviewing/failed/archived videos remain invisible)
- `GET /api/users/videos/{videoId}` — Retrieve published video detail, synchronized bilingual segments, TOEIC vocabulary, per-user progress, and per-user bookmarks
- `PUT /api/users/videos/{videoId}/state` — Persist per-user `lastPositionSeconds`, `playbackSpeed` (`0.5`–`2.0`), `completed`, and `favorite`
- `POST /api/users/videos/{videoId}/bookmarks` / `DELETE /api/users/videos/{videoId}/bookmarks/{bookmarkId}` — Manage per-user timestamp bookmarks
- `POST /api/users/youtube/word-lookup` — Contextual English–Vietnamese vocabulary lookup for saving to Flashcards
- `GET /api/users/videos/{videoId}/subtitles/export?format=srt_bilingual|srt_en|srt_vi|vtt|json` — Export UTF-8 subtitles without truncation

