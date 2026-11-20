import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/assets/styles/theme';
import { PracticeSetApiItem } from '@/src/types/admin-api';

type ExercisesPanelProps = {
  exercises: PracticeSetApiItem[];
  loading?: boolean;
  onCreate: () => void;
  onDelete: (exercise: PracticeSetApiItem) => void;
  onEdit: (exercise: PracticeSetApiItem) => void;
  working?: boolean;
};

export default function ExercisesPanel({
  exercises,
  loading = false,
  onCreate,
  onDelete,
  onEdit,
  working = false,
}: ExercisesPanelProps) {
  return (
    <View>
      <Text style={styles.title}>Quản lý bài tập thực hành</Text>
      <Text style={styles.subTitle}>
        {loading
          ? 'Đang tải danh sách bài tập...'
          : `${exercises.length} bộ bài tập trong mô-đun này`}
      </Text>

      <Pressable
        disabled={loading || working}
        onPress={onCreate}
        style={styles.primaryAction}
      >
        <Ionicons color={colors.onPrimary} name="add" size={20} />
        <Text style={styles.primaryActionText}>
          {working ? 'Đang xử lý...' : 'Thêm bài tập mới'}
        </Text>
      </Pressable>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.typeCell]}>Loại</Text>
          <Text style={[styles.headerCell, styles.titleCell]}>Tiêu đề</Text>
          <Text style={[styles.headerCell, styles.qsCell]}>Part</Text>
          <Text style={[styles.headerCell, styles.actionsCell]}>Thao tác</Text>
        </View>

        {exercises.map((exercise) => (
          <View key={exercise.id} style={styles.tableRow}>
            <Text style={[styles.cell, styles.typeCell]}>{exercise.setType}</Text>
            <Text style={[styles.cell, styles.titleCell]}>{exercise.title}</Text>
            <Text style={[styles.cell, styles.qsCell]}>
              {exercise.partNo ? `Part ${exercise.partNo}` : '-'}
            </Text>
            <View style={[styles.actionRow, styles.actionsCell]}>
              <Pressable
                disabled={working}
                hitSlop={8}
                onPress={() => onEdit(exercise)}
                style={styles.editBtn}
              >
                <Ionicons color={colors.primary} name="create-outline" size={16} />
              </Pressable>
              <Pressable
                disabled={working}
                hitSlop={8}
                onPress={() => onDelete(exercise)}
                style={styles.deleteBtn}
              >
                <Ionicons color={colors.danger} name="trash-outline" size={16} />
              </Pressable>
            </View>
          </View>
        ))}

        {!loading && exercises.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={styles.emptyText}>Chưa có bài tập nào trong mô-đun này.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionsCell: {
    flex: 0.8,
    justifyContent: 'flex-end',
  },
  cell: {
    color: colors.textSecondary,
    fontSize: 13.5,
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
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
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
  qsCell: {
    flex: 0.8,
  },
  subTitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
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
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
  },
  titleCell: {
    flex: 1.6,
  },
  typeCell: {
    flex: 1.4,
  },
});
