---
name: code-review-testing
description: >
  Activate when reviewing a code change, writing tests, checking for regressions,
  or validating that an implementation meets the project's quality standards
  before it is considered done.
---

# Code Review & Testing Skill

## Responsibilities
- Review code changes for correctness, security, and adherence to project conventions.
- Validate that the layered architecture is not broken.
- Identify missing tests, missing error handling, and type safety gaps.
- Run the standard verification suite (compile + type-check).

## Workflow

### 1. Architecture Review
Check layered boundaries:
- [ ] No `Repository` injected into a `Controller`.
- [ ] No `Entity` returned from a `Controller` (must use DTO).
- [ ] No business logic in `Controller` (delegate to `Service`).
- [ ] All frontend API calls go through `api.client.ts`.

### 2. Security Review
- [ ] Admin endpoints have `@PreAuthorize("hasRole('ADMIN')")`.
- [ ] User endpoints have `@PreAuthorize("hasRole('USER')")`.
- [ ] No secrets hardcoded (no API keys, no passwords in source).
- [ ] `passwordHash` not present in any DTO or response.
- [ ] New public endpoints explicitly whitelisted in `SecurityConfig`.

### 3. Data & Type Safety Review
**Backend**:
- [ ] `@Valid` on all `@RequestBody` parameters.
- [ ] `AppException(ErrorCode.X)` thrown for all error cases.
- [ ] All `Optional.get()` replaced with `.orElseThrow(...)`.
- [ ] Enum fields annotated with `@Enumerated(EnumType.STRING)`.
- [ ] `@Transactional` on all write service methods.

**Frontend**:
- [ ] No `any` type in new TypeScript code.
- [ ] All API response types match backend DTOs.
- [ ] `ApiError` caught in all async calls.
- [ ] `loading` and `error` states both implemented.

### 4. Performance Review
- [ ] No `FetchType.EAGER` on `@ManyToOne` / `@OneToMany`.
- [ ] List endpoints return `Page<T>`, not `List<T>` for large datasets.
- [ ] `FlatList` used for scrollable lists (not `ScrollView + map`).
- [ ] No N+1 queries: check if related entities are fetched in a loop.

### 5. Backend Testing
Run the full test suite:
```powershell
cd backend
.\mvnw.cmd compile    # must pass first
.\mvnw.cmd test       # run all controller and service tests
```
Review failures — a failing test is a blocker.

### 6. Frontend Type & Lint Check
```powershell
cd frontend
npx tsc --noEmit      # 0 errors required
npm run lint          # 0 errors required
```

### 7. Code Quality Checklist
- [ ] No unused imports or dead code.
- [ ] No TODO comments left in production code without a tracking note.
- [ ] Method names are `camelCase` (Java) or `camelCase` (TS).
- [ ] Class/component names are `PascalCase`.
- [ ] Constants are `UPPER_SNAKE_CASE` (Java).
- [ ] No magic strings — use `ErrorCode`, `SuccessCode`, or named constants.

### 8. Review Summary Format
When reporting a review, structure it as:

```
## ✅ Passed
- Layered architecture respected
- Security guards correct
...

## ❌ Issues Found
1. `UserController` injects `UserRepository` directly — must go through `UserService`.
2. `UserResponse` contains `passwordHash` field — remove it.
3. `useFocusEffect` imported from wrong package.

## Verification
.\mvnw.cmd compile → PASS
npx tsc --noEmit   → 2 errors (see above)
```

## Common Mistakes to Avoid
- Approving code that returns a raw `Entity` from a controller.
- Skipping the compile/type-check step — "it looks right" is not enough.
- Approving a new public endpoint without checking `SecurityConfig`.
- Missing `@Transactional` on a service method that calls `.save()`.

## Completion Criteria
- All checklist items pass.
- `.\mvnw.cmd compile` and/or `npx tsc --noEmit` exit 0.
- No security or architecture violations found.
- Review summary delivered with clear ✅ / ❌ sections.
