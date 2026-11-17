---
name: visual-ui-reviewer
description: >
  Activate when reviewing, validating, or auditing React Native and Expo UI
  screens. Performs 9-step visual audits, checks visual hierarchy, verifies
  Safe Area and responsive behavior, and identifies AI design anti-patterns.
---

# Visual UI Reviewer Skill

## Responsibilities
- Review UI implementations against design system tokens and mobile conventions.
- Detect and flag visual anti-patterns, misaligned margins, clipping, and illegible text.
- Verify that screens handle all 4 core states: Data, Loading, Error, and Empty.
- Execute the rigorous 9-step Visual Validation workflow before declaring UI work done.
- Ensure visual inspection claims are strictly grounded in actual rendered screens or build logs.

## The 9-Step Visual Validation Protocol

When developing or verifying a screen, follow these exact 9 steps:

```
[1. Requirement] ──► [2. Design Direction] ──► [3. Layout Definition]
       │
       ▼
[4. Implementation] ──► [5. Run Application] ──► [6. Inspect Render]
       │
       ▼
[7. Flag Problems] ──► [8. Refine & Polish] ──► [9. Responsive Check]
```

1. **Understand User Requirements**: Identify primary task (e.g., practice TOEIC Part 5 question, review flashcards).
2. **Establish Design Direction**: Select theme (Editorial Light vs Deep Navy), dominant colors, and mood.
3. **Define Layout**: Diagram visual zones (Top Header, Progress Metric, Core Content Area, Fixed Bottom Action).
4. **Implement Components**: Compose using design system components (`SurfaceCard`, `PrimaryButton`, `ProgressBar`).
5. **Run the Application**: Verify bundling with `npm run start` or `npx expo start --web` without Metro runtime crashes.
6. **Inspect Actual Render**: Review rendered output on web browser or mobile client (inspect DOM / visual frame).
7. **Identify Visual Problems**: Look for text clipping, misaligned icons, uncentered items, or low contrast.
8. **Refine & Polish**: Adjust spacing, microcopy, padding, hit slops, and press feedbacks.
9. **Verify Responsive Behavior**: Test narrow mobile (375px), standard mobile (414px), and web desktop (1024px+).

> **Important Constraint**: Do NOT claim visual validation unless an actual build, screenshot, or browser inspection was performed. If unrendered, report code-level review status only.

## Review Audit Checklist

### Visual Hierarchy & Layout
- [ ] Is the primary focal point clear within 3 seconds of viewing?
- [ ] Are headings clearly differentiated from body text?
- [ ] Is whitespace intentional and consistent using `spacing` tokens?
- [ ] Are elements properly aligned to a consistent grid/margin (16px standard)?

### Component & Token Integrity
- [ ] Are all colors imported from `@/src/assets/styles/user-theme` or `theme`?
- [ ] Are border radii consistent across cards (`radius.lg`) and buttons (`radius.md` or `radius.pill`)?
- [ ] Are shadows soft and natural (using `colors.shadow`), not harsh black?

### State Completeness
- [ ] **Data state**: Displays content correctly with clean layout.
- [ ] **Loading state**: Skeleton loader or centered `ActivityIndicator` with themed color.
- [ ] **Error state**: User-friendly message with an actionable "Thử lại" / "Retry" button.
- [ ] **Empty state**: Informative icon, clear heading, and button to take the first step.

### Mobile & Ergonomics
- [ ] Safe Area insets respected (no overlap with notch, status bar, or bottom home indicator).
- [ ] Touch targets are at least 44x44 dp.
- [ ] Keyboard does not occlude text inputs.
- [ ] Scroll views bounce naturally without clipping the bottom-most button.

## Review Report Output Format

```markdown
## UI Review: [Screen Name]

### ✅ Strengths
- Clear visual hierarchy with primary CTA anchored at bottom.
- Strict token usage: 100% colors sourced from `user-theme.ts`.

### ⚠️ Visual Issues & Anti-Patterns Found
1. **Touch Target**: Back button has 28x28 hit area — add `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}`.
2. **Empty State**: Missing empty state when practice set has 0 questions.

### 📱 Responsive & Safe Area Check
- Mobile (iOS/Android): Safe area respected.
- Web: Constrained cleanly with `maxWidth: 840px`.

### Status: [APPROVED | REQUIRES REFINEMENT]
```

## Completion Criteria
- All items in the Review Audit Checklist verified.
- No visual anti-patterns detected.
- Screen passes verification on both mobile and web surfaces.
