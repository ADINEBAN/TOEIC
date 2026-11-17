# TOEIC Mobile Design System

## 1. Overview
The TOEIC Learning Platform Design System is a lightweight, high-performance design architecture tailored for mobile (iOS/Android via Expo SDK 58 / React Native 0.88) and universal web browsers.

It prioritizes:
- **Focused Academic Elegance**: Warm editorial styling that keeps learners immersed without cognitive fatigue.
- **Zero-Runtime Overhead**: Native `StyleSheet.create` using strictly typed TypeScript design tokens without heavy CSS-in-JS runtimes.
- **Dual Personality**: A warm, welcoming Light Editorial theme for daily study and a sleek Deep Navy Dark theme for low-light practice sessions.
- **Universal Layout**: Fluid, ergonomic touch interfaces on mobile devices that gracefully constrain to centered reading views on desktop browsers.

---

## 2. Design System Architecture

```
.agents/design/
├── design-system.md      # Executive principles, token architecture, theming
├── color-palette.md      # Primitive & semantic color tokens (Light & Dark)
├── typography.md         # Type scale, font weights, line heights, letter spacing
├── spacing.md            # Spacing scale, touch targets, border radii, elevation
└── components.md         # Component specs: Buttons, Inputs, Cards, Nav, States
```

---

## 3. Core Principles

### I. Content-First Visual Hierarchy
Learning a language requires sustained visual focus. The question stem, reading passage, and vocabulary front-card always occupy primary visual real estate. Decorative flair, badges, and secondary analytics remain subdued.

### II. Intentional Spacing & Proximity
Group related items with tight spacing (`spacing.xs: 6px`, `spacing.sm: 12px`) and separate distinct sections with generous breathing room (`spacing.lg: 24px`, `spacing.xl: 32px`).

### III. Tactile & Responsive Feedback
Every interactive element provides immediate visual or haptic feedback upon touch (`pressed` state opacity/color change and `expo-haptics` on native).

### IV. Safe Area & Universal Adaptability
Never allow system UI (Dynamic Island, notches, home indicator bars, browser headers) to obscure interactive elements. Screen boundaries dynamically adapt using `useSafeAreaInsets()`.

---

## 4. Theme Modes

### Editorial Warm (Default Light)
- **Background**: `#F6F4EC` (soft parchment)
- **Surfaces**: `#FFFDF8` (clean ivory)
- **Primary**: `#0F6B62` (deep forest teal)
- **Accent**: `#E08A2E` (warm amber)
- **Text**: `#1E2E36` (deep slate)

### Deep Navy (Dark Mode / Admin)
- **Background**: `#07111F` (midnight navy)
- **Surfaces**: `#0F1B31` (deep slate navy)
- **Primary**: `#59A6FF` (electric sky blue)
- **Accent**: `#22C7A9` (crisp mint teal)
- **Text**: `#F7FAFF` (crisp white)

---

## 5. Token Consumption Guide
Always import design tokens directly from the established theme source:

```typescript
// For User surfaces (warm editorial default)
import { colors, spacing, radius } from '@/src/assets/styles/user-theme';

// For Admin surfaces or dark theme
import { colors, spacing, radius } from '@/src/assets/styles/theme';
```
