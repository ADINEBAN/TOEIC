import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing } from '@/src/assets/styles/theme';
import AdminLoginCard from '@/src/components/admin/AdminLoginCard';
import AdminShell from '@/src/components/admin/AdminShell';
import AppLogoBadge from '@/src/components/common/AppLogoBadge';
import { API_BASE_URL } from '@/src/config/env';
import { useAuth } from '@/src/hooks/use-auth';
import { ApiError } from '@/src/services/api.client';
import { loginAdmin } from '@/src/services/admin-auth.service';

export default function AdminLoginScreen() {
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [enterAnim] = useState(() => new Animated.Value(0));
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [driftAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(driftAnim, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );

    floatLoop.start();
    driftLoop.start();
    return () => {
      floatLoop.stop();
      driftLoop.stop();
    };
  }, [driftAnim, enterAnim, floatAnim]);

  const cardOpacity = enterAnim;
  const cardTranslateY = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const cardScale = enterAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });
  const chipBobY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  const pillBobY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [5, -5] });
  const bgScale = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const bgShiftX = driftAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const pulseDotScale = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.35] });

  const emailError =
    email.length > 0 && !email.includes('@') ? 'Email không hợp lệ.' : null;
  const passwordError =
    password.length > 0 && password.trim().length === 0
      ? 'Mật khẩu không được để trống.'
      : null;

  const handleLogin = async () => {
    if (email.trim().length === 0 || password.trim().length === 0) {
      setErrorMessage('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }

    if (emailError || passwordError) {
      setErrorMessage('Vui lòng kiểm tra lại thông tin đăng nhập.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const payload = await loginAdmin({ email: email.trim(), password });
      signIn(payload.data);
      router.replace('/admin/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        const raw = error.message.trim().toLowerCase();
        if (
          raw === 'login failed' ||
          raw.includes('bad credentials') ||
          raw.includes('invalid')
        ) {
          setErrorMessage('Sai email hoặc mật khẩu.');
        } else {
          setErrorMessage(error.message);
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Không thể đăng nhập admin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell>
      {/* Living Sapphire Paper-Cut Backdrop */}
      <Animated.Image
        blurRadius={Platform.OS === 'web' ? 4 : 2}
        resizeMode="cover"
        source={require('@/assets/images/auth-papercut-admin.jpg')}
        style={[
          StyleSheet.absoluteFill,
          {
            height: '100%',
            opacity: isWide ? 0.16 : 0.36,
            transform: [{ scale: bgScale }],
            width: '100%',
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.scrollCenter}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: cardOpacity,
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            width: '100%',
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.authContainer, isWide ? styles.authContainerWide : styles.authContainerNarrow]}
          >
            {/* Left Form Column (clean crisp surface like paper-cut card) */}
            <View style={[styles.formCol, !isWide ? styles.formColFull : null]}>
              <AdminLoginCard>
                <View style={styles.headerBlock}>
                  <View style={styles.brandHeaderRow}>
                    <AppLogoBadge animated glowColor="rgba(37, 99, 235, 0.32)" size={48} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eyebrow}>Cổng quản trị bảo mật</Text>
                      <Text style={styles.title}>Đăng nhập Admin</Text>
                    </View>
                  </View>
                  <Text style={styles.subtitle}>
                    Sử dụng tài khoản quyền ADMIN để truy cập bảng điều khiển.
                  </Text>
                </View>

                <View style={styles.form}>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Địa chỉ email</Text>
                    <View style={[styles.inputBox, emailError ? styles.inputBoxError : null]}>
                      <MaterialCommunityIcons
                        color={colors.textMuted}
                        name="email-outline"
                        size={19}
                      />
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        onChangeText={setEmail}
                        onSubmitEditing={handleLogin}
                        placeholder="admin@toeic.local"
                        placeholderTextColor="#94A3B8"
                        style={styles.textInput}
                        value={email}
                      />
                    </View>
                    {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Mật khẩu</Text>
                    <View style={[styles.inputBox, passwordError ? styles.inputBoxError : null]}>
                      <MaterialCommunityIcons
                        color={colors.textMuted}
                        name="lock-outline"
                        size={19}
                      />
                      <TextInput
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={setPassword}
                        onSubmitEditing={handleLogin}
                        placeholder="Nhập mật khẩu quản trị"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showPassword}
                        style={styles.textInput}
                        value={password}
                      />
                      <Pressable
                        hitSlop={8}
                        onPress={() => setShowPassword((current) => !current)}
                        style={styles.eyeButton}
                      >
                        <Ionicons
                          color={colors.textMuted}
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                        />
                      </Pressable>
                    </View>
                    {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}
                  </View>

                  {errorMessage ? (
                    <View style={styles.errorBanner}>
                      <Ionicons color={colors.danger} name="alert-circle" size={18} />
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  ) : null}

                  <Pressable
                    disabled={loading}
                    onPress={handleLogin}
                    style={({ pressed }) => [
                      styles.submitButton,
                      pressed ? styles.submitButtonPressed : null,
                      loading ? styles.submitButtonDisabled : null,
                    ]}
                  >
                    <Ionicons color={colors.onPrimary} name="log-in-outline" size={19} />
                    <Text style={styles.submitButtonText}>
                      {loading ? 'Đang xác thực...' : 'Đăng nhập Admin'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => router.replace('/')}
                    style={styles.backToUserBtn}
                  >
                    <Ionicons color={colors.textMuted} name="arrow-back" size={15} />
                    <Text style={styles.backToUserText}>Quay lại trang Học viên</Text>
                  </Pressable>

                  {!isWide ? (
                    <Text style={styles.mobileEndpointText}>API: {API_BASE_URL}</Text>
                  ) : null}
                </View>
              </AdminLoginCard>
            </View>

            {/* Right Animated Cobalt Paper-Cut Showcase */}
            {isWide ? (
              <View style={styles.showcasePanel}>
                <Animated.Image
                  resizeMode="cover"
                  source={require('@/assets/images/auth-papercut-admin.jpg')}
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      height: '100%',
                      transform: [{ scale: bgScale }, { translateX: bgShiftX }],
                      width: '100%',
                    },
                  ]}
                />
                <LinearGradient
                  colors={['rgba(15, 23, 42, 0.25)', 'rgba(15, 23, 42, 0.78)', 'rgba(15, 23, 42, 0.94)']}
                  end={{ x: 0.9, y: 1 }}
                  pointerEvents="none"
                  start={{ x: 0.1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />

                <View style={styles.showcaseForeground}>
                  <Animated.View style={[styles.showcaseBadge, { transform: [{ translateY: pillBobY }] }]}>
                    <AppLogoBadge animated glowColor="rgba(56, 189, 248, 0.45)" size={32} />
                    <Text style={styles.showcaseBadgeText}>TOEIC Trainer Workspace</Text>
                  </Animated.View>

                  <View>
                    <Text style={styles.showcaseTitle}>
                      Hệ thống quản trị{'\n'}nội dung & luyện thi
                    </Text>
                    <Text style={styles.showcaseDesc}>
                      Quản lý lộ trình học tập, ngân hàng câu hỏi Part 1–7, thư viện Video AI, học viên PLUS/PRO và thống kê SePay trên một nền tảng.
                    </Text>

                    <Animated.View style={[styles.featureList, { transform: [{ translateY: chipBobY }] }]}>
                      <View style={styles.featureGlassCard}>
                        <View style={styles.featureIconWrap}>
                          <Ionicons color="#60A5FA" name="layers-outline" size={17} />
                        </View>
                        <View style={styles.featureCopy}>
                          <Text style={styles.featureTitle}>Lộ trình & Video AI Studio</Text>
                          <Text style={styles.featureMeta}>Đồng bộ Path, Milestone, Module & phụ đề song ngữ</Text>
                        </View>
                      </View>

                      <View style={styles.featureGlassCard}>
                        <View style={styles.featureIconWrap}>
                          <Ionicons color="#34D399" name="document-text-outline" size={17} />
                        </View>
                        <View style={styles.featureCopy}>
                          <Text style={styles.featureTitle}>Ngân hàng câu hỏi & Đề thi ETS</Text>
                          <Text style={styles.featureMeta}>Import hàng loạt audio/ảnh & chia 7 Part tự động</Text>
                        </View>
                      </View>

                      <View style={styles.featureGlassCard}>
                        <View style={styles.featureIconWrap}>
                          <Ionicons color="#FBBF24" name="analytics-outline" size={17} />
                        </View>
                        <View style={styles.featureCopy}>
                          <Text style={styles.featureTitle}>Thống kê Học viên & SePay</Text>
                          <Text style={styles.featureMeta}>Theo dõi gói PLUS/PRO, doanh thu & phổ điểm TOEIC</Text>
                        </View>
                      </View>
                    </Animated.View>
                  </View>

                  <View style={styles.endpointChip}>
                    <Animated.View
                      style={[
                        styles.endpointDot,
                        { transform: [{ scale: pulseDotScale }] },
                      ]}
                    />
                    <Text numberOfLines={1} style={styles.endpointText}>
                      API: {API_BASE_URL}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </Animated.View>
      </ScrollView>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    alignItems: 'stretch',
    alignSelf: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  authContainerNarrow: {
    maxWidth: 450,
  },
  authContainerWide: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: 980,
    minHeight: 590,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 48,
  },
  brandHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  endpointChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderColor: 'rgba(148, 163, 184, 0.25)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
    maxWidth: '100%',
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  endpointDot: {
    backgroundColor: '#34D399',
    borderRadius: 99,
    height: 8,
    width: 8,
  },
  endpointText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: '#FECACA',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  eyeButton: {
    padding: 4,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  featureCopy: {
    flex: 1,
  },
  featureIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(30, 58, 138, 0.48)',
    borderColor: 'rgba(147, 197, 253, 0.28)',
    borderRadius: 11,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  featureGlassCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  featureList: {
    gap: 10,
    marginTop: 22,
  },
  featureMeta: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  featureTitle: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '800',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  form: {
    marginTop: spacing.xs,
  },
  formCol: {
    flex: 1,
    justifyContent: 'center',
  },
  formColFull: {
    width: '100%',
  },
  headerBlock: {
    marginBottom: spacing.md,
  },
  inputBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  inputBoxError: {
    borderColor: colors.danger,
  },
  mobileEndpointText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 14,
    textAlign: 'center',
  },
  backToUserBtn: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backToUserText: {
    color: colors.textMuted,
    fontSize: 12.5,
    fontWeight: '700',
  },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  showcaseBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.56)',
    borderColor: 'rgba(147, 197, 253, 0.35)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  showcaseBadgeText: {
    color: '#E0F2FE',
    fontSize: 12.5,
    fontWeight: '800',
  },
  showcaseDesc: {
    color: '#CBD5E1',
    fontSize: 13.5,
    lineHeight: 21,
    marginTop: 10,
  },
  showcaseForeground: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 32,
  },
  showcasePanel: {
    backgroundColor: '#0F172A',
    flex: 1.08,
    overflow: 'hidden',
    position: 'relative',
  },
  showcaseTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 35,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 48,
    paddingHorizontal: 18,
    shadowColor: 'rgba(37, 99, 235, 0.28)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.985 }],
  },
  submitButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
  },
  textInput: {
    color: colors.text,
    flex: 1,
    fontSize: 14.5,
    paddingVertical: 10,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
});
