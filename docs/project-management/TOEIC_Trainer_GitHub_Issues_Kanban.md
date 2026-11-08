# TOEIC Trainer — Kanban Issue Plan & Parallel Backlog

Repository: https://github.com/ADINEBAN/TOEIC
Process: Kanban with Shift-Left Testing; 5 team roles working concurrently across all feature slices and milestones.

## Workflow
Backlog → Ready → In Progress → In Review → Done.
- **Ready:** Clear scope, testable Acceptance Criteria, single owner role, milestone, and dependencies.
- **In Progress:** Active implementation on a dedicated feature branch (`feat/...`, `test/...`, `ci/...`, `chore/...`, `docs/...`).
- **In Review:** Linked PR (`Closes #<number>`), passing CI, and concurrent **QA & Test Engineer (`R5`)** verification of Acceptance Criteria.
- **Done:** Acceptance Criteria satisfied, unit/integration tests pass, peer approval completed, and PR merged.
- **Suggested WIP limits:** In Progress <= 5 (1 per role); In Review <= 3.

## Team Roles (5 Concurrent Roles — 5 Issues Each = 20% Workload)
- **R1 — Project Lead / Project Manager (PM) / Scrum Master (`5 Issues: #50, #44, #64, #67, #71`):** Overall plan, repository conventions, GitHub Projects board, Admin Dashboard Portal coordination, Daily Login Streak & Home dashboard, and UAT handover.
- **R2 — Technical Lead / System Architect (`5 Issues: #45, #52, #53, #62, #65`):** Spring Boot core foundation, Expo frontend core & GitHub Actions CI/CD, JWT/OAuth2 security architecture, Cloudinary video streaming, and AI question explanation service.
- **R3 — Backend Engineer (`5 Issues: #56, #49, #60, #61, #66`):** Domain entities, repositories, mappers, DTOs, and RESTful APIs for Vocabulary & Flashcards, Placement Onboarding & Learning Path, Question Bank, Practice Sets, and Timed Mock Exams & Leaderboard.
- **R4 — Frontend / Mobile Engineer (`5–6 Issues: #54, #57, #59, #51, #63, #55`):** Responsive Expo React Native UI, UX flows, state stores, and API integration across Authentication/Profile, Flashcards, Grammar & Study Notebook, Practice Sessions, Learning Roadmap, and Timed Exam & AI Review screens.
- **R5 — QA & Test Engineer (`4–5 Issues: #69, #58, #68, #70` + Concurrent PR Verification):** Shift-left testing alongside Backend & Frontend in every feature group: JWT/OAuth2 verification & Postman environment (`#69`), JUnit/Mockito controller unit tests & Learning Path Postman suite (`#58`), End-to-End Admin & Learner Postman regression collection (`#68`), and API acceptance testing matrix (`#70`).

## Epic Index (`#37` – `#48`)
- **E01 (`#37`)** — `[EPIC E01] Project foundation, backend/frontend architecture & CI`
- **E02 (`#39`)** — `[EPIC E02] Learner authentication, JWT/OAuth2 and profile`
- **E03 (`#38`)** — `[EPIC E03] TOEIC vocabulary and flashcard learning`
- **E04 (`#42`)** — `[EPIC E04] Placement onboarding, personalized learning path and roadmap`
- **E05 (`#43`)** — `[EPIC E05] TOEIC practice sets, listening and reading workflows`
- **E06 (`#40`)** — `[EPIC E06] TOEIC question bank and answer-option management`
- **E07 (`#41`)** — `[EPIC E07] TOEIC grammar, study notebook and Cloudinary video lessons`
- **E08 (`#46`)** — `[EPIC E08] Admin Dashboard Portal and AI question explanations`
- **E09 (`#47`)** — `[EPIC E09] TOEIC mock exam, leaderboard and daily learning streak`
- **E10 (`#48`)** — `[EPIC E10] API acceptance testing, UAT and project handover`

## Feature-Sliced Backlog & Role Assignment (`#50` – `#71`)

| Batch | Issue | Code | Exact GitHub Issue Title | Primary Role | Co-Role / Reviewer |
| :---: | :---: | :---: | :--- | :---: | :---: |
| **1** | `#50` | `E01-US01` | `[E01-US01] Define product scope and acceptance baseline` | `R1 — PM` | `R2 — Tech Lead` |
| **2** | `#44` | `E01-T02` | `[E01-T02] Establish repository conventions, linting and TypeScript configuration` | `R1 — PM` | `R2 — Tech Lead` |
| **3** | `#45` | `E01-T03` | `[E01-T03] Initialize Spring Boot backend foundation and shared core components` | `R2 — Tech Lead` | `R3 — Backend` |
| **4** | `#52` | `E01-T04` | `[E01-T04] Initialize frontend core, HTTP client and GitHub Actions CI` | `R2 — Tech Lead` | `R4 — Frontend` |
| **5** | `#53` | `E02-US01` | `[E02-US01] Implement backend authentication, JWT/OAuth2 security and learner profile APIs` | `R2 — Tech Lead` | `R3 — Backend` |
| **6** | `#54` | `E02-US02` | `[E02-US02] Build learner authentication screens, auth store and profile UI` | `R4 — Frontend` | `R5 — QA & Test` |
| **7** | `#69` | `E02-T03` | `[E02-T03] Verify JWT/OAuth2 authentication and add Postman environment` | `R5 — QA & Test` | `R2 — Tech Lead` |
| **8** | `#56` | `E03-US01` | `[E03-US01] Implement backend vocabulary and flashcard domain, services and APIs` | `R3 — Backend` | `R2 — Tech Lead` |
| **9** | `#57` | `E03-US02` | `[E03-US02] Build the TOEIC flashcard study screen and tab navigation` | `R4 — Frontend` | `R5 — QA & Test` |
| **10** | `#63` | `E07-US02` | `[E07-US02] Implement TOEIC grammar reference, bookmarks and learner notebook` | `R4 — Frontend` | `R3 — Backend` |
| **11** | `#62` | `E07-US01` | `[E07-US01] Implement Cloudinary video lessons, learner progress and timestamp notes` | `R2 — Tech Lead` | `R4 — Frontend` |
| **12** | `#61` | `E06-T02` | `[E06-T02] Implement TOEIC question-bank entities, repositories and CRUD APIs` | `R3 — Backend` | `R2 — Tech Lead` |
| **13** | `#60` | `E05-US01` | `[E05-US01] Implement backend TOEIC practice-set management, submission and scoring APIs` | `R3 — Backend` | `R5 — QA & Test` |
| **14** | `#51` | `E05-US02` | `[E05-US02] Build TOEIC practice screens, session flow and attempt review UI` | `R4 — Frontend` | `R5 — QA & Test` |
| **15** | `#49` | `E04-US01` | `[E04-US01] Implement backend placement onboarding and personalized learning-path APIs` | `R3 — Backend` | `R2 — Tech Lead` |
| **16** | `#59` | `E04-US02` | `[E04-US02] Build onboarding, interactive learning roadmap and progress UI` | `R4 — Frontend` | `R5 — QA & Test` |
| **17** | `#58` | `E04-T01` | `[E04-T01] Add learning-path controller unit tests and Postman regression collection` | `R5 — QA & Test` | `R3 — Backend` |
| **18** | `#64` | `E08-US01` | `[E08-US01] Build Admin Dashboard Portal and content-management panels` | `R1 — PM` | `R4 — Frontend` |
| **19** | `#68` | `E08-T02` | `[E08-T02] Add Admin and learner end-to-end Postman regression collection` | `R5 — QA & Test` | `R1 — PM` |
| **20** | `#66` | `E09-US01` | `[E09-US01] Implement backend TOEIC mock exam, timed scoring and leaderboard APIs` | `R3 — Backend` | `R2 — Tech Lead` |
| **21** | `#65` | `E08-US02` | `[E08-US02] Integrate AI-powered explanations for TOEIC test answers` | `R2 — Tech Lead` | `R3 — Backend` |
| **22** | `#55` | `E09-US02` | `[E09-US02] Build TOEIC Test Hub, timed exam and AI-assisted attempt review screens` | `R4 — Frontend` | `R5 — QA & Test` |
| **23** | `#67` | `E09-US03` | `[E09-US03] Implement daily login streak and learner Home dashboard` | `R1 — PM` | `R4 — Frontend` |
| **24** | `#70` | `E10-T01` | `[E10-T01] Add API acceptance-testing guide and verification matrix` | `R5 — QA & Test` | `R2 — Tech Lead` |
| **25** | `#71` | `E10-US01` | `[E10-US01] Complete UAT handover, Kanban documentation and repository cleanup` | `R1 — PM` | `R5 — QA & Test` |

## Definition of Ready (DoR)
- Problem and business value are clearly stated.
- Story/task is assigned to a single primary owner role (`R1`–`R5`).
- Testable Acceptance Criteria are defined so `R5 (QA)` can verify immediately upon PR creation.
- Labels, milestone, and dependencies are recorded.

## Definition of Done (DoD)
- All Acceptance Criteria are satisfied and verified by `R5 (QA & Test Engineer)`.
- Code follows project conventions; automated CI checks and relevant JUnit/Postman tests pass.
- Pull Request links the issue (`Closes #<number>`) and has at least 1 peer approval.
- Documentation/configuration updated and PR merged into `main`.

