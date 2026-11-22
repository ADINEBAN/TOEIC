import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import AppLogoBadge from "@/src/components/common/AppLogoBadge";
import PrimaryButton from "@/src/components/common/PrimaryButton";
import TextField, { FieldIconButton } from "@/src/components/common/TextField";
import { API_BASE_URL } from "@/src/config/env";
import { useAuth } from "@/src/hooks/use-auth";
import AuthLayout from "@/src/layouts/AuthLayout";
import { ApiError } from "@/src/services/api.client";
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleAuthCode,
  getGoogleAuthStatus,
  login,
} from "@/src/services/auth.service";
import { getUserRoadmap } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { LoginSuccessData } from "@/src/types/auth";
import { isNoActiveLearningPathError } from "@/src/utils/api-errors";
import { formatExpiry } from "@/src/utils/format";
import { useResponsiveLayout } from "@/src/utils/responsive";

WebBrowser.maybeCompleteAuthSession();

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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return null;
    }
    const err = new URLSearchParams(window.location.search).get("googleAuthError");
    if (!err) return null;
    return err === "access_denied"
      ? "Bạn đã hủy đăng nhập Google."
      : `Đăng nhập Google thất bại (${err}).`;
  });

  const emailError =
    email.length > 0 && !email.includes("@") ? "Email không hợp lệ." : null;
  const passwordError =
    password.length > 0 && password.trim().length === 0
      ? "Mật khẩu không được để trống."
      : null;

  const completeAuthSession = useCallback(
    async (data: LoginSuccessData) => {
      signIn(data);
      try {
        await getUserRoadmap(data.accessToken);
        router.replace("/user/home");
      } catch (roadmapError) {
        if (isNoActiveLearningPathError(roadmapError)) {
          router.replace("/user/onboarding");
          return;
        }
        router.replace("/user/home");
      }
    },
    [signIn],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const googleCode = params.get("googleAuthCode");
    const googleError = params.get("googleAuthError");
    if (!googleCode && !googleError) {
      return;
    }

    const cleanUrl = window.location.pathname + (window.location.hash || "");
    window.history.replaceState({}, "", cleanUrl);

    if (googleCode) {
      void (async () => {
        try {
          setGoogleLoading(true);
          setErrorMessage(null);
          const payload = await exchangeGoogleAuthCode(googleCode);
          await completeAuthSession(payload.data);
        } catch (err) {
          setErrorMessage(
            err instanceof Error ? err.message : "Không thể hoàn tất đăng nhập Google.",
          );
        } finally {
          setGoogleLoading(false);
        }
      })();
    }
  }, [completeAuthSession]);

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
      await completeAuthSession(payload.data);
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

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      setErrorMessage(null);

      const statusRes = await getGoogleAuthStatus();
      if (!statusRes.data?.redirectConfigured) {
        setErrorMessage(
          "Backend chưa cấu hình GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET. Hãy thêm biến môi trường rồi khởi động lại backend.",
        );
        return;
      }

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const redirectUri = `${window.location.origin}${window.location.pathname}`;
        window.location.href = buildGoogleAuthorizeUrl(redirectUri);
        return;
      }

      const appRedirectUri = Linking.createURL("/");
      const authorizeUrl = buildGoogleAuthorizeUrl(appRedirectUri);
      const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, appRedirectUri);
      if (result.type !== "success" || !result.url) {
        return;
      }

      const parsed = Linking.parse(result.url);
      const errParam = parsed.queryParams?.googleAuthError;
      const codeParam = parsed.queryParams?.googleAuthCode;
      if (typeof errParam === "string" && errParam.trim().length > 0) {
        setErrorMessage(
          errParam === "access_denied"
            ? "Bạn đã hủy đăng nhập Google."
            : `Đăng nhập Google thất bại (${errParam}).`,
        );
        return;
      }
      if (typeof codeParam !== "string" || codeParam.trim().length === 0) {
        setErrorMessage("Không nhận được mã xác thực từ Google.");
        return;
      }

      const payload = await exchangeGoogleAuthCode(codeParam);
      await completeAuthSession(payload.data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Không thể đăng nhập bằng Google.",
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const badgeSize = isShort ? 74 : 88;

  return (
    <AuthLayout compact={isShort} mode="login">
      <View style={styles.header}>
        <AppLogoBadge
          animated
          glowColor={colors.primary}
          size={badgeSize}
          style={{ marginBottom: 12 }}
        />

        <Text style={[styles.title, { fontSize: rf(24) }]}>Toeic Trainer</Text>
        <Text style={[styles.subtitle, { fontSize: rf(14) }]}>
          Học thông minh • Lộ trình cá nhân hóa
        </Text>

        <View style={styles.authSwitchBar}>
          <View style={[styles.authSwitchTab, styles.authSwitchTabActive]}>
            <Text style={[styles.authSwitchText, styles.authSwitchTextActive]}>
              Đăng nhập
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/register")}
            style={({ pressed }) => [styles.authSwitchTab, pressed ? { opacity: 0.78 } : null]}
          >
            <Text style={styles.authSwitchText}>Đăng ký</Text>
          </Pressable>
        </View>
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

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>hoặc</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          disabled={loading || googleLoading}
          onPress={handleGoogleLogin}
          style={({ pressed }) => [
            styles.googleButton,
            (loading || googleLoading) && styles.googleButtonDisabled,
            pressed && styles.googleButtonPressed,
          ]}
        >
          {googleLoading ? (
            <ActivityIndicator color="#0F172A" size="small" />
          ) : (
            <Ionicons color="#EA4335" name="logo-google" size={18} />
          )}
          <Text style={styles.googleButtonText}>
            {googleLoading ? "Đang kết nối Google..." : "Tiếp tục với Google"}
          </Text>
        </Pressable>

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
    authSwitchBar: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      marginTop: 14,
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
    dividerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginVertical: 14,
    },
    dividerLine: {
      backgroundColor: colors.glassBorder,
      flex: 1,
      height: 1,
    },
    dividerText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    googleButton: {
      alignItems: "center",
      backgroundColor: "#FFFFFF",
      borderColor: colors.glassBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 16,
    },
    googleButtonDisabled: {
      opacity: 0.65,
    },
    googleButtonPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    googleButtonText: {
      color: "#0F172A",
      fontSize: 15,
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
