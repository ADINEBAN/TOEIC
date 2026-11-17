# Reusable Component Specifications

## 1. Buttons (`PrimaryButton`)

### Variants
- **Primary**: Solid background (`colors.primary`), white text (`#FFFDF8`). Used for the singular primary action on screen.
- **Secondary / Outline**: Transparent background, 1.5px border (`colors.borderStrong` or `colors.primary`), themed text.
- **Ghost**: Zero border, transparent background, colored text. For secondary actions (e.g. "Bỏ qua", "Xem sau").
- **Danger**: Solid or outlined with `colors.danger` for destructive actions.

### Interactive States
1. **Idle**: 100% opacity.
2. **Pressed**: `opacity: 0.85` and subtle transform scale (`0.98`) for tactile feel.
3. **Loading**: Content replaced by `ActivityIndicator` (matching button text color); interaction disabled.
4. **Disabled**: Background tinted to `colors.surfaceDisabled`, text to `colors.textMuted`, interaction disabled.

```tsx
// Usage Pattern
<PrimaryButton
  label="Bắt đầu luyện tập"
  onPress={handleStart}
  loading={isSubmitting}
  variant="primary"
/>
```

---

## 2. Text Inputs (`TextField`)

### Anatomical Specs
- Height: 48px – 52px (accommodates 44dp touch target).
- Border Radius: `radius.md` (14px).
- Background: `colors.surface` with 1px `colors.border`.
- Focused State: Border changes to 2px `colors.primaryDark` or `colors.primary`.
- Error State: Border changes to `colors.danger`, with red helper text below.
- Clear & Toggle Icons: Embedded right icon with 44x44 touch area.

---

## 3. Cards (`SurfaceCard`)

### Anatomical Specs
- Background: `colors.surface` (`#FFFDF8`).
- Border: 1px `colors.border` (`#D8D0BF`).
- Radius: `radius.lg` (20–22px).
- Internal Padding: `spacing.md` (16px) or `spacing.lg` (24px).
- Shadow: `elevation.low`.

```tsx
<SurfaceCard style={styles.card}>
  <View style={styles.headerRow}>
    <Text style={styles.cardTitle}>TOEIC Reading Part 5</Text>
    <StatusBadge status="IN_PROGRESS" />
  </View>
  <ProgressBar progress={0.65} />
</SurfaceCard>
```

---

## 4. Navigation & App Header (`AppHeader`)
- Back Button: Left-aligned with 44dp hit area, utilizing `Ionicons` (`chevron-back`).
- Title: Centered or leading `headline` style.
- Right Element: Optional action icon, avatar badge, or streak pill.
- Elevation: Seamless flat design with subtle 1px border bottom (`colors.border`) or zero border on hero screens.

---

## 5. Screen State Patterns

### Loading State
- Centered container with `ActivityIndicator` colored with `colors.primary`.
- Optional skeleton card placeholders matching `radius.lg` and `colors.surfaceAlt` with pulse animation.

### Empty State
- Centered vertically in content container.
- Large semantic icon (48x48 dp) in `colors.textMuted`.
- Title: `title2` font with `colors.text`.
- Description: `body` font with `colors.textMuted`, centered, max width 300px.
- Action: Secondary or Primary button to take the initial action (e.g., "Chọn bài thi đầu tiên").

### Error State
- Prominent banner or centered screen container.
- Warning/error badge in `colors.danger`.
- Human-friendly message (never dump raw exception traces).
- Actionable "Thử lại" ("Try Again") button wired to refetch callback.

---

## 6. Dark Mode Mapping Reference

| Component Surface | Light Mode Token | Dark Mode Token |
|---|---|---|
| Screen Canvas | `colors.background` (`#F6F4EC`) | `colors.background` (`#07111F`) |
| Card Container | `colors.surface` (`#FFFDF8`) | `colors.surface` (`#0F1B31`) |
| Primary CTA Button | `colors.primary` (`#0F6B62`) | `colors.primary` (`#59A6FF`) |
| Primary CTA Text | `#FFFDF8` | `#07101D` |
| Text Color | `colors.text` (`#1E2E36`) | `colors.text` (`#F7FAFF`) |
| Subtitle Color | `colors.textMuted` (`#6F7A74`) | `colors.textMuted` (`#9BAFCA`) |
| Divider / Border | `colors.border` (`#D8D0BF`) | `colors.border` (`#28415F`) |
