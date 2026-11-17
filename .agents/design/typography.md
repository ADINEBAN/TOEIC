# Typography System

## 1. Font Philosophy
The TOEIC platform uses clean, platform-native system typography (`System`, `-apple-system`, `Roboto`, `Segoe UI`) to ensure immediate rendering with zero font-loading flicker and optimal native text shaping.

---

## 2. Typography Scale

| Token / Role | Size (px) | Line Height (px) | Weight | Letter Spacing | Typical Use Case |
|---|---|---|---|---|---|
| **Display** | 32 | 40 | `700` (Bold) | -0.5 | Score milestones, celebration banners |
| **Title 1** | 24 | 30 | `700` (Bold) | -0.3 | Screen titles (e.g. "Lộ trình học") |
| **Title 2** | 20 | 26 | `600` (SemiBold) | -0.2 | Card headers, milestone titles |
| **Headline** | 17 | 22 | `600` (SemiBold) | 0.0 | Section headers, modal titles |
| **Body Large** | 16 | 24 | `400` / `500` | 0.1 | Question stem, reading passage |
| **Body** | 15 | 21 | `400` (Regular) | 0.1 | Standard description, option label |
| **Callout** | 14 | 18 | `500` (Medium) | 0.0 | Button text, table cells |
| **Caption 1** | 13 | 16 | `400` (Regular) | 0.2 | Secondary metadata, timestamps |
| **Caption 2 / Overline** | 11 | 14 | `600` (SemiBold) | 0.5 | Uppercase category tags, status pills |

---

## 3. Typography Styles Definition (Reusable)

```typescript
import { StyleSheet, TextStyle } from 'react-native';
import { colors } from '@/src/assets/styles/user-theme';

export const typography: Record<string, TextStyle> = StyleSheet.create({
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.text,
  },
  title1: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.text,
  },
  title2: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
  },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
    color: colors.text,
  },
  callout: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '400',
    color: colors.textMuted,
  },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
```

---

## 4. Typography Hierarchy Rules
1. **Never skip hierarchy levels**: Do not place a `Caption` directly under a `Display` without an intervening `Headline` or `Body`.
2. **Line height proportion**: Body text line height must always be at least 1.4x to 1.5x the font size to ensure readability during English reading comprehension.
3. **Maximum characters per line**: On web and tablet screens, constrain reading passage text containers to `maxWidth: 680px` (approx. 60–75 characters per line).
4. **No light font weights**: Never use `fontWeight: '300'` or `'100'` on mobile screens; fine weights wash out under bright sunlight.
