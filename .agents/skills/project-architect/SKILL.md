---
name: project-architect
description: >
  Activate when designing new features, planning system changes, evaluating
  architectural trade-offs, or ensuring a proposed change respects the existing
  layered architecture of the TOEIC platform.
---

# Project Architect Skill

## Responsibilities
- Validate that new features respect the `Controller → Service → Repository → Entity` layered pattern.
- Design DTO shapes and MapStruct mapper contracts before any code is written.
- Identify cross-cutting concerns (auth, error handling, pagination) early.
- Spot over-engineering and suggest the simplest correct solution.
- Ensure frontend and backend contracts stay in sync.

## Workflow

### 1. Understand the Requirement
- Clarify the feature scope in one sentence.
- Identify which layers are affected: entity, repository, service, controller, DTO, frontend screen.
- Check for existing similar patterns in the codebase before designing anything new.

### 2. Design the Data Model
- Does a new entity or column need to be added? If so, extend `BaseEntity`.
- Identify all foreign key relationships and their fetch strategies (`LAZY` preferred).
- Confirm enum fields use `EnumType.STRING`.

### 3. Design the API Contract
- Choose a RESTful route under the existing prefixes (see `.agents/project/api-conventions.md`).
- Define the request DTO, response DTO, and `SuccessCode` / `ErrorCode` values.
- Confirm the response is wrapped in `ApiResponse<T>`.

### 4. Design the Frontend Contract
- Identify which screen and service file will consume the new endpoint.
- Confirm the TypeScript interface matches the DTO exactly.
- Confirm all HTTP calls go through `src/services/api.client.ts`.

### 5. Review for Conflicts
- Does the new route require a new `@PreAuthorize` scope?
- Does it overlap with an existing endpoint?
- Does it require CORS changes?

## Checklist
- [ ] Layered boundary respected (no controller → repository calls)
- [ ] New entity extends `BaseEntity`
- [ ] DTO defined (no raw entity in response)
- [ ] MapStruct mapper planned
- [ ] API envelope used (`ApiResponse<T>`)
- [ ] Auth scope set (`hasRole('ADMIN')` or `hasRole('USER')`)
- [ ] TypeScript type defined in `src/types/`
- [ ] API client call added in `src/services/`

## Common Mistakes to Avoid
- Injecting a `Repository` directly into a `Controller`.
- Returning a raw `Entity` from a `Controller` (exposing `passwordHash` etc.).
- Creating a new HTTP client instead of using `api.client.ts`.
- Adding `@CrossOrigin` on individual controllers instead of using `CorsConfig`.

## Completion Criteria
- Architecture documented or explained before coding starts.
- No existing pattern broken.
- Both backend DTO and frontend type are aligned.
