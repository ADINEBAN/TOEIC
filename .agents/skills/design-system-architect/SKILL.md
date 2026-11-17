---
name: design-system-architect
description: >
  Activate when creating, standardizing, or extending UI components, design tokens,
  color palettes, typography scales, spacing, or component contracts in the
  React Native and Expo workspace.
---

# Design System Architect Skill

## Responsibilities
- Architect and maintain a centralized, single-source-of-truth design token system.
- Standardize reusable component APIs (`PrimaryButton`, `TextField`, `SurfaceCard`, `AppHeader`, `ProgressBar`).
- Enforce strict TypeScript typing across design tokens, props, and variant states.
- Maintain consistent dual-theme support (Editorial Light Mode + Dark Navy Mode).
- Prevent style fragmentation and ad-hoc inline styles.

## Token Hierarchy Architecture

```
Design Tokens (Foundational)
  ├── colors (background, surface, primary, accent, border, text, semantic)
  ├── spacing (xs: 6, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40)
  ├── radius (sm: 10, md: 14, lg: 22, xl: 30, pill: 999)
  └── typography (display, title, headline, body, caption)
          │
          ▼
Core UI Components (src/components/common & src/components/user)
  ├── PrimaryButton (variants: solid, outline, ghost, danger)
  ├── TextField (states: default, focused, error, disabled)
  ├── SurfaceCard (elevation: flat, raised, outlined)
  └── ProgressBar (colors: primary, accent, success)
          │
          ▼
Screen Compositions (app/ & src/pages/)
```

## Workflows

### 1. Extending Design Tokens
Always extend existing token files (`src/assets/styles/user-theme.ts` for Light, `theme.ts` for Dark):
- Never inject ad-hoc hex codes in screen styles.
- Add semantic alias tokens rather than literal color names (e.g. use `cardBorder`, not `lightGray3`).
- Maintain key parity between Light and Dark themes to allow seamless switching.

### 2. Component Contract Architecture
All reusable components must follow this standard interface contract:

```tsx
export interface ComponentBaseProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentBaseProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
```

### 3. State Variation Handling
Every interactive component must explicitly handle and test 5 states:
1. **Default / Idle**
2. **Pressed / Active**
3. **Focused** (for inputs)
4. **Disabled** (with accessible opacity `#D8D0C0` / `0.5`)
5. **Loading / Pending** (with non-blocking spinner or indicator)

### 4. Elevation & Shadow Pattern
In React Native, shadow requires both iOS shadow properties and Android `elevation`:

```typescript
export const elevation = {
  flat: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  modal: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 8,
  },
};
```

## Checklist
- [ ] Component accepts standard `style`, `testID`, and `accessibilityLabel`
- [ ] Props are strictly typed with TypeScript interfaces or discriminated unions
- [ ] No hardcoded colors or spacing inside component render logic
- [ ] Both Light and Dark theme values are accounted for
- [ ] Disabled states convey unclickable status visually and disable `onPress`
- [ ] Component exported cleanly from component directory index

## Common Mistakes to Avoid
- Creating multiple competing versions of Button (e.g. `CustomButton`, `AppButton`, `MyButton`).
- Breaking encapsulation by reaching directly into sub-component styles.
- Using different border radii on elements that visually belong together.
- Forgetting web compatibility when using native-only style properties.

## Completion Criteria
- Tokens documented in `.agents/design/`.
- Component APIs are predictable, self-documenting, and type-safe.
- Zero unchecked `any` in component prop definitions.
