import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "@/src/assets/styles/user-theme";
import { LiquidCard, LiquidIconButton, LiquidSwitch } from "@/src/components/ui/LiquidGlass";
import UserAvatarWithFrame from "@/src/components/user/UserAvatarWithFrame";
import { useAuth } from "@/src/hooks/use-auth";
import {
  ACCENT_SWATCHES,
  LIQUID_THEME_PRESETS,
  useAppTheme,
} from "@/src/store/theme-store";
import { pushRoute } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  titleSlot?: ReactNode;
  onLeftPress?: () => void;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightSlot?: ReactNode;
  hideThemeTrigger?: boolean;
};

export default function AppHeader({
  title,
  subtitle,
  titleSlot,
  onLeftPress,
  leftIcon = "chevron-back-outline",
  rightSlot,
  hideThemeTrigger = false,
}: AppHeaderProps) {
  const {
    theme,
    presetId,
    accentId,
    prismaticGlow,
    setPresetId,
    setAccentId,
    setPrismaticGlow,
  } = useAppTheme();
  const { height, isNarrow, rf, screenPadding } = useResponsiveLayout();
  const c = theme.colors;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <View style={styles.row}>
        <View style={styles.leftSection}>
          {onLeftPress ? (
            <LiquidIconButton
              accessibilityLabel="Quay lại"
              onPress={onLeftPress}
            >
              <Ionicons color={c.primaryDark} name={leftIcon} size={20} />
            </LiquidIconButton>
          ) : null}

          <View style={styles.copyBlock}>
            {titleSlot ? (
              titleSlot
            ) : (
              <>
                {subtitle ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.subtitle, { color: c.primary, fontSize: rf(10.5) }]}
                  >
                    {subtitle}
                  </Text>
                ) : null}
                <Text
                  numberOfLines={1}
                  style={[styles.title, { color: c.text, fontSize: rf(isNarrow ? 19 : 21) }]}
                >
                  {title}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.rightCluster}>
          {!hideThemeTrigger ? (
            <LiquidIconButton
              accessibilityLabel="Chọn màu giao diện"
              onPress={() => setPickerOpen(true)}
            >
              <Ionicons color={c.primary} name="color-palette-outline" size={19} />
            </LiquidIconButton>
          ) : null}
          {rightSlot}
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
        transparent
        visible={pickerOpen}
      >
        <View style={[styles.modalBackdrop, { padding: screenPadding }]}>
          <LiquidCard style={[styles.modalCard, { maxHeight: Math.round(height * 0.84) }]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.sm }}>
                  <Text style={[styles.modalEyebrow, { color: c.primary }]}>CLAY PASTEL STUDIO</Text>
                  <Text style={[styles.modalTitle, { color: c.text, fontSize: rf(19) }]}>
                    Chọn màu giao diện
                  </Text>
                </View>
                <LiquidIconButton onPress={() => setPickerOpen(false)}>
                  <Ionicons color={c.text} name="close" size={18} />
                </LiquidIconButton>
              </View>

              <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Nền & Bảng màu 3D</Text>
              <View style={styles.presetGrid}>
                {LIQUID_THEME_PRESETS.map((preset) => {
                  const active = preset.id === presetId;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => setPresetId(preset.id)}
                      style={[
                        styles.presetPill,
                        {
                          backgroundColor: active ? c.primarySoft : c.glassFill,
                          borderColor: active ? c.primary : c.glassBorder,
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={preset.previewStops}
                        end={{ x: 1, y: 1 }}
                        start={{ x: 0, y: 0 }}
                        style={styles.presetOrb}
                      />
                      <Text numberOfLines={1} style={[styles.presetName, { color: c.text, fontSize: rf(12.5) }]}>
                        {preset.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Màu điểm nhấn nút 3D</Text>
              <View style={styles.swatchRow}>
                {ACCENT_SWATCHES.map((sw) => {
                  const active = sw.id === accentId;
                  return (
                    <Pressable
                      key={sw.id}
                      hitSlop={6}
                      onPress={() => setAccentId(sw.id)}
                      style={[
                        styles.swatchWrap,
                        active ? { borderColor: c.text, borderWidth: 2 } : null,
                      ]}
                    >
                      {sw.id === "preset" ? (
                        <View style={[styles.swatchCircle, { backgroundColor: c.primaryDark }]}>
                          <Ionicons color="#FFF" name="sparkles" size={13} />
                        </View>
                      ) : (
                        <LinearGradient
                          colors={[sw.gradient[0], sw.gradient[1]]}
                          end={{ x: 1, y: 1 }}
                          start={{ x: 0, y: 0 }}
                          style={styles.swatchCircle}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.switchTitle, { color: c.text }]}>Sắc thái Pastel nổi khối</Text>
                  <Text style={[styles.switchSub, { color: c.textMuted }]}>
                    Ánh pastel dịu nhẹ phía sau thẻ 3D
                  </Text>
                </View>
                <LiquidSwitch onValueChange={setPrismaticGlow} value={prismaticGlow} />
              </View>
            </ScrollView>
          </LiquidCard>
        </View>
      </Modal>
    </>
  );
}

export function AvatarBadge({ label = "A" }: { label?: string }) {
  const { auth } = useAuth();
  const { isNarrow } = useResponsiveLayout();
  const size = isNarrow ? 38 : 42;
  const user = auth.user;

  return (
    <Pressable
      accessibilityLabel="Hồ sơ cá nhân"
      onPress={() => pushRoute("/user/profile")}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <UserAvatarWithFrame
        avatarUrl={user?.avatarUrl}
        frameId={user?.equippedFrameId}
        fullName={user?.fullName || user?.email || label}
        level={user?.level ?? 1}
        showCornerBadge={false}
        size={size}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 14,
  },
  leftSection: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  copyBlock: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  rightCluster: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(7, 13, 28, 0.68)",
    flex: 1,
    justifyContent: "center",
  },
  modalCard: {
    maxWidth: 440,
    width: "100%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  modalTitle: {
    fontWeight: "900",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: spacing.sm,
  },
  presetPill: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1.25,
    flexBasis: "48%",
    flexDirection: "row",
    flexGrow: 1,
    gap: 8,
    minWidth: 128,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  presetOrb: {
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 999,
    borderWidth: 1,
    height: 18,
    width: 18,
  },
  presetName: {
    flex: 1,
    fontWeight: "800",
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: spacing.sm,
  },
  swatchWrap: {
    borderRadius: 999,
    padding: 2,
  },
  swatchCircle: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  switchSub: {
    fontSize: 12,
    marginTop: 2,
  },
});
