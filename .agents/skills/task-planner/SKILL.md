---
name: task-planner
description: >
  Activate at the start of any multi-step task to break it into ordered,
  verifiable steps before writing a single line of code. Use for features,
  bug fixes, refactors, or migrations that touch more than one file.
---

# Task Planner Skill

## Responsibilities
- Decompose a vague requirement into a concrete, ordered list of steps.
- Identify dependencies between steps (e.g., entity must exist before service).
- Estimate which layers (backend / frontend / both) are affected.
- Define a "done" condition for each step.
- Surface risks and blockers before work begins.

## Workflow

### 1. Parse the Requirement
Answer these questions first:
- What is the user-facing outcome?
- Which backend entities/endpoints are involved?
- Which frontend screens/components are involved?
- Is this purely backend, purely frontend, or full-stack?

### 2. Build the Step List
Order steps so each one can be verified before the next begins:

**Backend-first order** (default for new features):
1. Entity change (new field / new entity)
2. Repository (new query if needed)
3. DTO (request + response)
4. MapStruct mapper update
5. Service logic
6. Controller endpoint + `@PreAuthorize`
7. `SuccessCode` / `ErrorCode` additions
8. Backend compile: `.\mvnw.cmd compile`

**Frontend-then order** (for UI-only or API consumer tasks):
1. TypeScript type / interface
2. API service function in `src/services/`
3. Hook update (if shared state)
4. Screen / component update
5. TypeScript check: `npx tsc --noEmit`

### 3. Identify Risks
- Does this require a new public endpoint? → Update `SecurityConfig`.
- Does this change a DTO used by multiple screens? → List all affected screens.
- Does this change an entity column? → Hibernate will migrate automatically; verify no data loss.
- Does this touch auth flow? → Regression-test login/logout.

### 4. Write the Plan
Produce a numbered list with:
- Step number
- What to do
- Files to change
- Verification command

### 5. Get Confirmation (if ambiguous)
If the requirement is ambiguous, ask ONE clarifying question before planning — not five.

## Checklist
- [ ] Requirement parsed into user-facing outcome
- [ ] Affected layers identified (backend / frontend / both)
- [ ] Steps ordered with dependencies respected
- [ ] Each step has a verification method
- [ ] Risks identified
- [ ] No code written before the plan is complete

## Common Mistakes to Avoid
- Writing code before clarifying which layer is in scope.
- Starting with the frontend before the API contract is defined.
- Forgetting to add `ErrorCode` for new failure cases.
- Skipping compile verification after backend changes.

## Completion Criteria
- A numbered plan is produced and agreed upon.
- Each step is independently verifiable.
- Risks and blockers are listed.
