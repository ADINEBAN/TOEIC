import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, spacing } from "@/src/assets/styles/theme";

export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;

export type SelectOption = {
  label: string;
  value: string;
};

export type AdminField = {
  label: string;
  name: string;
  options?: SelectOption[];
  placeholder?: string;
  required?: boolean;
  type: "text" | "number" | "textarea" | "select" | "switch";
};

export type AdminColumn<T> = {
  label: string;
  render: (item: T) => string;
  width?: number;
};

type AdminCrudPanelProps<T> = {
  columns: AdminColumn<T>[];
  emptyText?: string;
  fields: AdminField[];
  getInitialValues: (item?: T) => FormValues;
  getItemId: (item: T) => number;
  loading?: boolean;
  onCreate?: (values: FormValues) => Promise<void>;
  onDelete?: (item: T) => Promise<void>;
  onRefresh?: () => void;
  onUpdate?: (item: T, values: FormValues) => Promise<void>;
  pageSize?: number;
  records: T[];
  subtitle?: string;
  title: string;
  working?: boolean;
};

const ACTION_COLUMN_WIDTH = 118;

function resolveColumnWidth(label: string, explicitWidth?: number) {
  if (explicitWidth) return explicitWidth;

  const normalized = label.toLowerCase();

  if (normalized === "id") return 76;
  if (["no.", "part", "sort", "order", "active", "free", "published", "target", "duration"].includes(normalized)) {
    return 108;
  }
  if (normalized.includes("id")) return 108;
  if (normalized.includes("question")) return 380;
  if (normalized.includes("description") || normalized.includes("content")) return 320;
  if (normalized.includes("title") || normalized.includes("name")) return 240;
  if (normalized.includes("source") || normalized.includes("type") || normalized.includes("status")) return 150;
  if (normalized.includes("url")) return 280;

  return 165;
}

function getStatusBadgeTone(rawValue: string) {
  const normalized = rawValue.trim().toUpperCase();
  if (["YES", "PUBLISHED", "ACTIVE", "TRUE", "REQUIRED"].includes(normalized)) {
    return {
      bg: colors.successSoft,
      border: "#BBF7D0",
      text: "#15803D",
      label: normalized === "YES" ? "Đang bật" : rawValue,
    };
  }
  if (["NO", "DRAFT", "INACTIVE", "FALSE", "OPTIONAL"].includes(normalized)) {
    return {
      bg: "#F1F5F9",
      border: "#CBD5E1",
      text: "#475569",
      label: normalized === "NO" ? "Tạm tắt" : rawValue,
    };
  }
  if (["BLOCKED", "FAILED", "DISABLED"].includes(normalized)) {
    return {
      bg: colors.dangerSoft,
      border: "#FECACA",
      text: colors.danger,
      label: rawValue,
    };
  }
  if (["ADMIN"].includes(normalized)) {
    return {
      bg: colors.primarySoft,
      border: "#BFDBFE",
      text: colors.primaryDark,
      label: rawValue,
    };
  }
  return null;
}

export default function AdminCrudPanel<T>({
  columns,
  emptyText = "Chưa có dữ liệu.",
  fields,
  getInitialValues,
  getItemId,
  loading = false,
  onCreate,
  onDelete,
  onRefresh,
  onUpdate,
  pageSize = 8,
  records,
  subtitle,
  title,
  working = false,
}: AdminCrudPanelProps<T>) {
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [openSelectName, setOpenSelectName] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [values, setValues] = useState<FormValues>(() => getInitialValues());

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter((item) =>
      columns.some((col) => col.render(item).toLowerCase().includes(q)),
    );
  }, [columns, records, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + pageSize);

  const columnWidths = columns.map((column) =>
    resolveColumnWidth(column.label, column.width),
  );
  const tableContentWidth = columnWidths.reduce(
    (sum, width) => sum + width,
    ACTION_COLUMN_WIDTH,
  );

  const openCreate = () => {
    setEditingItem(null);
    setOpenSelectName(null);
    setValues(getInitialValues());
    setFormOpen(true);
  };

  const openEdit = (item: T) => {
    setEditingItem(item);
    setOpenSelectName(null);
    setValues(getInitialValues(item));
    setFormOpen(true);
  };

  const updateValue = (name: string, value: FormValue) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const closeForm = () => {
    setEditingItem(null);
    setOpenSelectName(null);
    setFormOpen(false);
  };

  const submitForm = async () => {
    if (editingItem && onUpdate) {
      await onUpdate(editingItem, values);
      closeForm();
      return;
    }

    if (onCreate) {
      await onCreate(values);
      closeForm();
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <View style={styles.searchBox}>
            <Ionicons color={colors.textMuted} name="search-outline" size={16} />
            <TextInput
              onChangeText={(val) => {
                setSearchQuery(val);
                setPage(1);
              }}
              placeholder="Tìm nhanh..."
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              value={searchQuery}
            />
            {searchQuery.length > 0 ? (
              <Pressable hitSlop={6} onPress={() => setSearchQuery("")}>
                <Ionicons color={colors.textMuted} name="close-circle" size={16} />
              </Pressable>
            ) : null}
          </View>
          {onRefresh ? (
            <Pressable
              disabled={working}
              onPress={onRefresh}
              style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
            >
              <Ionicons color={colors.textSecondary} name="refresh-outline" size={18} />
            </Pressable>
          ) : null}
          {onCreate ? (
            <Pressable
              disabled={working}
              onPress={openCreate}
              style={({ pressed }) => [
                styles.actionButton,
                styles.primaryButton,
                pressed ? styles.primaryButtonPressed : null,
              ]}
            >
              <Ionicons color={colors.onPrimary} name="add" size={18} />
              <Text style={styles.primaryButtonText}>Thêm mới</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={closeForm}
        transparent
        visible={formOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>
                  {editingItem ? "Cập nhật thông tin" : "Thêm bản ghi mới"}
                </Text>
                <Text style={styles.formSubtitle}>
                  Điền các trường thông tin bên dưới rồi bấm Lưu để áp dụng.
                </Text>
              </View>
              <Pressable onPress={closeForm} style={styles.iconButton}>
                <Ionicons color={colors.textSecondary} name="close" size={18} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.formGrid}>
                {fields.map((field) => {
                  const isSelectOpen = openSelectName === field.name;
                  return (
                    <View
                      key={field.name}
                      style={[
                        styles.field,
                        field.type === "textarea" ? styles.fieldWide : null,
                      ]}
                    >
                      <Text style={styles.label}>
                        {field.label}
                        {field.required ? (
                          <Text style={styles.required}> *</Text>
                        ) : null}
                      </Text>
                      {field.type === "switch" ? (
                        <View style={styles.switchRow}>
                          <Switch
                            onValueChange={(value) => updateValue(field.name, value)}
                            thumbColor={colors.surface}
                            trackColor={{ false: "#CBD5E1", true: colors.primary }}
                            value={Boolean(values[field.name])}
                          />
                          <Text style={styles.switchText}>
                            {Boolean(values[field.name]) ? "Đang bật" : "Đang tắt"}
                          </Text>
                        </View>
                      ) : null}
                      {field.type === "select" ? (
                        <View style={styles.selectDropdownWrapper}>
                          <Pressable
                            onPress={() =>
                              setOpenSelectName((cur) => (cur === field.name ? null : field.name))
                            }
                            style={styles.selectField}
                          >
                            <Text style={styles.selectTextValue} numberOfLines={1}>
                              {field.options?.find(
                                (option) => String(values[field.name]) === option.value,
                              )?.label ?? "Chọn giá trị..."}
                            </Text>
                            <Ionicons
                              color={colors.textMuted}
                              name={isSelectOpen ? "chevron-up" : "chevron-down"}
                              size={16}
                            />
                          </Pressable>
                          {isSelectOpen ? (
                            <View style={styles.selectDropdownMenu}>
                              <ScrollView nestedScrollEnabled style={styles.selectScroll}>
                                {(field.options ?? []).map((option) => {
                                  const selected = String(values[field.name]) === option.value;
                                  return (
                                    <Pressable
                                      key={option.value}
                                      onPress={() => {
                                        updateValue(field.name, option.value);
                                        setOpenSelectName(null);
                                      }}
                                      style={[
                                        styles.selectDropdownOption,
                                        selected ? styles.selectDropdownOptionActive : null,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.selectText,
                                          selected ? styles.selectTextActive : null,
                                        ]}
                                      >
                                        {option.label}
                                      </Text>
                                      {selected ? (
                                        <Ionicons color={colors.primary} name="checkmark" size={16} />
                                      ) : null}
                                    </Pressable>
                                  );
                                })}
                              </ScrollView>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      {field.type !== "switch" && field.type !== "select" ? (
                        <TextInput
                          keyboardType={field.type === "number" ? "numeric" : "default"}
                          multiline={field.type === "textarea"}
                          onChangeText={(value) => updateValue(field.name, value)}
                          placeholder={field.placeholder}
                          placeholderTextColor="#94A3B8"
                          style={[
                            styles.input,
                            field.type === "textarea" ? styles.textarea : null,
                          ]}
                          value={String(values[field.name] ?? "")}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.formActions}>
              <Pressable
                disabled={working}
                onPress={closeForm}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Hủy bỏ</Text>
              </Pressable>
              <Pressable
                disabled={working}
                onPress={submitForm}
                style={[styles.actionButton, styles.primaryButton]}
              >
                <Ionicons color={colors.onPrimary} name="save-outline" size={17} />
                <Text style={styles.primaryButtonText}>
                  {working ? "Đang lưu..." : "Lưu thay đổi"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.tableScrollerContent}
        horizontal
        style={styles.tableScroller}
      >
        <View style={[styles.table, { minWidth: tableContentWidth }]}>
          <View style={styles.tableHeader}>
            {columns.map((column, index) => (
              <Text
                key={column.label}
                style={[
                  styles.headerCell,
                  {
                    flexBasis: columnWidths[index],
                    flexGrow: 1,
                    minWidth: columnWidths[index],
                  },
                ]}
              >
                {column.label}
              </Text>
            ))}
            <Text style={[styles.headerCell, styles.actionCell]}>Thao tác</Text>
          </View>

          {paginatedRecords.map((item, rowIndex) => (
            <View
              key={getItemId(item)}
              style={[
                styles.tableRow,
                rowIndex % 2 === 1 ? styles.tableRowAlt : null,
              ]}
            >
              {columns.map((column, index) => {
                const rawVal = column.render(item);
                const isBadgeColumn = ["active", "published", "free", "status", "role"].includes(
                  column.label.toLowerCase(),
                );
                const badge = isBadgeColumn ? getStatusBadgeTone(rawVal) : null;

                return (
                  <View
                    key={column.label}
                    style={[
                      styles.cellWrap,
                      {
                        flexBasis: columnWidths[index],
                        flexGrow: 1,
                        minWidth: columnWidths[index],
                      },
                    ]}
                  >
                    {badge ? (
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: badge.bg, borderColor: badge.border },
                        ]}
                      >
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {badge.label}
                        </Text>
                      </View>
                    ) : (
                      <Text numberOfLines={2} style={styles.cell}>
                        {rawVal}
                      </Text>
                    )}
                  </View>
                );
              })}
              <View style={[styles.rowActions, styles.actionCell]}>
                {onUpdate ? (
                  <Pressable
                    disabled={working}
                    onPress={() => openEdit(item)}
                    style={({ pressed }) => [
                      styles.rowEditBtn,
                      pressed ? styles.rowBtnPressed : null,
                    ]}
                  >
                    <Ionicons color={colors.primary} name="create-outline" size={16} />
                  </Pressable>
                ) : null}
                {onDelete ? (
                  <Pressable
                    disabled={working}
                    onPress={() => onDelete(item)}
                    style={({ pressed }) => [
                      styles.rowDeleteBtn,
                      pressed ? styles.rowBtnPressed : null,
                    ]}
                  >
                    <Ionicons color={colors.danger} name="trash-outline" size={16} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}

          {!loading && filteredRecords.length === 0 ? (
            <View style={styles.emptyRow}>
              <Ionicons color={colors.textMuted} name="folder-open-outline" size={20} />
              <Text style={styles.emptyText}>
                {searchQuery ? `Không tìm thấy kết quả cho "${searchQuery}"` : emptyText}
              </Text>
            </View>
          ) : null}
          {loading ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>Đang tải dữ liệu...</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {filteredRecords.length > 0 ? (
        <View style={styles.paginationBar}>
          <Text style={styles.paginationSummary}>
            {`Hiển thị ${startIndex + 1}–${Math.min(startIndex + pageSize, filteredRecords.length)} trong tổng ${filteredRecords.length} bản ghi`}
          </Text>
          <View style={styles.paginationControls}>
            <Pressable
              disabled={currentPage === 1}
              onPress={() => setPage((prev) => Math.max(1, prev - 1))}
              style={[
                styles.paginationButton,
                currentPage === 1 ? styles.paginationButtonDisabled : null,
              ]}
            >
              <Ionicons color={colors.text} name="chevron-back" size={16} />
            </Pressable>

            <View style={styles.paginationPagePill}>
              <Text style={styles.paginationPageText}>
                {`Trang ${currentPage} / ${totalPages}`}
              </Text>
            </View>

            <Pressable
              disabled={currentPage === totalPages}
              onPress={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              style={[
                styles.paginationButton,
                currentPage === totalPages ? styles.paginationButtonDisabled : null,
              ]}
            >
              <Ionicons color={colors.text} name="chevron-forward" size={16} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
  },
  actionCell: {
    width: ACTION_COLUMN_WIDTH,
  },
  cell: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: "500",
    lineHeight: 20,
  },
  cellWrap: {
    alignItems: "flex-start",
    justifyContent: "center",
    paddingRight: spacing.md,
  },
  emptyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 28,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13.5,
    fontWeight: "600",
  },
  field: {
    flex: 1,
    minWidth: 230,
  },
  fieldWide: {
    flexBasis: "100%",
  },
  formActions: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  formHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
  },
  formSubtitle: {
    color: colors.textMuted,
    fontSize: 12.5,
    marginTop: 2,
  },
  formTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  headerCell: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    paddingRight: spacing.md,
    textTransform: "uppercase",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  iconButtonPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: {
    color: colors.text,
    fontSize: 12.5,
    fontWeight: "700",
    marginBottom: 6,
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalBody: {
    maxHeight: 520,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: "90%",
    maxWidth: 880,
    padding: 22,
    shadowColor: "rgba(15, 23, 42, 0.22)",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 1,
    shadowRadius: 48,
    width: "94%",
  },
  paginationBar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
  paginationButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  paginationButtonDisabled: {
    opacity: 0.4,
  },
  paginationControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  paginationPagePill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 102,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  paginationPageText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  paginationSummary: {
    color: colors.textMuted,
    fontSize: 12.5,
    fontWeight: "600",
  },
  panel: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    shadowColor: "rgba(37, 99, 235, 0.24)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  primaryButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  required: {
    color: colors.danger,
  },
  rowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-start",
  },
  rowBtnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  rowDeleteBtn: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: "#FECACA",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  rowEditBtn: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 38,
    minWidth: 210,
    paddingHorizontal: 10,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  selectDropdownMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    maxHeight: 190,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
  },
  selectDropdownOption: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectDropdownOptionActive: {
    backgroundColor: colors.primarySoft,
  },
  selectDropdownWrapper: {
    width: "100%",
  },
  selectField: {
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  selectScroll: {
    maxHeight: 190,
  },
  selectText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  selectTextActive: {
    color: colors.primaryDark,
    fontWeight: "800",
  },
  selectTextValue: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    marginRight: 8,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 42,
  },
  switchText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontWeight: "600",
  },
  table: {
    alignSelf: "stretch",
    flex: 1,
    width: "100%",
  },
  tableHeader: {
    backgroundColor: colors.surfaceAlt,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  tableRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  tableRowAlt: {
    backgroundColor: "#FAFCFF",
  },
  tableScroller: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableScrollerContent: {
    flexGrow: 1,
  },
  textarea: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  titleBlock: {
    flex: 1,
    minWidth: 200,
  },
});
