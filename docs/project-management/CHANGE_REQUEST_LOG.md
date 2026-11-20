# 📋 HỒ SƠ QUẢN LÝ THAY ĐỔI DỰ ÁN (CHANGE REQUEST LOG)

**Dự án:** Hệ thống Luyện thi & Lộ trình Học TOEIC Cá nhân hóa (`TOEIC_Trainer`)  
**Học phần:** Quản lý Dự án Phần mềm (QLDA - VKU)  
**Thời gian thực hiện:** `05/09/2026` – `21/11/2026` (6 Sprints / Milestones `M1` ➔ `M6`)  

---

## 1. Bảng Tổng Hợp Hồ Sơ Change Request (CCB Register)

| Mã CR | GitHub Issue | Ngày yêu cầu | Người đề xuất | Người phê duyệt (CCB) | Sprint | Mức độ ưu tiên | Trạng thái |
| :---: | :---: | :---: | :--- | :--- | :---: | :---: | :---: |
| **`CR-01`** | `#72` | `30/09/2026` | `ADINEBAN` (R2 - Tech Lead) | `Vuanh47` (R1 - PM) | Sprint 2 (`M2`) | **High (P0)** | ✅ **Approved & Merged** (`03/10/2026`) |
| **`CR-02`** | `#73` | `12/10/2026` | `Vuanh47` (R1) & `anhht10` (R4) | `ADINEBAN` (R2 - Architect) | Sprint 3 (`M3`) | **High (P0)** | ✅ **Approved & Merged** (`16/10/2026`) |
| **`CR-03`** | `#74` | `30/10/2026` | `ADINEBAN` (R2 - Tech Lead) | `Vuanh47` (R1) & `ThanhTungmeH` (R5) | Sprint 4 (`M4`) | **Medium (P1)** | ✅ **Approved & Merged** (`03/11/2026`) |
| **`CR-04`** | `#80` | `15/11/2026` | `Vuanh47` (R1) & `ADINEBAN` (R2) | `ThanhTungmeH` (R5 - QA) & `ADINEBAN` (R2) | Sprint 6 (`M6`) | **High (P0)** | ✅ **Approved & Deployed** (`15/11/2026`) |

---

## 2. Chi Tiết Đánh Giá Tác Động (Impact Analysis)

### 🔹 `CR-01`: Chuyển đổi lưu trữ Video bài giảng từ Local Disk sang Cloudinary CDN (`#72`)
- **Mô tả thay đổi:** Thay thế cơ chế lưu file video MP4 trực tiếp trên ổ cứng máy chủ Spring Boot bằng dịch vụ đám mây **Cloudinary CDN** (`CloudinaryUploadService.java`).
- **Lý do phát sinh:** Khi kiểm thử tích hợp trên trình giả lập di động React Native Expo, việc phát video dung lượng lớn từ máy chủ cục bộ gây nghẽn băng thông và lỗi kết nối khi chuyển mạng.
- **Đánh giá tác động:**
  - **Phạm vi (Scope):** Bổ sung `CloudinaryUploadService`, `UploadAndCreateVideoLessonRequest`, `VideoUploadResponse` (+5 Story Points).
  - **Tiến độ (Schedule):** +1.5 ngày trong Sprint 2 (`M2`), sử dụng quỹ dự phòng rủi ro của Sprint nên không làm trễ hạn `M2` (`04/10/2026`).
  - **Chi phí (Cost):** \$0 (Sử dụng gói Cloudinary Free Tier).
- **Nhánh thực thi:** `r2-ADINEBAN/feat-e07-video-lessons-cloudinary`

---

### 🔹 `CR-02`: Bổ sung Khảo sát đầu vào (Placement Onboarding) trước khi mở khóa Lộ trình học (`#73`)
- **Mô tả thay đổi:** Thay vì gán lộ trình mặc định ngay khi đăng ký tài khoản, bổ sung luồng khảo sát năng lực hiện tại và mục tiêu điểm số (`450+`, `650+`, `800+`) tại `PlacementOnboardingController` và màn hình `OnboardingScreen.tsx`.
- **Lý do phát sinh:** Đảm bảo tính "cá nhân hóa" đúng mục tiêu cốt lõi trong Project Charter và giúp học viên được mở khóa đúng chặng (Milestone) phù hợp trình độ.
- **Đánh giá tác động:**
  - **Phạm vi (Scope):** Thêm `PlacementOnboardingController`, `PlacementOnboardingService`, `OnboardingScreen.tsx` và bộ kiểm thử `AdminLearningPathControllerTest` (+8 Story Points).
  - **Tiến độ (Schedule):** +2 ngày trong Sprint 3 (`M3`), hoàn thành ngày `16/10/2026`.
- **Nhánh thực thi:** `r3-TLammmm/feat-e04-be-learning-path` & `r4-anhht10/feat-e04-fe-learning-roadmap`

---

### 🔹 `CR-03`: Tích hợp Google Gemini AI giải thích chi tiết đáp án đề thi TOEIC (`#74`)
- **Mô tả thay đổi:** Tích hợp `GeminiAIService` và endpoint `POST /users/tests/attempts/{attemptId}/questions/{questionId}/ai-explain` giúp giải thích ngữ pháp, từ vựng và lý do chọn đáp án đúng ngay trên màn hình `AttemptReviewScreen.tsx`.
- **Lý do phát sinh:** Nâng cao giá trị thực tiễn cho người học sau khi nộp bài thi thử TOEIC tính giờ, thay vì chỉ hiển thị đáp án A/B/C/D tĩnh.
- **Đánh giá tác động:**
  - **Phạm vi (Scope):** Bổ sung `GeminiAIService`, `AskAIExplainRequest`, `AIExplainResponse` và giao diện AI Review (+5 Story Points).
  - **Tiến độ (Schedule):** +1 ngày trong Sprint 4 (`M4`), hoàn thành ngày `03/11/2026`.
- **Nhánh thực thi:** `r2-ADINEBAN/feat-e08-ai-question-explanation` & `r4-anhht10/feat-e09-fe-exam-and-ai-review`

---

### 🔹 `CR-04`: Containerize Spring Boot với Docker & Triển khai Production trên Render + Cloudflare (`#80`)
- **Mô tả thay đổi:** Bổ sung `backend/Dockerfile`, cấu hình CORS + biến môi trường production (`PORT`, `SPRING_DATASOURCE_URL`, `OPENROUTER_API_KEY`, `CLOUDINARY_*`), đồng thời triển khai bản build frontend/backend phục vụ kiểm thử trực tuyến cho buổi bảo vệ ngày `23/11/2026`.
- **Lý do phát sinh:** Sau khi hoàn tất `M5`, nhóm cần môi trường production ổn định qua HTTPS để thành viên và giảng viên kiểm thử từ xa không phụ thuộc localhost, kéo theo nhu cầu mở rộng Sprint 6 (`M6`: v1.1 Feature Enhancements `#82`–`#90`).
- **Đánh giá tác động:**
  - **Phạm vi (Scope):** Containerization & Production deployment config (`#80`: +5 Story Points) và mở Milestone `M6` (`15/11`–`21/11/2026`).
  - **Tiến độ (Schedule):** Phát sinh ngày `15/11/2026`, triển khai xong trong ngày trước khi bắt đầu chuỗi nâng cấp v1.1 (`17/11`–`21/11/2026`).
  - **Chi phí (Cost):** \$0 (Sử dụng Render Free Web Service & Cloudflare Tunnel/DNS).
- **Commits thực thi:** `5fcbde8`..`104904c` trên nhánh `main`.
