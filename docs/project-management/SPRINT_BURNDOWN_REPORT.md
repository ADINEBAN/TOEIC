# 📉 BÁO CÁO BIỂU ĐỒ BURNDOWN & VẬN TỐC NHÓM (SPRINT BURNDOWN REPORT)

**Dự án:** `TOEIC_Trainer` (https://github.com/ADINEBAN/TOEIC)  
**Bảng GitHub Projects:** https://github.com/users/ADINEBAN/projects/4  
**Thời gian:** `05/09/2026` – `21/11/2026` (6 Sprints / Milestones `M1` ➔ `M6`)  
**Tổng khối lượng dự án (M1–M6):** **252 Story Points** (34 User Stories/Tasks + 4 Change Requests)

---

## 1. Tổng hợp Vận tốc Nhóm qua 6 Sprints (Sprint Velocity Summary)

| Sprint / Milestone | Thời gian | Số Issues (US/Task + CR) | Story Points Cam kết | Story Points Phát sinh (CR) | Story Points Hoàn thành / Mục tiêu | Tỷ lệ / Trạng thái |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Sprint 1 (`M1`)** | `05/09` – `22/09/2026` | 7 Issues (`#50, #44, #45, #52, #53, #54, #69`) | 40 SP | 0 SP | **40 SP** | **100%** (Done) |
| **Sprint 2 (`M2`)** | `23/09` – `04/10/2026` | 4 Issues + `CR-01` (`#56, #57, #63, #62, #72`) | 29 SP | +5 SP (`CR-01`) | **34 SP** | **100%** (Done) |
| **Sprint 3 (`M3`)** | `05/10` – `23/10/2026` | 6 Issues + `CR-02` (`#61, #60, #51, #49, #59, #58, #73`) | 50 SP | +8 SP (`CR-02`) | **58 SP** | **100%** (Done) |
| **Sprint 4 (`M4`)** | `24/10` – `05/11/2026` | 5 Issues + `CR-03` (`#64, #68, #66, #65, #55, #74`) | 39 SP | +5 SP (`CR-03`) | **44 SP** | **100%** (Done) |
| **Sprint 5 (`M5`)** | `06/11` – `08/11/2026` | 3 Issues (`#67, #70, #71`) | 11 SP | 0 SP | **11 SP** | **100%** (Done) |
| **Sprint 6 (`M6`)** | `15/11` – `21/11/2026` | 9 Issues + `CR-04` (`#80, #82..#90`) | 60 SP | +5 SP (`CR-04`) | **65 SP (Plan)** | 🔄 **Active Sprint** (`CR-04` Done; `#82..#90` UAT/Merge `17–21/11`) |
| **Toàn dự án** | **`05/09` – `21/11/2026`** | **34 US/Tasks + 4 CRs (kèm 11 Epics)** | **229 SP** | **+23 SP** | **192 SP Done / 252 SP** | 🔄 **76% Done (M1–M5 + CR-04)** |

---

## 2. Biểu Đồ Burndown Tổng Thể Toàn Dự Án (`05/09/2026` ➔ `08/11/2026`)

```mermaid
xychart-beta
    title "Project Burndown Chart (Story Points Remaining: 05/09/2026 - 08/11/2026)"
    x-axis ["05/09", "10/09", "17/09", "22/09 (M1)", "27/09", "03/10 (M2+CR1)", "10/10", "16/10 (CR2)", "23/10 (M3)", "31/10 (CR3)", "04/11 (M4)", "08/11 (M5)"]
    y-axis "Remaining Story Points" 0 --> 190
    line "Ideal Burndown" [169, 153, 136, 120, 105, 90, 75, 58, 42, 26, 12, 0]
    line "Actual Remaining (incl. CR-01..03)" [169, 155, 139, 129, 116, 105, 89, 76, 55, 42, 11, 0]
```

---

## 3. Biểu Đồ Burndown Chi Tiết Từng Sprint

### 🔹 Sprint 1 (`M1`: `05/09/2026` – `22/09/2026`) — Foundation, Auth & Core Setup (40 SP)
```mermaid
xychart-beta
    title "Sprint 1 (M1) Burndown Chart (40 Story Points)"
    x-axis ["05/09", "08/09", "10/09", "14/09", "17/09", "20/09", "22/09"]
    y-axis "Story Points" 0 --> 45
    line "Ideal" [40, 33, 27, 20, 13, 7, 0]
    line "Actual" [37, 34, 26, 21, 13, 5, 0]
```

### 🔹 Sprint 2 (`M2`: `23/09/2026` – `04/10/2026`) — Vocabulary, Grammar & Video CDN (+`CR-01`) (34 SP)
```mermaid
xychart-beta
    title "Sprint 2 (M2) Burndown Chart (29 SP + 5 SP from CR-01)"
    x-axis ["23/09", "25/09", "27/09", "30/09 (+CR01)", "01/10", "03/10", "04/10"]
    y-axis "Story Points" 0 --> 36
    line "Ideal" [29, 24, 19, 15, 10, 5, 0]
    line "Actual" [29, 21, 16, 21, 13, 0, 0]
```

### 🔹 Sprint 3 (`M3`: `05/10/2026` – `23/10/2026`) — Question Bank, Practice & Learning Path (+`CR-02`) (58 SP)
```mermaid
xychart-beta
    title "Sprint 3 (M3) Burndown Chart (50 SP + 8 SP from CR-02)"
    x-axis ["05/10", "07/10", "10/10", "12/10 (+CR02)", "16/10", "19/10", "23/10"]
    y-axis "Story Points" 0 --> 60
    line "Ideal" [50, 42, 33, 25, 17, 8, 0]
    line "Actual" [50, 42, 34, 34, 13, 5, 0]
```

### 🔹 Sprint 4 & 5 (`M4`–`M5`: `24/10/2026` – `08/11/2026`) — Admin Portal, Mock Exam, AI Explain (+`CR-03`) & Handover (55 SP)
```mermaid
xychart-beta
    title "Sprint 4 & 5 (M4-M5) Burndown Chart (50 SP + 5 SP from CR-03)"
    x-axis ["24/10", "25/10", "28/10", "31/10 (+CR03)", "03/11", "04/11", "06/11", "07/11", "08/11"]
    y-axis "Story Points" 0 --> 60
    line "Ideal" [50, 44, 38, 31, 25, 19, 12, 6, 0]
    line "Actual" [50, 42, 37, 29, 19, 11, 6, 3, 0]
```

### 🔹 Sprint 6 (`M6`: `15/11/2026` – `21/11/2026`) — Production Docker Deploy (`CR-04`) & v1.1 Feature Enhancements (65 SP)
```mermaid
xychart-beta
    title "Sprint 6 (M6) Planned Burndown Chart (60 SP + 5 SP CR-04)"
    x-axis ["15/11 (CR-04)", "17/11 (US01-02)", "18/11 (US03-04)", "19/11 (US05-06)", "20/11 (US07-08)", "21/11 (T01)"]
    y-axis "Story Points" 0 --> 70
    line "Ideal" [65, 52, 39, 26, 13, 0]
    line "Baseline Target" [60, 47, 34, 21, 5, 0]
```
