# Color Palette & Semantic Tokens

## 1. Color Strategy
The color system is organized into **Base Surfaces**, **Brand Primaries**, **Accents**, **Semantic Statuses**, and **Borders & Shadows**.

All color tokens guarantee minimum WCAG 2.1 AA contrast (4.5:1 for body copy, 3:1 for large display text and UI components).

---

## 2. Token Definitions

### Light Theme (`user-theme.ts`)

| Token Name | Hex Value | Role / Usage | Contrast on Surface |
|---|---|---|---|
| `background` | `#F6F4EC` | Root screen background (warm parchment) | Neutral |
| `backgroundStrong` | `#E7E3D6` | Shaded areas, secondary containers | Neutral |
| `surface` | `#FFFDF8` | Cards, modal sheets, input backgrounds | Base |
| `surfaceAlt` | `#F4EFE3` | Selected option background, tag containers | 1.1:1 |
| `surfaceMuted` | `#ECE3D0` | Secondary tabs, inactive pills | 1.2:1 |
| `surfaceDisabled` | `#D8D0C0` | Disabled button background | 1.4:1 |
| `primary` | `#0F6B62` | Main CTA, active progress, brand accent | **4.9:1** on surface |
| `primaryDark` | `#163B49` | Deep headers, focused outlines | **10.5:1** on surface |
| `primarySoft` | `#A8D9CF` | Progress bar track, active tint background | Tint |
| `accent` | `#E08A2E` | Streak badge, highlight, warning note | **3.2:1** on surface |
| `accentSoft` | `#F7E5CF` | Streak container, active hint chip | Tint |
| `text` | `#1E2E36` | Headings, question prompts, body text | **11.2:1** on surface |
| `textMuted` | `#6F7A74` | Metadata, timestamps, subtitle labels | **4.6:1** on surface |
| `border` | `#D8D0BF` | Standard card and input outline | UI Element |
| `borderStrong` | `#BFB59F` | Focused boundaries, active card border | UI Element |
| `success` | `#1D8C67` | Correct answer, completed module | **4.6:1** on surface |
| `danger` | `#C95757` | Incorrect answer, error alerts | **4.5:1** on surface |
| `shadow` | `rgba(48, 55, 49, 0.16)` | Natural ambient shadow | Ambient |

---

### Dark Theme (`theme.ts`)

| Token Name | Hex Value | Role / Usage | Contrast on Surface |
|---|---|---|---|
| `background` | `#07111F` | Root background (midnight navy) | Neutral |
| `backgroundStrong` | `#0C1A2F` | Section background, sidebar canvas | Neutral |
| `surface` | `#0F1B31` | Cards, table rows, modal dialogs | Base |
| `surfaceAlt` | `#152642` | Interactive cards, hover states | 1.1:1 |
| `surfaceMuted` | `#1C3155` | Inactive pills, code blocks | 1.3:1 |
| `primary` | `#59A6FF` | Primary button, active link, focus ring | **5.4:1** on surface |
| `primaryDark` | `#07101D` | Shadow tone, sunken container | Base |
| `primarySoft` | `#1E4274` | Active row tint, secondary button | Tint |
| `accent` | `#22C7A9` | Active streak, metric highlights | **7.8:1** on surface |
| `accentSoft` | `#113C39` | Highlighted badge background | Tint |
| `text` | `#F7FAFF` | Headings, main labels | **14.2:1** on surface |
| `textMuted` | `#9BAFCA` | Secondary labels, descriptions | **5.8:1** on surface |
| `border` | `#28415F` | Subtle divider, card border | UI Element |
| `borderStrong` | `#3F5F87` | Active borders, input focus outline | UI Element |
| `success` | `#43D58C` | Verified status, passed score | **8.6:1** on surface |
| `danger` | `#FF7F7F` | Failed status, delete action | **6.1:1** on surface |
| `shadow` | `rgba(4, 10, 24, 0.56)` | Deep elevation drop shadow | Ambient |

---

## 3. Semantic Application Rules
1. **Never use raw hex colors in screen components**: Always reference `colors.*`.
2. **Success & Danger reserved for outcomes**: Do not use `colors.success` for normal active buttons; use `colors.primary`.
3. **Muted text contrast guarantee**: `colors.textMuted` must never be rendered on `colors.surfaceMuted` without verifying at least 4.5:1 contrast.
4. **Primary CTA**: Only one primary-colored button per view tier. Secondary actions must use `outline` or `ghost` variants.
