---
trigger: always_on
---

# Global Coding Standards

## 1. Code Quality & Clean Code
- **Clarity Over Cleverness**: Write readable, maintainable code with clear naming and minimal cognitive load.
- **Single Responsibility**: Each class, hook, function, or component should have a single well-defined purpose.
- **Zero Broken Builds**: Before reporting completion, verify changes using the official compiler/linter (`mvnw compile` for backend, `npx tsc --noEmit` for frontend).
- **No Unused Imports or Dead Code**: Remove obsolete imports, commented-out dead code, and dangling variables.

## 2. Naming Conventions
- **Java**:
  - Classes, Interfaces, Enums: `PascalCase` (e.g., `LearningModuleController`, `UserRole`).
  - Methods and Variables: `camelCase` (e.g., `assignRecommendedPath`, `learningPathId`).
  - Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_PAGE_SIZE`).
  - Database entities & tables: Entity class `PascalCase`, `@Table(name = "plural_snake_case")`.
- **TypeScript / React**:
  - Components, Types, Interfaces: `PascalCase` (e.g., `PracticeScreen`, `UserRoadmap`).
  - Hooks: `camelCase` starting with `use` (e.g., `useAuth`).
  - Utilities and Services: `camelCase` (e.g., `apiRequest`, `formatDuration`).
  - Filenames: Components/Screens `PascalCase.tsx`, services/utilities `kebab-case.ts`.

## 3. Error Handling Principles
- **No Silent Failures**: Always handle promises and exceptions explicitly.
- **Predictable Error Envelopes**: Backend returns `ApiResponse` with corresponding `ErrorCode`; Frontend catches via `ApiError` with user-friendly fallback text.
- **Defensive Null Checks**: Guard against `null` and `undefined` in API payloads and state properties.

## 4. Modification Safety
- **Surgical Edits**: Touch only the lines required to fix bugs or implement requested features.
- **Preserve Existing Architecture**: Respect project patterns (MapStruct, Lombok, ApiResponseUtil in backend; `api.client.ts` in frontend).
