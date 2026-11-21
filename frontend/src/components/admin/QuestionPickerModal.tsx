import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, spacing } from "@/src/assets/styles/theme";
import { QuestionApiItem } from "@/src/types/admin-api";

type QuestionPickerModalProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  questions: QuestionApiItem[];
  initialSelectedIds: number[];
  defaultPartFilter?: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (selectedIds: number[]) => Promise<void> | void;
};

type QuestionPickerModalBodyProps = Omit<QuestionPickerModalProps, "visible">;

function QuestionPickerModalBody({
  title,
  subtitle = "Tick nhiều câu từ Ngân hàng câu hỏi rồi bấm Lưu để cập nhật.",
  questions,
  initialSelectedIds,
  defaultPartFilter = "ALL",
  saving = false,
  onClose,
  onSave,
}: QuestionPickerModalBodyProps) {
  const [search, setSearch] = useState("");
  const [partFilter, setPartFilter] = useState(defaultPartFilter);
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);

  const visibleQuestions = useMemo(() => {
    const qLower = search.trim().toLowerCase();
    return questions.filter((q) => {
      if (partFilter !== "ALL" && String(q.partNo ?? "") !== partFilter) {
        return false;
      }
      if (!qLower) return true;
      return (
        q.questionText.toLowerCase().includes(qLower) ||
        String(q.id).includes(qLower)
      );
    });
  }, [partFilter, questions, search]);

  const toggleQuestion = (questionId: number) => {
    setSelectedIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId],
    );
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Text style={styles.countText}>
            Đã chọn: {selectedIds.length} câu
          </Text>
        </View>

        <TextInput
          onChangeText={setSearch}
          placeholder="Tìm nội dung câu hỏi hoặc #ID..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          value={search}
        />

        <View style={styles.chipRow}>
          {["ALL", "1", "2", "3", "4", "5", "6", "7"].map((partKey) => {
            const active = partFilter === partKey;
            return (
              <Pressable
                key={partKey}
                onPress={() => setPartFilter(partKey)}
                style={[styles.chip, active ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                  {partKey === "ALL" ? "Tất cả Part" : `Part ${partKey}`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() =>
              setSelectedIds((prev) => {
                const merged = new Set(prev);
                visibleQuestions.forEach((q) => merged.add(q.id));
                return Array.from(merged);
              })
            }
            style={styles.quickBtn}
          >
            <Text style={styles.quickBtnText}>
              Chọn tất cả đang lọc ({visibleQuestions.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSelectedIds([])}
            style={styles.quickBtn}
          >
            <Text style={styles.quickBtnText}>Bỏ chọn hết</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scroller}>
          {visibleQuestions.map((q) => {
            const checked = selectedIds.includes(q.id);
            const correct = q.options?.find((o) => o.correct)?.optionLabel ?? "-";
            return (
              <Pressable
                key={q.id}
                onPress={() => toggleQuestion(q.id)}
                style={[styles.row, checked ? styles.rowChecked : null]}
              >
                <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
                  {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.metaRow}>
                    <View style={styles.partPill}>
                      <Text style={styles.partPillText}>
                        {q.partNo && q.partNo >= 1 && q.partNo <= 7
                          ? `Part ${q.partNo}`
                          : `⚠️ Part ${q.partNo ?? "-"}`}
                      </Text>
                    </View>
                    <Text style={styles.metaHint}>
                      #{q.id} • {q.sourceType ?? "INTERNAL"} • Đáp án {correct}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={styles.questionText}>
                    {q.questionText}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {visibleQuestions.length === 0 ? (
            <Text style={styles.metaHint}>Không tìm thấy câu hỏi phù hợp.</Text>
          ) : null}
        </ScrollView>

        <View style={styles.footerRow}>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Đóng</Text>
          </Pressable>
          <Pressable
            disabled={saving}
            onPress={() => void onSave(selectedIds)}
            style={styles.saveBtn}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "Đang lưu..." : `Lưu danh sách (${selectedIds.length} câu)`}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function QuestionPickerModal({
  visible,
  ...rest
}: QuestionPickerModalProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={rest.onClose}
      transparent
      visible={visible}
    >
      {visible ? <QuestionPickerModalBody {...rest} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    maxHeight: "90%",
    maxWidth: 820,
    padding: 20,
    width: "100%",
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  countText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: "800",
  },
  searchInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 13.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: "100%",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: "700",
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
  },
  quickBtn: {
    backgroundColor: colors.primarySoft,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickBtnText: {
    color: colors.primaryDark,
    fontSize: 12.5,
    fontWeight: "700",
  },
  scroller: {
    maxHeight: 340,
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    padding: 10,
  },
  rowChecked: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: "900",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  partPill: {
    backgroundColor: "#EEF2FF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  partPillText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "800",
  },
  metaHint: {
    color: colors.textMuted,
    fontSize: 12.5,
  },
  questionText: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  cancelBtn: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveBtnText: {
    color: colors.onPrimary,
    fontSize: 13.5,
    fontWeight: "700",
  },
});
