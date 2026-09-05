# TOEIC Trainer — Kanban Issue Plan

Repository: https://github.com/ADINEBAN/TOEIC
Process: Kanban; 5 team roles; no fixed Sprints.

## Workflow
Backlog → Ready → In Progress → In Review → Done.
Ready requires clear scope, testable Acceptance Criteria, owner role, milestone and dependencies.
In Review requires a linked PR (`Closes #<number>`) and passing CI.
Done requires accepted criteria, tests, peer approval, merged PR and QA evidence.
Suggested WIP limits: In Progress <= 5; In Review <= 3.

## Team roles
- R1 — Project Lead / Project Manager: overall plan, progress, risks, scope changes, stakeholder, evidence and UAT.
- R2 — Technical Lead / System Architect: architecture, ERD/API decisions, coding standards, CI/CD and technical review.
- R3 — Backend Engineer: API, business logic, database, authorization and integrations.
- R4 — Frontend / Mobile Engineer: UI, user flows, client/API integration, audio and upload interactions.
- R5 — QA & Test Engineer: test plan/cases, acceptance, regression, bug evidence and DoD.
Replace role codes with actual GitHub usernames when team membership is confirmed.

## Milestones to create with semester dates
- M1 — Project Foundation
- M2 — Core Learning
- M3 — AI Learning Features
- M4 — TOEIC Practice & Assessment
- M5 — Release & Acceptance
Dates are intentionally unassigned until confirmed by the team.

## Suggested Labels
Types: type:epic, type:user-story, type:task, type:bug, type:documentation.
Areas: area:frontend, area:backend, area:database, area:ai, area:qa, area:devops, area:product.
Priorities: priority:critical, priority:high, priority:medium, priority:low.
Other: status:blocked, needs:decision, good first issue.
Use Project columns as the source of truth for workflow status.

## Epic index
- E01 — Foundation, architecture & delivery: #1
- E02 — Account, authentication & learner profile: #2
- E03 — Vocabulary & flashcard learning: #3
- E04 — AI image flashcards & semantic network: #4
- E05 — Listening practice: #5
- E06 — Reading practice & question bank: #6
- E07 — AI Speaking practice: #7
- E08 — Document-to-TOEIC practice generation: #8
- E09 — Mock test, scoring & analytics: #9
- E10 — Quality, deployment, security & acceptance: #10

## Issue index
### E01
- #11 Define product scope and acceptance baseline
- #12 Establish repository conventions and contribution workflow
- #13 Design system architecture and database model
- #14 Configure automated build, lint and test checks
### E02
- #15 Implement learner registration, login and logout
- #16 Manage learner profile and TOEIC target
### E03
- #17 Browse and search TOEIC vocabulary
- #18 Save vocabulary and study with flashcards
- #19 Schedule vocabulary review using spaced repetition
### E04
- #20 Generate editable flashcards from an image
- #21 Explore related vocabulary in a semantic network
### E05
- #22 Practice TOEIC listening questions with audio
### E06
- #23 Practice TOEIC reading passages and questions
- #24 Build and validate TOEIC question bank
### E07
- #25 Record and review a speaking response
- #26 Receive AI feedback on a speaking response
### E08
- #27 Upload learning documents and extract text
- #28 Generate TOEIC practice questions from document text
### E09
- #29 Take a timed TOEIC mock test
- #30 View test history and learning progress
- #31 Set daily learning goals and track completion
### E10
- #32 Create test plan and regression suite
- #33 Perform security and privacy checks
- #34 Deploy a runnable application release
- #35 Complete stakeholder UAT and project handover

## Definition of Ready
- Problem/value is clear.
- Story/task is understandable and independently reviewable.
- Acceptance Criteria are testable.
- Owner role, labels, milestone and dependencies are recorded.

## Definition of Done
- Acceptance Criteria satisfied.
- Code follows agreed conventions; relevant unit/integration tests pass.
- PR links issue and has at least one peer approval.
- CI passes; QA evidence is attached where relevant.
- Documentation/configuration updated; PR merged.

## VKU evidence reminder
Keep actual WBS/WBS Dictionary, Risk Register, Scope Change Control, Stakeholder/UAT evidence, final technical report, slides and live-demo evidence. The course handout mentions Sprint 1 and Final Retrospective evidence; since the team selected Kanban, ask the instructor whether dated Kanban flow/review records plus a final retrospective are accepted. Do not fabricate Sprint records.
