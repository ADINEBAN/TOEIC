import { useState } from 'react';
import {
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
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing } from '@/src/assets/styles/theme';
import AdminLoginCard from '@/src/components/admin/AdminLoginCard';
import AdminShell from '@/src/components/admin/AdminShell';
import { API_BASE_URL } from '@/src/config/env';
import { useAuth } from '@/src/hooks/use-auth';
import { ApiError } from '@/src/services/api.client';
import { loginAdmin } from '@/src/services/admin-auth.service';

export default function AdminLoginScreen() {
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 880;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      <ScrollView
        contentContainerStyle={styles.scrollCenter}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.authContainer, isWide ? styles.authContainerWide : styles.authContainerNarrow]}
        >
          {isWide ? (
            <View style={styles.showcasePanel}>
              <View>
                <View style={styles.showcaseBadge}>
                  <Ionicons color="#93C5FD" name="sparkles" size={14} />
                  <Text style={styles.showcaseBadgeText}>TOEIC Trainer Workspace</Text>
                </View>

                <Text style={styles.showcaseTitle}>
                  Hệ thống quản trị{'\n'}nội dung & luyện thi
                </Text>
                <Text style={styles.showcaseDesc}>
                  Quản lý lộ trình học tập, ngân hàng câu hỏi Part 1–7, bộ đề thi, học viên và thống kê hiệu suất trên một giao diện thống nhất.
                </Text>

                <View style={styles.featureList}>
                  <View style={styles.featureItem}>
                    <View style={styles.featureIconWrap}>
                      <Ionicons color="#60A5FA" name="layers-outline" size={17} />
                    </View>
                    <View style={styles.featureCopy}>
                      <Text style={styles.featureTitle}>Lộ trình & Bài học chuẩn hóa</Text>
                      <Text style={styles.featureMeta}>Quản lý Path, Milestone, Module, Ngữ pháp & Video</Text>
                    </View>
                  </View>

                  <View style={styles.featureItem}>
                    <View style={styles.featureIconWrap}>
                      <Ionicons color="#34D399" name="document-text-outline" size={17} />
                    </View>
                    <View style={styles.featureCopy}>
                      <Text style={styles.featureTitle}>Ngân hàng câu hỏi & Đề thi</Text>
                      <Text style={styles.featureMeta}>Bulk import câu hỏi kèm audio/ảnh và xuất bản đề thi</Text>
                    </View>
                  </View>

                  <View style={styles.featureItem}>
                    <View style={styles.featureIconWrap}>
                      <Ionicons color="#FBBF24" name="analytics-outline" size={17} />
                    </View>
                    <View style={styles.featureCopy}>
                      <Text style={styles.featureTitle}>Giám sát học viên & Quyền truy cập</Text>
                      <Text style={styles.featureMeta}>Theo dõi điểm trung bình, streak và tài khoản Premium</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.endpointChip}>
                <View style={styles.endpointDot} />
                <Text numberOfLines={1} style={styles.endpointText}>
                  API: {API_BASE_URL}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.formCol, !isWide ? styles.formColFull : null]}>
            <AdminLoginCard>
              <View style={styles.headerBlock}>
                <Text style={styles.eyebrow}>Cổng quản trị bảo mật</Text>
                <Text style={styles.title}>Đăng nhập Admin</Text>
                <Text style={styles.subtitle}>
                  Sử dụng tài khoản có quyền ADMIN để truy cập bảng điều khiển.
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

                {!isWide ? (
                  <Text style={styles.mobileEndpointText}>API: {API_BASE_URL}</Text>
                ) : null}
              </View>
            </AdminLoginCard>
          </View>
        </KeyboardAvoidingView>
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
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: 920,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 42,
  },
  endpointChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.lg,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  endpointDot: {
    backgroundColor: '#34D399',
    borderRadius: 99,
    height: 7,
    width: 7,
  },
  endpointText: {
    color: '#CBD5E1',
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  featureCopy: {
    flex: 1,
  },
  featureIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  featureItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  featureList: {
    gap: 16,
    marginTop: 28,
  },
  featureMeta: {
    color: '#94A3B8',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  featureTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
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
    borderRadius: 12,
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
  scrollCenter: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  showcaseBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(37, 99, 235, 0.22)',
    borderColor: 'rgba(96, 165, 250, 0.35)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  showcaseBadgeText: {
    color: '#DBEAFE',
    fontSize: 12,
    fontWeight: '700',
  },
  showcaseDesc: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  showcasePanel: {
    backgroundColor: '#0F172A',
    flex: 1.05,
    justifyContent: 'space-between',
    padding: 34,
  },
  showcaseTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 36,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
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
    transform: [{ scale: 0.99 }],
  },
  submitButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  textInput: {
    color: colors.text,
    flex: 1,
    fontSize: 14.5,
    paddingVertical: 10,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 6,
  },
});
