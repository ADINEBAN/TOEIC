import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/src/assets/styles/theme';
import { AdminCourse, AdminLesson } from '@/src/types/admin';

type CourseOutlinePanelProps = {
  activeLessonId: number;
  course: AdminCourse;
  onSelectLesson: (lesson: AdminLesson) => void;
};

export default function CourseOutlinePanel({
  activeLessonId,
  course,
  onSelectLesson,
}: CourseOutlinePanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.breadcrumb}>Trang chủ {'>'} Khóa học {'>'} {course.title}</Text>
      <Text style={styles.heading}>Quản lý Khóa học & Bài giảng</Text>

      <View style={styles.card}>
        <View style={styles.courseRow}>
          <Ionicons color={colors.primary} name="apps" size={18} />
          <Text style={styles.courseTitle}>
            {course.title} ({course.level})
          </Text>
        </View>
      </View>

      {course.modules.map((module) => (
        <View key={module.id} style={styles.card}>
          <View style={styles.moduleRow}>
            <Ionicons color={colors.textMuted} name="chevron-down" size={18} />
            <Ionicons color={colors.primary} name="folder-outline" size={18} />
            <Text style={styles.moduleTitle}>{module.title}</Text>
          </View>

          <View style={styles.lessonList}>
            {module.lessons.map((lesson) => {
              const active = lesson.id === activeLessonId;

              return (
                <Pressable
                  key={lesson.id}
                  onPress={() => onSelectLesson(lesson)}
                  style={[styles.lessonItem, active ? styles.lessonItemActive : null]}>
                  <Ionicons
                    color={active ? colors.primaryDark : colors.textMuted}
                    name={active ? 'apps' : 'chevron-forward'}
                    size={16}
                  />
                  <Text style={[styles.lessonText, active ? styles.lessonTextActive : null]}>
                    {lesson.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  breadcrumb: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: spacing.md,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  courseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  courseTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  heading: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 18,
  },
  lessonItem: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lessonItemActive: {
    backgroundColor: colors.primarySoft,
  },
  lessonList: {
    gap: 6,
    marginTop: 14,
  },
  lessonText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  lessonTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  moduleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  moduleTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  panel: {
    flex: 1.1,
  },
});
