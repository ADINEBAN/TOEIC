---
name: react-native-expert
description: >
  Activate when writing or modifying React Native / Expo code: components,
  hooks, navigation, state management, platform-specific logic, or TypeScript
  types. Expo SDK 58, React Native 0.88.1, React 19, TypeScript ~6.0.3.
---

# React Native Expert Skill

## Responsibilities
- Implement screens and components following the existing project structure.
- Use Expo Router for navigation — never raw `@react-navigation/native`.
- Enforce strict TypeScript types throughout.
- Handle platform differences (web vs native) with `Platform.OS` guards.
- Avoid deprecated or removed packages (`expo-av` is removed).

## Workflow

### 1. Navigation (Expo Router)
```tsx
// ✅ Correct — Expo Router
import { router, useFocusEffect } from 'expo-router';
useFocusEffect(() => { /* runs on screen focus */ });
router.push('/user/(tabs)/practice');
router.back();

// ❌ Wrong — never use this directly
import { useFocusEffect } from '@react-navigation/native';
```

File-based routing structure:
```
app/
  (auth)/login.tsx       → /login
  user/(tabs)/index.tsx  → /user (bottom tab)
  admin/dashboard.tsx    → /admin/dashboard (web-only)
```

### 2. TypeScript — Strict Mode
```tsx
// Define explicit interface for all API shapes
interface PracticeSetResponse {
  id: number;
  title: string;
  moduleTitle: string;
  questionCount: number;
  createdAt: string;
}

// Props always typed
interface PracticeCardProps {
  set: PracticeSetResponse;
  onPress: (id: number) => void;
}

const PracticeCard: React.FC<PracticeCardProps> = ({ set, onPress }) => { ... };
```

### 3. Custom Hooks Pattern
```tsx
// src/hooks/use-practice-sets.ts
export function usePracticeSets(moduleId: number) {
  const [data, setData] = useState<PracticeSetResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    practiceSetService.getByModule(moduleId)
      .then(setData)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, [moduleId]);

  return { data, loading, error };
}
```

### 4. Platform Guards
```tsx
import { Platform } from 'react-native';

// Video — expo-av is REMOVED
{Platform.OS === 'web' ? (
  <video src={videoUrl} controls style={{ width: '100%' }} />
) : (
  // expo-video for native
  <VideoView player={player} style={styles.video} />
)}
```

### 5. Auth Access
```tsx
import { useAuth } from '@/hooks/use-auth';

const { user, token, logout } = useAuth();
// Never read the token manually from storage — always use the hook
```

### 6. State Management
- Use React `useState` / `useReducer` for local component state.
- Use the project's `src/store/` for shared global state.
- Do NOT introduce new state management libraries without agreement.

### 7. Performance
- Wrap expensive lists in `FlatList` (not `ScrollView + map`).
- Use `React.memo` for pure components in long lists.
- Use `useCallback` for event handlers passed to child components.
- Avoid anonymous functions in `FlatList`'s `renderItem` prop.

## Checklist
- [ ] `useFocusEffect` imported from `expo-router`
- [ ] No `expo-av` imports
- [ ] Video handled with `Platform.OS` guard
- [ ] All component props and API types are explicitly typed
- [ ] Errors caught with `ApiError`, not generic `any`
- [ ] Auth state via `useAuth()` hook only
- [ ] API calls go through `src/services/api.client.ts`
- [ ] `npx tsc --noEmit` passes from `frontend/`

## Common Mistakes to Avoid
- `import { useFocusEffect } from '@react-navigation/native'` → NavigationContainer error.
- `expo-av` import → "Cannot find native module 'ExponentAV'" crash.
- `any` type on API response → breaks type safety silently.
- Manually fetching the JWT token from AsyncStorage → bypasses `useAuth()`.
- `ScrollView` wrapping a 100-item list → no virtualization, memory leak.

## Completion Criteria
- Screen/component renders on both web and mobile without errors.
- `npx tsc --noEmit` exits 0.
- No `any` types in new code.
- Navigation works correctly on web and native.
