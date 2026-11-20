import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import PrimaryButton from "@/src/components/common/PrimaryButton";
import TextField, { FieldIconButton } from "@/src/components/common/TextField";
import { API_BASE_URL } from "@/src/config/env";
import { useAuth } from "@/src/hooks/use-auth";
import AuthLayout from "@/src/layouts/AuthLayout";
import { ApiError } from "@/src/services/api.client";
import { login } from "@/src/services/auth.service";
import { getUserRoadmap } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { isNoActiveLearningPathError } from "@/src/utils/api-errors";
import { formatExpiry } from "@/src/utils/format";
import { useResponsiveLayout } from "@/src/utils/responsive";

export default function LoginScreen() {
  const { auth, signIn } = useAuth();
  const { theme } = useAppTheme();
  const { isShort, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const emailError =
    email.length > 0 && !email.includes("@") ? "Email không hợp lệ." : null;
  const passwordError =
    password.length > 0 && password.trim().length === 0
      ? "Mật khẩu không được để trống."
      : null;

  const handleLogin = async () => {
    if (email.trim().length === 0 || password.trim().length === 0) {
      setErrorMessage("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }

    if (emailError || passwordError) {
      setErrorMessage("Vui lòng kiểm tra lại thông tin đăng nhập.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      console.log("[auth] login request", {
        email,
        url: `${API_BASE_URL}/api/auth/login`,
      });

      const payload = await login({ email: email.trim(), password });
      signIn(payload.data);

      try {
        await getUserRoadmap(payload.data.accessToken);
        router.replace("/user/home");
      } catch (roadmapError) {
        if (isNoActiveLearningPathError(roadmapError)) {
          router.replace("/user/onboarding");
          return;
        }
        router.replace("/user/home");
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const raw = error.message.trim().toLowerCase();
        if (
          raw === "login failed" ||
          raw.includes("bad credentials") ||
          raw.includes("invalid")
        ) {
          setErrorMessage("Sai email hoặc mật khẩu.");
        } else {
          setErrorMessage(error.message);
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Không thể đăng nhập.");
      }
    } finally {
      setLoading(false);
    }
  };

  const badgeSize = isShort ? 74 : 88;

  return (
    <AuthLayout compact={isShort}>
      <View style={styles.header}>
        <View
          style={[
            styles.logoCircle,
            {
              borderColor: colors.glassBorder,
              height: badgeSize,
              shadowColor: colors.primary,
              width: badgeSize,
            },
          ]}
        >
          <Image
            resizeMode="cover"
            source={require("@/assets/images/brand-logo.png")}
            style={styles.logoImage}
          />
        </View>

        <Text style={[styles.title, { fontSize: rf(24) }]}>Toeic Trainer</Text>
        <Text style={[styles.subtitle, { fontSize: rf(14) }]}>
          Học thông minh • Lộ trình cá nhân hóa
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          autoCapitalize="none"
          error={emailError}
          keyboardType="email-address"
          label="Email"
          leftIcon={
            <MaterialCommunityIcons
              color={colors.textMuted}
              name="email-outline"
              size={20}
            />
          }
          onChangeText={setEmail}
          placeholder="Nhập email của bạn"
          value={email}
          variant="light"
        />

        <TextField
          autoCapitalize="none"
          error={passwordError}
          label="Mật khẩu"
          leftIcon={
            <MaterialCommunityIcons
              color={colors.textMuted}
              name="lock-outline"
              size={20}
            />
          }
          onChangeText={setPassword}
          placeholder="Nhập mật khẩu"
          rightSlot={
            <FieldIconButton onPress={() => setShowPassword((current) => !current)}>
              <Ionicons
                color={colors.textMuted}
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
              />
            </FieldIconButton>
          }
          secureTextEntry={!showPassword}
          value={password}
          variant="light"
        />

        <Pressable
          hitSlop={8}
          onPress={() => Alert.alert("Thông báo", "Chức năng đang cập nhật.")}
          style={styles.linkWrap}
        >
          <Text style={styles.linkText}>Quên mật khẩu?</Text>
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <PrimaryButton label="ĐĂNG NHẬP" loading={loading} onPress={handleLogin} />

        <Pressable
          hitSlop={8}
          onPress={() => router.push("/register")}
          style={styles.registerWrap}
        >
          <Text style={styles.registerText}>
            Chưa có tài khoản? <Text style={styles.registerHighlight}>Đăng ký ngay</Text>
          </Text>
        </Pressable>

        {auth.user ? (
          <View style={styles.successCard}>
            <View style={styles.successHeader}>
              <Ionicons color={colors.success} name="checkmark-circle" size={18} />
              <Text style={styles.successTitle}>Đã đăng nhập: {auth.user.fullName}</Text>
            </View>
            <Text style={styles.successMeta}>
              Phiên hết hạn sau {formatExpiry(auth.expiresIn)}
            </Text>
          </View>
        ) : null}
      </View>
    </AuthLayout>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    header: {
      alignItems: "center",
      marginBottom: 16,
    },
    logoCircle: {
      alignItems: "center",
      borderRadius: 24,
      borderWidth: 1,
      elevation: Platform.OS === "android" ? 0 : 6,
      justifyContent: "center",
      marginBottom: 12,
      overflow: "hidden",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.24,
      shadowRadius: 16,
    },
    logoImage: {
      height: "100%",
      width: "100%",
    },
    title: {
      color: colors.text,
      fontWeight: "900",
      letterSpacing: -0.3,
      textAlign: "center",
    },
    subtitle: {
      color: colors.textMuted,
      marginTop: 4,
      textAlign: "center",
    },
    form: {
      gap: 2,
    },
    linkWrap: {
      alignSelf: "flex-end",
      marginBottom: 14,
      marginTop: -2,
    },
    linkText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "700",
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 12,
      textAlign: "center",
    },
    registerWrap: {
      alignItems: "center",
      marginTop: 16,
    },
    registerText: {
      color: colors.textMuted,
      fontSize: 14,
    },
    registerHighlight: {
      color: colors.primary,
      fontWeight: "800",
    },
    successCard: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      marginTop: 14,
      padding: 12,
    },
    successHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    successTitle: {
      color: colors.success,
      fontSize: 13,
      fontWeight: "800",
    },
    successMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
  });
