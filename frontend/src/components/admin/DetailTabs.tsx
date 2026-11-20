import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/src/assets/styles/theme';
import { AdminTabKey } from '@/src/types/admin';

type DetailTabsProps = {
  activeTab: AdminTabKey;
  onChange: (tab: AdminTabKey) => void;
};

const tabs: { key: AdminTabKey; label: string }[] = [
  { key: 'video', label: 'Video bài giảng' },
  { key: 'vocabulary', label: 'Từ vựng' },
  { key: 'exercises', label: 'Bài tập thực hành' },
];

export default function DetailTabs({ activeTab, onChange }: DetailTabsProps) {
  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, active ? styles.tabActive : null]}>
            <Text style={[styles.label, active ? styles.labelActive : null]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  labelActive: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
  row: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingVertical: 11,
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
});
