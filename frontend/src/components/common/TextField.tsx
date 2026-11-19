import { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';

import { radius, spacing } from '@/src/assets/styles/user-theme';
import { useAppTheme } from '@/src/store/theme-store';

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric';
  autoCapitalize?: 'none' | 'sentences';
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  error?: string | null;
  compact?: boolean;
  variant?: 'dark' | 'light';
  wrapperStyle?: ViewStyle;
};

export default function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  leftIcon,
  rightSlot,
  error,
  compact = false,
  variant = 'light',
  wrapperStyle,
}: TextFieldProps) {
  const { theme } = useAppTheme();
  const c = theme.colors;
  const forceDarkShell = variant === 'dark' && !c.isDark;

  return (
    <View
      style={[
        styles.wrapper,
        compact ? styles.wrapperCompact : null,
        wrapperStyle,
      ]}>
      <Text
        style={[
          styles.label,
          compact ? styles.labelCompact : null,
          { color: forceDarkShell ? c.heroText : c.textMuted },
        ]}>
        {label}
      </Text>
      <View
        style={[
          styles.inputShell,
          compact ? styles.inputShellCompact : null,
          {
            backgroundColor: forceDarkShell ? 'rgba(28, 30, 62, 0.92)' : c.surface,
            borderColor: error ? c.danger : c.glassBorder,
            elevation: Platform.OS === 'android' ? 2 : 0,
            shadowColor: c.shadow,
          },
        ]}>
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
        <TextInput
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={forceDarkShell ? '#90A2BD' : c.textMuted}
          secureTextEntry={secureTextEntry}
          style={[
            styles.input,
            compact ? styles.inputCompact : null,
            { color: forceDarkShell ? '#F7FAFF' : c.text },
          ]}
          value={value}
        />
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
      {error ? (
        <Text style={[styles.error, compact ? styles.errorCompact : null, { color: c.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function FieldIconButton({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable hitSlop={12} onPress={onPress} style={styles.iconButton}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  error: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
  errorCompact: {
    fontSize: 11,
    marginTop: 4,
  },
  iconButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  inputCompact: {
    fontSize: 15,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  inputShellCompact: {
    minHeight: 48,
    paddingHorizontal: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  labelCompact: {
    fontSize: 12,
    marginBottom: 4,
  },
  leftIcon: {
    width: 22,
  },
  rightSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapper: {
    marginBottom: spacing.md,
  },
  wrapperCompact: {
    marginBottom: 10,
  },
});
