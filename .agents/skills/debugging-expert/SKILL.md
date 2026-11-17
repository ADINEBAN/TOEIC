---
name: debugging-expert
description: >
  Activate when diagnosing a bug, crash, error message, unexpected behavior,
  or test failure. Works across backend (Spring Boot / Java) and frontend
  (React Native / Expo / TypeScript).
---

# Debugging Expert Skill

## Responsibilities
- Reproduce the issue with the minimum reproducible case.
- Identify the root cause — not just the symptom.
- Inspect logs and stack traces systematically.
- Fix the minimum code necessary.
- Run regression to confirm no new breakage.

## Workflow

### Step 1 — Read the Full Error
Before doing anything, read the entire error message:
- What is the exception type?
- What is the first non-library stack frame? (The real source of the problem.)
- Is it a compile error, runtime error, or logic error?

**Backend errors** — look in:
- Spring Boot startup logs (port conflict, missing bean, DB connection)
- HTTP response body (`ApiResponse.code` and `message`)
- Server console for stack traces

**Frontend errors** — look in:
- Metro bundler console
- Expo Dev Tools overlay (red error screen)
- Browser DevTools console (for web)
- The first non-`node_modules` frame in the stack trace

### Step 2 — Locate the Root Cause
```powershell
# Find where the class/method is defined
Select-String -Path "backend\src\**\*.java" -Pattern "class FlashcardService" -Recurse

# Find where a frontend error originates
Select-String -Path "frontend\src\**\*.tsx","frontend\src\**\*.ts" -Pattern "getPracticeSet" -Recurse
```
Read only the relevant 20–40 lines around the failing code.

### Step 3 — Categorize the Bug

| Symptom | Common Cause |
|---|---|
| `Cannot find native module 'ExponentAV'` | `expo-av` imported — it's removed |
| `useFocusEffect` NavigationContainer error | Imported from wrong package |
| `LazyInitializationException` | Hibernate lazy field accessed outside transaction |
| `401 Unauthorized` | JWT missing, expired, or blacklisted |
| `400 Bad Request` | `@Valid` failing — check DTO constraints |
| `NullPointerException` in service | Entity not found before use — missing `orElseThrow` |
| `Cannot find symbol` compile error | Missing import or wrong method signature |
| TypeScript `Type 'X' is not assignable` | Mismatch between DTO and interface |
| Blank white screen in app | Missing loading/error state, or render throws |

### Step 4 — Fix Minimum Scope
- Change only the lines required to fix the issue.
- Do not refactor surrounding code while fixing a bug.
- If the fix requires touching multiple files, list them before editing.

### Step 5 — Verify the Fix

**Backend**:
```powershell
.\mvnw.cmd compile    # check compile
.\mvnw.cmd test       # run tests
```

**Frontend**:
```powershell
npx tsc --noEmit      # check types
npm run lint          # check lint
```

**Runtime**: Restart the dev server and reproduce the original scenario to confirm resolution.

### Step 6 — Regression Check
- Did the fix affect any other callers of the changed function?
- Run `Select-String` to find all usages of the modified method/component.
- Confirm no other screen or service breaks.

## Checklist
- [ ] Full error message read (not just the first line)
- [ ] Root cause identified (not just symptom treated)
- [ ] Only minimum lines changed
- [ ] `mvnw compile` or `tsc --noEmit` run after fix
- [ ] Original scenario tested to confirm resolution
- [ ] Other callers of modified code checked

## Common Mistakes to Avoid
- Fixing the symptom (wrapping with try/catch) instead of the root cause.
- Changing multiple things at once — makes it impossible to know what fixed it.
- Not re-running the original scenario after the fix.
- Adding `@SuppressWarnings` or `any` type to hide a type error instead of fixing it.

## Completion Criteria
- Error no longer occurs.
- Compile/type check passes.
- No regression introduced in related code.
- Root cause explained in one sentence.
