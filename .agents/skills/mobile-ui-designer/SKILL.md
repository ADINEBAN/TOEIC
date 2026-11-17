---
name: mobile-ui-designer
description: >
  Activate when implementing, styling, or refactoring mobile screens and user
  flows in React Native and Expo. Specializes in Safe Area management, touch
  ergonomics, responsive layouts, list virtualization, and platform conventions.
---

# Mobile UI Designer Skill

## Responsibilities
- Architect production-ready React Native layouts using standard `StyleSheet.create` and TypeScript design tokens.
- Handle Safe Area insets cleanly across iOS notch/Dynamic Island, Android navigation bars, and Web containers.
- Enforce ergonomic touch targets (minimum 44x44 dp on iOS, 48x48 dp on Android).
- Optimize scroll performance using virtualized lists (`FlatList`) over unvirtualized `ScrollView + map()`.
- Respect mobile platform conventions (iOS modal presentations vs Android back navigation).

## Technical Foundation (Current Project)
- **Framework**: Expo SDK 58, React Native 0.88.1, React 19.3.0.
- **Styling Architecture**: Vanilla `StyleSheet.create` with imported design tokens (`@/src/assets/styles/user-theme` and `theme`).
- **Icons**: `@expo/vector-icons` (`Ionicons`, `MaterialIcons`).
- **Navigation**: `expo-router` file-based routing.

## Workflows

### 1. Screen Scaffolding Pattern
Every user screen must follow the `UserScreen` shell or explicit safe area pattern:

```tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/src/assets/styles/user-theme';

export default function ExampleScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.contentContainer}>
        {/* Screen content */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 840 : undefined,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
  },
});
```

### 2. Touch Target & Press States
Never use plain `View` with `onPress`. Use `Pressable` or `TouchableOpacity` with responsive feedback:

```tsx
<Pressable
  style={({ pressed }) => [
    styles.actionButton,
    pressed && styles.actionButtonPressed,
  ]}
  accessibilityRole="button"
  accessibilityLabel="Start Module Practice"
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
  onPress={handlePress}
>
  <Text style={styles.actionButtonText}>Start Practice</Text>
</Pressable>
```

### 3. Responsive Web & Mobile Coexistence
- Mobile (iOS/Android): Full width with `spacing.md` (16px) margins.
- Tablet / Web: Centered container with `maxWidth: 768px - 900px`, avoiding stretched 1920px wide cards.

### 4. Interactive Feedback & Haptics
When user triggers an action (card tap, answer selection, flashcard flip):
- Use `expo-haptics` (`Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`) when appropriate on native.
- Guard with `Platform.OS !== 'web'` to avoid web console warnings.

## Checklist
- [ ] Safe area insets handled via `react-native-safe-area-context` or `UserScreen`
- [ ] All interactive elements have at least 44x44 dp effective touch target (with `hitSlop` if visual element is smaller)
- [ ] Scrollable collections use `FlatList` with `keyExtractor` and `renderItem`
- [ ] Active and pressed feedback provided on buttons and cards
- [ ] Maximum width constrained on Web (`maxWidth: 840`)
- [ ] Video playback strictly uses HTML5 `<video>` for Web; no `expo-av` references

## Common Mistakes to Avoid
- Stacking fixed margins that cause Android soft keyboard occlusion.
- Forgetting `keyboardShouldPersistTaps="handled"` on scroll containers with inputs.
- Using hardcoded `window.innerWidth` instead of React Native `Dimensions` or `useWindowDimensions()`.
- Putting extensive business logic inside UI presentation components.

## Completion Criteria
- Screen renders cleanly on mobile viewport (375px - 430px) and web desktop.
- Touch interactions feel responsive with instant visual feedback.
- No native safe area overlaps with status bar or home indicator.
