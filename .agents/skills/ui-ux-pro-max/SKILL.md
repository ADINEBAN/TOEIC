---
name: ui-ux-pro-max
description: >
  Activate when conceptualizing, designing, or elevating mobile and web UI/UX.
  Provides design intelligence, color psychology, visual hierarchy, typography
  harmony, and prevents generic AI-generated interfaces.
---

# UI/UX Pro Max Skill

## Responsibilities
- Eliminate generic "AI-generated" aesthetics (monotone purple/blue gradients, random floating bubbles, uniform rounded corners).
- Establish coherent art direction tailored to educational and productivity apps (warm editorial, focused, high contrast, distraction-free).
- Guide visual hierarchy: establishing immediate visual order through scale, weight, color contrast, and whitespace.
- Enforce accessibility standards (WCAG 2.1 AA contrast ratios: 4.5:1 for body text, 3:1 for large text and UI components).
- Formulate intentional color palettes and typography pairings that align with the brand identity.

## Design Philosophy for TOEIC Mobile
- **Core Archetype**: *Focused Academic & Warm Editorial*.
- **Tone**: Credible, encouraging, sharp, clean, non-gamified distraction.
- **Lighting**: Warm off-white surfaces (`#F6F4EC`, `#FFFDF8`) in Light Mode; deep oceanic navy (`#07111F`, `#0F1B31`) in Dark Mode.
- **Accent Philosophy**: Deep forest teal (`#0F6B62`) for mastery/progress; warm amber (`#E08A2E`) for active challenges/streaks; crisp emerald (`#1D8C67`) for correct answers.

## Practical Workflows

### 1. Aesthetic Direction Formulation
Before writing component code, declare:
1. **Visual Tone**: (e.g., "Calm, high-density test review" or "Warm onboarding milestone").
2. **Dominant vs Accent ratio**: 60% background/neutral, 30% surface/structure, 10% accent/CTA.
3. **Typography Ladder**: Single font family with strict weight and size variations rather than mixed typefaces.

### 2. Eliminating AI Anti-Patterns
| AI Anti-Pattern | Professional Replacement |
|---|---|
| Random gradient card backgrounds | Solid high-contrast surface (`#FFFDF8`) with subtle 1px border (`#D8D0BF`) |
| Unconstrained border radius (30px on small buttons) | Systematic radius tokens (`radius.sm`: 10px, `radius.md`: 14px, `radius.pill`: 999px) |
| Low contrast gray text (`#999999` on white) | Accessible dark slate text (`#1E2E36` on `#FFFDF8` = 11.2:1 contrast) |
| Wall-to-wall borderless cards | Structured card padding (`spacing.md`: 16px) with clean elevation shadow |
| Unlabeled icons | Icons paired with descriptive microcopy or explicit `accessibilityLabel` |

### 3. Visual Hierarchy Checklist
- [ ] Is the primary action (CTA) unambiguous and visually singular per viewport?
- [ ] Are headings at least 1.33x larger and distinctly heavier than body text?
- [ ] Is secondary text differentiated by color (`textMuted: #6F7A74`) rather than smaller unreadable font size?
- [ ] Does spacing group related elements closer together than unrelated elements (Law of Proximity)?
- [ ] Are status badges color-coded semantically (success = green, warning/in-progress = amber, danger = coral)?

## Common Mistakes to Avoid
- Stacking multiple competing Primary buttons on one screen.
- Using pure black (`#000000`) on pure white (`#FFFFFF`) causing harsh eye strain; use deep slate (`#1E2E36`) on warm ivory (`#F6F4EC`).
- Adding decorative emoji or floating icons without semantic learning value.
- Neglecting empty, loading, or network-offline states.

## Completion Criteria
- Screen design has a distinct, intentional personality that feels hand-crafted.
- WCAG AA contrast satisfied across all text and interactive states.
- Visual hierarchy guides the user's eye directly to the core learning task.
