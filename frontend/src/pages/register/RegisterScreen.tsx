import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import AppLogoBadge from "@/src/components/common/AppLogoBadge";
import PrimaryButton from "@/src/components/common/PrimaryButton";
import TextField, { FieldIconButton } from "@/src/components/common/TextField";
import AuthLayout from "@/src/layouts/AuthLayout";
import { register } from "@/src/services/auth.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { RegisterRequest } from "@/src/types/auth";
import { useResponsiveLayout } from "@/src/utils/responsive";

const LEVEL_OPTIONS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

export default function RegisterScreen() {
  const { theme } = useAppTheme();
  const { isNarrow, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const [form, setForm] = useState<RegisterRequest>({
    avatarUrl: "",
    currentLevel: "BEGINNER",
    email: "",
    fullName: "",
    password: "",
    targetScore: 0,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const errors = useMemo(
    () => ({
      email:
        form.email.length > 0 && !form.email.includes("@")
          ? "Email không hợp lệ."
          : null,
      fullName:
        form.fullName.trim().length > 0 && form.fullName.trim().length < 2
          ? "Họ tên quá ngắn."
          : null,
      password:
        form.password.length > 0 && form.password.length < 8
          ? "Mật khẩu phải có ít nhất 8 ký tự."
          : null,
      targetScore:
        Number.isNaN(form.targetScore) ||
        form.targetScore < 100 ||
        form.targetScore > 990
          ? "Điểm mục tiêu phải trong khoảng 100 - 990."
          : null,
    }),
    [form],
  );

  const hasError = Object.values(errors).some(Boolean);

  const updateField = <K extends keyof RegisterRequest>(
    key: K,
    value: RegisterRequest[K],
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleRegister = async () => {
    if (hasError) {
      setErrorMessage("Vui lòng kiểm tra lại thông tin đăng ký.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await register(form);

      Alert.alert(
        "Đăng ký thành công",
        `${response.data.fullName} đã được tạo tài khoản.`,
        [{ text: "Đăng nhập", onPress: () => router.replace("/") }],
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể đăng ký.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout compact mode="register" scrollable>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <AppLogoBadge animated glowColor={colors.primary} size={36} />
          <Text style={styles.brandText}>Toeic Trainer</Text>
        </View>
        <Text style={[styles.title, { fontSize: rf(22) }]}>Tạo tài khoản mới</Text>
        <Text style={[styles.subtitle, { fontSize: rf(13.5) }]}>
          Cá nhân hóa lộ trình đạt mục tiêu điểm số của bạn
        </Text>

        <View style={styles.authSwitchBar}>
          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => [styles.authSwitchTab, pressed ? { opacity: 0.78 } : null]}
          >
            <Text style={styles.authSwitchText}>Đăng nhập</Text>
          </Pressable>
          <View style={[styles.authSwitchTab, styles.authSwitchTabActive]}>
            <Text style={[styles.authSwitchText, styles.authSwitchTextActive]}>
              Đăng ký
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.form}>
        <TextField
          error={errors.fullName}
          label="Họ và tên"
          leftIcon={<Ionicons color={colors.textMuted} name="person-outline" size={19} />}
          onChangeText={(value) => updateField("fullName", value)}
          placeholder="Nhập họ tên"
          value={form.fullName}
          variant="light"
        />

        <TextField
          autoCapitalize="none"
          error={errors.email}
          keyboardType="email-address"
          label="Email"
          leftIcon={<MaterialCommunityIcons color={colors.textMuted} name="email-outline" size={19} />}
          onChangeText={(value) => updateField("email", value)}
          placeholder="example@email.com"
          value={form.email}
          variant="light"
        />

        <TextField
          autoCapitalize="none"
          error={errors.password}
          label="Mật khẩu"
          leftIcon={<MaterialCommunityIcons color={colors.textMuted} name="lock-outline" size={19} />}
          onChangeText={(value) => updateField("password", value)}
          placeholder="Ít nhất 8 ký tự"
          rightSlot={
            <FieldIconButton onPress={() => setShowPassword((current) => !current)}>
              <Ionicons
                color={colors.textMuted}
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={19}
              />
            </FieldIconButton>
          }
          secureTextEntry={!showPassword}
          value={form.password}
          variant="light"
        />

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Trình độ hiện tại</Text>
          <View style={styles.levelGrid}>
            {LEVEL_OPTIONS.map((level) => {
              const selected = form.currentLevel === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => updateField("currentLevel", level)}
                  style={[
                    styles.levelChip,
                    selected ? styles.levelChipActive : null,
                    { paddingHorizontal: isNarrow ? 10 : 12 },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.levelText,
                      { fontSize: rf(11.5) },
                      selected ? styles.levelTextActive : null,
                    ]}
                  >
                    {level}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextField
          error={errors.targetScore}
          keyboardType="numeric"
          label="Mục tiêu điểm TOEIC (100 - 990)"
          leftIcon={<MaterialCommunityIcons color={colors.textMuted} name="target" size={19} />}
          onChangeText={(value) =>
            updateField("targetScore", Number(value.replace(/[^0-9]/g, "")) || 0)
          }
          placeholder="Ví dụ: 650"
          value={form.targetScore ? String(form.targetScore) : ""}
          variant="light"
        />

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <PrimaryButton label="TẠO TÀI KHOẢN" loading={loading} onPress={handleRegister} />

        <Pressable
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.footerLink}
        >
          <Text style={styles.footerText}>
            Đã có tài khoản? <Text style={styles.footerHighlight}>Đăng nhập</Text>
          </Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    header: {
      alignItems: "center",
      marginBottom: 14,
    },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginBottom: 8,
    },
    brandText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "900",
    },
    title: {
      color: colors.text,
      fontWeight: "900",
      textAlign: "center",
    },
    subtitle: {
      color: colors.textMuted,
      marginTop: 4,
      textAlign: "center",
    },
    authSwitchBar: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      marginTop: 12,
      padding: 4,
      width: "100%",
    },
    authSwitchTab: {
      alignItems: "center",
      borderRadius: radius.pill,
      flex: 1,
      justifyContent: "center",
      paddingVertical: 8,
    },
    authSwitchTabActive: {
      backgroundColor: colors.primary,
    },
    authSwitchText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "800",
    },
    authSwitchTextActive: {
      color: colors.onPrimary,
    },
    form: {
      gap: 2,
    },
    fieldBlock: {
      marginBottom: 12,
    },
    fieldLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 6,
    },
    levelGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    levelChip: {
      alignItems: "center",
      backgroundColor: colors.glassFillStrong,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1.25,
      flexGrow: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingVertical: 8,
    },
    levelChipActive: {
      backgroundColor: colors.primary,
      borderColor: "rgba(255,255,255,0.7)",
    },
    levelText: {
      color: colors.text,
      fontWeight: "800",
    },
    levelTextActive: {
      color: colors.onPrimary,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 12,
      textAlign: "center",
    },
    footerLink: {
      alignItems: "center",
      marginTop: 14,
    },
    footerText: {
      color: colors.textMuted,
      fontSize: 14,
    },
    footerHighlight: {
      color: colors.primary,
      fontWeight: "800",
    },
  });
