# Spacing, Radius & Elevation System

## 1. Spacing Scale
The spacing system is built on an ergonomic 4px / 8px scale. It ensures visual rhythm, clean alignment, and consistent padding across both mobile viewports and desktop web surfaces.

| Token | Value (px) | Typical Application |
|---|---|---|
| `spacing.xs` | 6 | Icon-to-text gap, badge internal padding, pill gap |
| `spacing.sm` | 12 | Card internal padding, button horizontal padding, item gap |
| `spacing.md` | 16 | Standard screen gutter, card vertical padding, list item margin |
| `spacing.lg` | 24 | Section separator, modal header margin, card separation |
| `spacing.xl` | 32 | Major section gaps, screen top hero spacing |
| `spacing.xxl` | 40 | Celebration screen padding, bottom floating action clearance |

---

## 2. Border Radius Scale
Smooth, rounded edges provide an inviting, modern aesthetic without looking overly childish or bloated.

| Token | Value (px) | Application |
|---|---|---|
| `radius.sm` | 10 | Badges, tags, option selection checkboxes, tooltips |
| `radius.md` | 14 | Text inputs, small buttons, inner card containers |
| `radius.lg` | 20–22 | Primary cards (`SurfaceCard`), bottom sheets, modals |
| `radius.xl` | 28–30 | Hero cards, celebration dialogs |
| `radius.pill` | 999 | Action pills, avatar frames, tag chips, progress bars |

---

## 3. Shadows & Elevation
React Native requires dual elevation modeling: iOS uses CoreGraphics shadow properties; Android uses the hardware `elevation` attribute.

```typescript
import { ViewStyle } from 'react-native';
import { colors } from '@/src/assets/styles/user-theme';

export const elevation: Record<'flat' | 'low' | 'medium' | 'high', ViewStyle> = {
  flat: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  low: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  medium: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  high: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
  },
};
```

---

## 4. Touch Targets & Ergonomic Zones
- **Minimum Interactive Size**: 44x44 dp on iOS; 48x48 dp on Android.
- **Hit Slop Rule**: Any visual icon smaller than 44x44 dp (e.g. 24x24 close icon) must include `hitSlop`:
  ```tsx
  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  ```
- **Thumb Zone Principle**: Primary navigation actions and confirm buttons must reside within the lower 40% of the screen (reachable via single-hand thumb).
- **Safe Area Insets**: Always apply `paddingBottom: insets.bottom + spacing.md` for bottom fixed action buttons.
