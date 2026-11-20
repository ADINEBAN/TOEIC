import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing } from '@/src/assets/styles/theme';
import { AdminFlashcardApiItem } from '@/src/types/admin-api';

export default function VocabularyPanel({
  words,
  loading = false,
  onCreate,
  onDelete,
  onEdit,
  working = false,
}: {
  words: AdminFlashcardApiItem[];
  loading?: boolean;
  onCreate: () => void;
  onDelete: (word: AdminFlashcardApiItem) => void;
  onEdit: (word: AdminFlashcardApiItem) => void;
  working?: boolean;
}) {
  return (
    <View>
      <Pressable
        disabled={loading || working}
        onPress={onCreate}
        style={styles.primaryAction}
      >
        <Ionicons color={colors.onPrimary} name="add" size={20} />
        <Text style={styles.primaryActionText}>
          {working ? 'Đang xử lý...' : 'Thêm từ vựng mới'}
        </Text>
      </Pressable>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.headerCell}>Từ vựng</Text>
          <Text style={styles.headerCell}>Nghĩa tiếng Việt</Text>
          <Text style={styles.headerCell}>Phiên âm</Text>
          <Text style={styles.headerCell}>Audio</Text>
          <Text style={styles.headerCell}>Trạng thái</Text>
          <Text style={styles.headerCell}>Thao tác</Text>
        </View>

        {words.map((word) => (
          <View key={word.id} style={styles.tableRow}>
            <Text style={styles.cellBold}>{word.englishWord}</Text>
            <Text style={styles.cell}>{word.meaningVi}</Text>
            <Text style={styles.cell}>{word.pronunciation ?? '-'}</Text>
            <View style={styles.iconCell}>
              <Ionicons color={colors.primary} name="volume-medium-outline" size={18} />
            </View>
            <View style={styles.statusCol}>
              <View style={[styles.statusBadge, word.active ? styles.statusActive : styles.statusDraft]}>
                <Text style={[styles.statusText, word.active ? styles.statusTextActive : styles.statusTextDraft]}>
                  {word.active ? 'Published' : 'Draft'}
                </Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                disabled={working}
                hitSlop={8}
                onPress={() => onEdit(word)}
                style={styles.editBtn}
              >
                <Ionicons color={colors.primary} name="create-outline" size={16} />
              </Pressable>
              <Pressable
                disabled={working}
                hitSlop={8}
                onPress={() => onDelete(word)}
                style={styles.deleteBtn}
              >
                <Ionicons color={colors.danger} name="trash-outline" size={16} />
              </Pressable>
            </View>
          </View>
        ))}

        {!loading && words.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={styles.emptyText}>Chưa có từ vựng nào trong mô-đun này.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13.5,
  },
  cellBold: {
    color: colors.text,
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
  },
  deleteBtn: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: '#FECACA',
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  editBtn: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13.5,
  },
  headerCell: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  iconCell: {
    alignItems: 'flex-start',
    flex: 1,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: spacing.md,
    paddingVertical: 12,
  },
  primaryActionText: {
    color: colors.onPrimary,
    fontSize: 14.5,
    fontWeight: '700',
  },
  statusActive: {
    backgroundColor: colors.successSoft,
    borderColor: '#BBF7D0',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusCol: {
    flex: 1,
  },
  statusDraft: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextActive: {
    color: '#15803D',
  },
  statusTextDraft: {
    color: colors.textSecondary,
  },
  table: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeader: {
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  tableRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
});
