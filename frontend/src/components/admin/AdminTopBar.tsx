import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing } from '@/src/assets/styles/theme';
import AppLogoBadge from '@/src/components/common/AppLogoBadge';

type AdminTopBarProps = {
  adminName: string;
  isLoggingOut?: boolean;
  onLogout: () => void;
};

export default function AdminTopBar({
  adminName,
  isLoggingOut = false,
  onLogout,
}: AdminTopBarProps) {
  const initial = (adminName || 'A').trim().charAt(0).toUpperCase() || 'A';

  return (
    <View style={styles.bar}>
      <View style={styles.brandRow}>
        <AppLogoBadge animated glowColor="rgba(37, 99, 235, 0.28)" size={42} />
        <View>
          <Text style={styles.eyebrow}>TOEIC Trainer</Text>
          <Text style={styles.title}>Cổng Quản Trị (Admin Console)</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>API Sẵn sàng</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.profilePill}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text numberOfLines={1} style={styles.adminNameText}>
            {adminName || 'Admin'}
          </Text>
        </View>

        <Pressable
          disabled={isLoggingOut}
          onPress={onLogout}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed ? styles.logoutButtonPressed : null,
            isLoggingOut ? styles.logoutButtonDisabled : null,
          ]}
        >
          <Ionicons color={colors.danger} name="log-out-outline" size={16} />
          <Text style={styles.logoutText}>
            {isLoggingOut ? 'Đang xuất...' : 'Đăng xuất'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  adminNameText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 160,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#BFDBFE',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  avatarText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  bar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  divider: {
    backgroundColor: colors.border,
    height: 24,
    width: 1,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  logoBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    shadowColor: 'rgba(37, 99, 235, 0.25)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
    width: 40,
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: '#FECACA',
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
  logoutButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  logoutText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  profilePill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  statusBadge: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderColor: '#A7F3D0',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  statusText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
});
