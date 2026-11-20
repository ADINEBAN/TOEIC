import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/src/assets/styles/theme';
import { VideoLessonApiItem } from '@/src/types/admin-api';

type VideoPanelProps = {
  loading?: boolean;
  onCreate: () => void;
  onDelete: (video: VideoLessonApiItem) => void;
  onEdit: (video: VideoLessonApiItem) => void;
  videos: VideoLessonApiItem[];
  working?: boolean;
};

export default function VideoPanel({
  loading = false,
  onCreate,
  onDelete,
  onEdit,
  videos,
  working = false,
}: VideoPanelProps) {
  return (
    <View>
      <Text style={styles.heading}>Quản lý bài giảng Video</Text>
      <Text style={styles.subHeading}>
        {loading ? 'Đang tải danh sách video...' : `${videos.length} bài giảng video`}
      </Text>

      <Pressable
        disabled={loading || working}
        onPress={onCreate}
        style={styles.primaryAction}
      >
        <Ionicons color={colors.onPrimary} name="add" size={20} />
        <Text style={styles.primaryActionText}>
          {working ? 'Đang xử lý...' : 'Thêm Video mới'}
        </Text>
      </Pressable>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.titleCell]}>Tiêu đề</Text>
          <Text style={[styles.headerCell, styles.durationCell]}>Thời lượng</Text>
          <Text style={[styles.headerCell, styles.actionsCell]}>Thao tác</Text>
        </View>

        {videos.map((video) => (
          <View key={video.id} style={styles.tableRow}>
            <View style={styles.titleCell}>
              <Text style={styles.cell} numberOfLines={1}>
                {video.title}
              </Text>
              <Text numberOfLines={1} style={styles.metaCell}>
                {video.videoUrl ?? '-'}
              </Text>
            </View>
            <Text style={[styles.cell, styles.durationCell]}>
              {video.durationSeconds ? `${video.durationSeconds}s` : '-'}
            </Text>
            <View style={[styles.actionRow, styles.actionsCell]}>
              <Pressable
                disabled={working}
                hitSlop={8}
                onPress={() => onEdit(video)}
                style={styles.editBtn}
              >
                <Ionicons color={colors.primary} name="create-outline" size={16} />
              </Pressable>
              <Pressable
                disabled={working}
                hitSlop={8}
                onPress={() => onDelete(video)}
                style={styles.deleteBtn}
              >
                <Ionicons color={colors.danger} name="trash-outline" size={16} />
              </Pressable>
            </View>
          </View>
        ))}

        {!loading && videos.length === 0 ? (
          <View style={styles.tableRow}>
            <Text style={styles.emptyText}>Chưa có video nào trong mô-đun này.</Text>
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
    fontWeight: '600',
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
  durationCell: {
    flex: 0.7,
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
  heading: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
  },
  metaCell: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
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
  subHeading: {
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
  titleCell: {
    flex: 1.8,
  },
});
