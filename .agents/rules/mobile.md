---
trigger: glob
globs: "**/*.ts, **/*.tsx"
---

# Mobile / Frontend Rules (TypeScript & React Native)

## 1. Navigation
- Use `expo-router` file-based routing exclusively. All screens live under `app/`.
- **Never** use `@react-navigation/native` hooks directly.
- `useFocusEffect` **must** come from `expo-router`, not `@react-navigation/native`.

## 2. Media
- `expo-av` is **removed** (deprecated in Expo SDK 58 / Expo Go). Do not re-add it.
- For video on web: use HTML5 `<video>` element.
- For video on native: use `expo-video` or open an external browser intent.
- Guard with `Platform.OS` checks when behavior differs between web and native.

## 3. API & Data Fetching
- All HTTP calls must go through `src/services/api.client.ts` — the **single source of truth** for API access.
- Catch errors using `ApiError` with user-facing fallback text. Never silently ignore promise rejections.
- Backend base URL: `http://<host>:8082/api`. Use environment config — do not hardcode IPs.

## 4. Authentication
- Access auth state via `useAuth()` from `src/hooks/use-auth.ts`.
- Attach `Authorization: Bearer <token>` header via the api client interceptor — do not attach it manually in screens.

## 5. TypeScript
- Strict mode is enabled — no implicit `any`. Provide explicit types for all API payloads, state, and props.
- Prefer interfaces for data shapes and types for unions.
- Filenames: Components/Screens `PascalCase.tsx`, services/utilities `kebab-case.ts`.

## 6. Validation
- Before declaring done, run: `npx tsc --noEmit` and `npm run lint` from `frontend/`.
- Fix all TypeScript errors before committing.
