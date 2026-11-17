---
name: mobile-ui-ux
description: >
  Activate when designing or refining UI components, screen layouts, loading
  states, error states, empty states, accessibility, or visual consistency
  across the mobile and web surfaces of the TOEIC app.
---

# Mobile UI/UX Skill

## Responsibilities
- Design screens that work correctly on both mobile (Expo Go) and web.
- Implement loading, error, and empty states for every data-driven screen.
- Ensure consistent styling using the project's existing style patterns.
- Apply accessibility attributes where possible.
- Avoid layout issues caused by platform differences.

## Workflow

### 1. Screen Anatomy — Every Data Screen Needs 4 States
```tsx
const PracticeScreen: React.FC = () => {
  const { data, loading, error } = usePracticeSets();

  if (loading) return <LoadingSpinner />;
  if (error)   return <ErrorMessage message={error} onRetry={refetch} />;
  if (!data.length) return <EmptyState message="No practice sets yet." />;

  return <FlatList data={data} renderItem={...} />;
};
```
Never render a blank white screen — always handle all 4 states.

### 2. Platform-Specific Layout
```tsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'web' ? 20 : 0,
    maxWidth: Platform.OS === 'web' ? 900 : undefined,  // constrain on web
    alignSelf: 'center',
    width: '100%',
  },
});
```

### 3. Lists — Always FlatList
```tsx
<FlatList
  data={practiceSets}
  keyExtractor={(item) => item.id.toString()}
  renderItem={({ item }) => <PracticeCard set={item} />}
  ItemSeparatorComponent={() => <View style={styles.separator} />}
  ListEmptyComponent={<EmptyState />}
  showsVerticalScrollIndicator={false}
/>
```

### 4. Admin Panel (Web Only)
- Admin screens live under `app/admin/`. Guard them:
```tsx
// In admin layout
if (Platform.OS !== 'web') {
  return <Text>Admin panel is only available on web.</Text>;
}
```

### 5. Navigation Feedback
- Show a loading indicator during async navigation.
- Use `router.push` for forward navigation, `router.back()` for back.
- Use `router.replace` to avoid back-stack pollution after login/logout.

### 6. Touch Targets
- Minimum touch target: 44×44 dp on mobile.
- Use `TouchableOpacity` or `Pressable` — never plain `View` with `onPress`.

### 7. Accessibility
```tsx
<TouchableOpacity
  accessible
  accessibilityRole="button"
  accessibilityLabel="Start practice set"
  onPress={handleStart}
>
```

## Checklist
- [ ] All 4 screen states handled (loading, error, empty, data)
- [ ] `FlatList` used for scrollable lists (not `ScrollView + map`)
- [ ] Platform guard on admin screens
- [ ] Video uses `<video>` on web, `expo-video` on native
- [ ] Minimum 44dp touch targets
- [ ] `accessibilityLabel` on interactive elements
- [ ] `keyExtractor` on every `FlatList`
- [ ] `maxWidth` constraint on web layouts

## Common Mistakes to Avoid
- `ScrollView` wrapping a list → no virtualization.
- Missing loading state → blank screen on slow connections.
- Missing error state → user sees nothing when API fails.
- `onPress` on a `View` → not accessible and unreliable on web.
- Hardcoded pixel dimensions without platform consideration.

## Completion Criteria
- Screen renders correctly on web (`expo start --web`) and mobile.
- All 4 data states are implemented.
- No layout overflow or hidden content on small screens.
