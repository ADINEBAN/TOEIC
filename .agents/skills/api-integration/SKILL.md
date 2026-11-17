---
name: api-integration
description: >
  Activate when connecting a frontend screen to a backend endpoint: writing
  service functions, handling auth headers, mapping API responses to TypeScript
  types, and handling errors gracefully in the UI.
---

# API Integration Skill

## Responsibilities
- Write typed service functions in `src/services/` that call the backend.
- Ensure all calls go through `src/services/api.client.ts`.
- Map `ApiResponse<T>.data` to the correct TypeScript interface.
- Handle `ApiError` in screens with user-facing messages.
- Never hardcode the base URL or token in screen components.

## Workflow

### 1. Define the TypeScript Type (First)
Match the backend DTO exactly:
```typescript
// src/types/practice-set.ts
export interface PracticeSetResponse {
  id: number;
  title: string;
  moduleTitle: string;
  questionCount: number;
  createdAt: string;    // ISO string from LocalDateTime
}

export interface CreatePracticeSetRequest {
  title: string;
  moduleId: number;
}
```

### 2. Write the Service Function
```typescript
// src/services/practice-set.service.ts
import { apiRequest } from './api.client';
import type { PracticeSetResponse, CreatePracticeSetRequest } from '@/types/practice-set';

export const practiceSetService = {
  getAll: () =>
    apiRequest<PracticeSetResponse[]>({ method: 'GET', url: '/users/practice-sets' }),

  getById: (id: number) =>
    apiRequest<PracticeSetResponse>({ method: 'GET', url: `/users/practice-sets/${id}` }),

  create: (data: CreatePracticeSetRequest) =>
    apiRequest<PracticeSetResponse>({ method: 'POST', url: '/admin/practice-sets', data }),
};
```

### 3. Backend Base URL
Defined in `src/config/env.ts`. Do not hardcode in service files:
```typescript
// ✅ via api.client.ts baseURL config — no hardcoding needed
// ❌ Never: fetch('http://192.168.1.10:8082/api/...')
```

### 4. Error Handling in Screens
```tsx
import type { ApiError } from '@/services/api.client';

const [error, setError] = useState<string | null>(null);

practiceSetService.getAll()
  .then(setData)
  .catch((err: ApiError) => {
    setError(err.message ?? 'An unexpected error occurred.');
  });

// In JSX:
{error && <Text style={styles.error}>{error}</Text>}
```

### 5. Auth Header
The JWT token is attached automatically by `api.client.ts` via an interceptor.
- Do NOT manually append `Authorization` headers in service files.
- Do NOT read the token from storage in screen components.

### 6. API Response Unwrapping
The backend wraps everything in `ApiResponse<T>`. The `api.client.ts` should
unwrap `.data` before returning. If it doesn't, unwrap in the service:
```typescript
const response = await rawApiCall<ApiResponse<PracticeSetResponse[]>>(...);
return response.data;  // extract the actual payload
```

## Checklist
- [ ] TypeScript interface defined in `src/types/` matching backend DTO
- [ ] Service function in `src/services/` using `apiRequest` from `api.client.ts`
- [ ] No hardcoded base URL or token in service or screen
- [ ] `ApiError` caught with user-facing message
- [ ] Loading state set before the call, cleared in `finally`
- [ ] Response type matches the interface (no `any`)
- [ ] `npx tsc --noEmit` passes

## Common Mistakes to Avoid
- Using `fetch(...)` directly in a screen instead of `api.client.ts`.
- Using `any` as the response type → silent type mismatch.
- Hardcoding `192.168.x.x` IPs → breaks on different networks.
- Missing `.catch` → unhandled promise rejection crashes the app.
- Accessing `response.data.data` when the client already unwraps once.

## Completion Criteria
- Service function is typed end-to-end (request → response).
- Screen handles loading, success, and error states.
- No `any` in new code.
- `npx tsc --noEmit` exits 0.
