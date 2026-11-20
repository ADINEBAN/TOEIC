import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import AppHeader from "@/src/components/user/AppHeader";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  analyzeDocumentAnswersWithAi,
  confirmDocumentExam,
  getImportedDocumentDetail,
  getMyGeneratedDocumentExams,
  getMyImportedDocuments,
  removeImportedDocumentQuestion,
  updateImportedDocumentQuestion,
  uploadToeicDocument,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import {
  ImportedDocumentItem,
  ImportedDocumentQuestionItem,
  UserTestResponse,
} from "@/src/types/user-api";
import { pushRoute, safeBack } from "@/src/utils/navigation";

type PartFilter = "ALL" | 5 | 6 | 7 | "ISSUES";

const PART_CHOICES = [5, 6, 7] as const;

export default function DocumentExamScreen() {
  const { auth } = useAuth();
  const { theme } = useAppTheme();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [viewMode, setViewMode] = useState<"hub" | "review">("hub");
  const [loadingList, setLoadingList] = useState(() => Boolean(auth?.accessToken));
  const [uploading, setUploading] = useState(false);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [documents, setDocuments] = useState<ImportedDocumentItem[]>([]);
  const [generatedExams, setGeneratedExams] = useState<UserTestResponse[]>([]);
  const [activeDoc, setActiveDoc] = useState<ImportedDocumentItem | null>(null);
  const [partFilter, setPartFilter] = useState<PartFilter>("ALL");

  // Confirm Exam configuration
  const [examTitleInput, setExamTitleInput] = useState("");
  const [selectedPartsForExam, setSelectedPartsForExam] = useState<number[]>([5, 6, 7]);

  // Question Edit Modal state
  const [editingQuestion, setEditingQuestion] = useState<ImportedDocumentQuestionItem | null>(null);
  const [editPartNo, setEditPartNo] = useState<number>(5);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editOptions, setEditOptions] = useState<{ optionLabel: string; optionText: string }[]>([]);
  const [editOfficialKey, setEditOfficialKey] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const token = auth?.accessToken;
    if (!token) {
      return;
    }
    let mounted = true;
    Promise.allSettled([getMyImportedDocuments(token), getMyGeneratedDocumentExams(token)])
      .then(([docsRes, examsRes]) => {
        if (!mounted) return;
        if (docsRes.status === "fulfilled") {
          setDocuments(docsRes.value.data ?? []);
        }
        if (examsRes.status === "fulfilled") {
          setGeneratedExams(examsRes.value.data ?? []);
        }
      })
      .finally(() => {
        if (mounted) setLoadingList(false);
      });
    return () => {
      mounted = false;
    };
  }, [auth?.accessToken]);

  const refreshLibrary = async () => {
    if (!auth?.accessToken) return;
    const [docsRes, examsRes] = await Promise.allSettled([
      getMyImportedDocuments(auth.accessToken),
      getMyGeneratedDocumentExams(auth.accessToken),
    ]);
    if (docsRes.status === "fulfilled") {
      setDocuments(docsRes.value.data ?? []);
    }
    if (examsRes.status === "fulfilled") {
      setGeneratedExams(examsRes.value.data ?? []);
    }
  };

  const openDocumentInReview = (doc: ImportedDocumentItem) => {
    setActiveDoc(doc);
    setExamTitleInput(doc.fileName.replace(/\.[^.]+$/, "") + " (Extracted TOEIC)");
    const presentParts = Array.from(new Set((doc.questions || []).map((q) => q.partNo))).filter(
      (p) => p >= 5 && p <= 7,
    );
    setSelectedPartsForExam(presentParts.length > 0 ? presentParts : [5, 6, 7]);
    setPartFilter("ALL");
    setViewMode("review");
  };

  const handleUploadPickedDocument = async (picked: {
    uri?: string;
    name: string;
    mimeType?: string;
    webFile?: File | Blob;
  }) => {
    if (!auth?.accessToken) {
      Alert.alert("Cần đăng nhập", "Vui lòng đăng nhập để tải tài liệu TOEIC.");
      return;
    }
    try {
      setUploading(true);
      const res = await uploadToeicDocument(auth.accessToken, picked);
      if (res.data) {
        await refreshLibrary();
        openDocumentInReview(res.data);
      }
    } catch (err) {
      Alert.alert(
        "Trích xuất thất bại",
        err instanceof Error ? err.message : "Không thể xử lý tài liệu này.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handlePickDocument = async () => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          void handleUploadPickedDocument({
            name: file.name,
            mimeType: file.type,
            webFile: file,
          });
        }
      };
      input.click();
      return;
    }

    const res = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) {
      return;
    }
    const asset = res.assets[0];
    const nameLower = (asset.name || "").toLowerCase();
    const mimeLower = (asset.mimeType || "").toLowerCase();
    const dotIdx = nameLower.lastIndexOf(".");
    const ext = dotIdx >= 0 ? nameLower.slice(dotIdx + 1) : "";
    const allowedExt = new Set(["pdf", "docx", "doc", "txt", "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);
    const allowedMime = mimeLower.startsWith("image/")
      || mimeLower === "application/pdf"
      || mimeLower === "application/msword"
      || mimeLower === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      || mimeLower.startsWith("text/");
    if (ext && !allowedExt.has(ext) && !allowedMime) {
      Alert.alert(
        "Định dạng chưa hỗ trợ",
        "Vui lòng chọn tệp PDF, Word (.docx/.doc), TXT hoặc Ảnh (PNG, JPG, WEBP).",
      );
      return;
    }
    await handleUploadPickedDocument({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
    });
  };

  const handleOpenSavedDocument = async (docId: number) => {
    if (!auth?.accessToken) return;
    try {
      setLoadingList(true);
      const res = await getImportedDocumentDetail(auth.accessToken, docId);
      if (res.data) {
        openDocumentInReview(res.data);
      }
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể tải chi tiết tài liệu.");
    } finally {
      setLoadingList(false);
    }
  };

  const handleToggleInclude = async (q: ImportedDocumentQuestionItem) => {
    if (!auth?.accessToken || !activeDoc) return;
    try {
      const res = await updateImportedDocumentQuestion(auth.accessToken, activeDoc.id, q.id, {
        included: !q.included,
      });
      if (res.data) {
        setActiveDoc(res.data);
      }
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể cập nhật câu hỏi.");
    }
  };

  const handleReclassifyPart = async (q: ImportedDocumentQuestionItem, nextPart: number) => {
    if (!auth?.accessToken || !activeDoc || q.partNo === nextPart) return;
    try {
      const res = await updateImportedDocumentQuestion(auth.accessToken, activeDoc.id, q.id, {
        partNo: nextPart,
      });
      if (res.data) {
        setActiveDoc(res.data);
      }
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể đổi Part.");
    }
  };

  const handleDeleteQuestion = async (q: ImportedDocumentQuestionItem) => {
    if (!auth?.accessToken || !activeDoc) return;
    try {
      const res = await removeImportedDocumentQuestion(auth.accessToken, activeDoc.id, q.id);
      if (res.data) {
        setActiveDoc(res.data);
      }
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể xóa câu hỏi.");
    }
  };

  const openEditModal = (q: ImportedDocumentQuestionItem) => {
    setEditingQuestion(q);
    setEditPartNo(q.partNo);
    setEditQuestionText(q.questionText);
    setEditOptions(
      (q.options || []).map((o) => ({
        optionLabel: o.optionLabel,
        optionText: o.optionText,
      })),
    );
    setEditOfficialKey(q.answerKeyVerified && q.officialCorrectLabel ? q.officialCorrectLabel : "");
  };

  const handleSaveEditQuestion = async () => {
    if (!auth?.accessToken || !activeDoc || !editingQuestion) return;
    try {
      setSavingEdit(true);
      const cleanedKey = editOfficialKey.trim().toUpperCase();
      const res = await updateImportedDocumentQuestion(
        auth.accessToken,
        activeDoc.id,
        editingQuestion.id,
        {
          partNo: editPartNo,
          questionText: editQuestionText.trim(),
          options: editOptions,
          officialCorrectLabel: cleanedKey,
          answerKeyVerified: /^[A-D]$/.test(cleanedKey),
        },
      );
      if (res.data) {
        setActiveDoc(res.data);
        setEditingQuestion(null);
      }
    } catch (err) {
      Alert.alert("Lỗi", err instanceof Error ? err.message : "Không thể lưu chỉnh sửa.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAnalyzeWithAi = async () => {
    if (!auth?.accessToken || !activeDoc) return;
    try {
      setAnalyzingAi(true);
      const res = await analyzeDocumentAnswersWithAi(auth.accessToken, activeDoc.id);
      if (res.data) {
        setActiveDoc(res.data);
        Alert.alert(
          "Phân tích AI hoàn tất",
          "Các đáp án gợi ý bởi AI đã được gắn nhãn 'Chưa xác minh' tách biệt hoàn toàn với đáp án gốc của tài liệu.",
        );
      }
    } catch (err) {
      Alert.alert("Lỗi AI", err instanceof Error ? err.message : "Không thể phân tích đáp án.");
    } finally {
      setAnalyzingAi(false);
    }
  };

  const handleConfirmExam = async () => {
    if (!auth?.accessToken || !activeDoc) return;
    if (selectedPartsForExam.length === 0) {
      Alert.alert("Chưa chọn Part", "Vui lòng chọn ít nhất Part 5, Part 6 hoặc Part 7.");
      return;
    }
    try {
      setConfirming(true);
      const res = await confirmDocumentExam(auth.accessToken, activeDoc.id, {
        testTitle: examTitleInput.trim() || undefined,
        selectedParts: selectedPartsForExam,
      });
      if (res.data?.id) {
        await refreshLibrary();
        Alert.alert("Đã tạo đề thi TOEIC!", "Bắt đầu làm bài thi tương tác ngay bây giờ?", [
          { text: "Để sau", style: "cancel" },
          {
            text: "Làm bài ngay",
            onPress: () => pushRoute(`/user/exam?testId=${res.data.id}`),
          },
        ]);
      }
    } catch (err) {
      Alert.alert("Không thể tạo đề", err instanceof Error ? err.message : "Vui lòng kiểm tra câu hỏi đã chọn.");
    } finally {
      setConfirming(false);
    }
  };

  const toggleExamPart = (part: number) => {
    setSelectedPartsForExam((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part].sort(),
    );
  };

  const passageById = useMemo(() => {
    const map: Record<number, { content: string; code: string; kind?: string | null; type: string; page: number }> = {};
    for (const p of activeDoc?.passages || []) {
      map[p.id] = {
        content: p.content,
        code: p.passageCode,
        kind: p.documentKind,
        type: p.passageType,
        page: p.pageNumber,
      };
    }
    return map;
  }, [activeDoc?.passages]);

  const filteredQuestions = useMemo(() => {
    const qs = activeDoc?.questions || [];
    if (partFilter === "ALL") return qs;
    if (partFilter === "ISSUES") return qs.filter((q) => q.validationStatus !== "VALID");
    return qs.filter((q) => q.partNo === partFilter);
  }, [activeDoc?.questions, partFilter]);

  return (
    <UserScreen>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/test")}
        subtitle="PDF · DOCX · DOC · TXT · OCR (Part 5–7)"
        title="Document-to-Test AI"
      />

      {viewMode === "hub" ? (
        <View style={styles.containerCol}>
          {/* Upload Card */}
          <SurfaceCard style={styles.uploadHeroCard}>
            <View style={styles.heroIconRow}>
              <View style={styles.heroBadge}>
                <Ionicons color="#FFFFFF" name="document-text" size={24} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.heroTitle}>Nhập đề thi TOEIC từ Tài liệu</Text>
                <Text style={styles.heroSubtitle}>
                  Hỗ trợ PDF, Word (.docx/.doc), TXT & Ảnh scan (OCR). Chỉ trích xuất Part 5, 6, 7 nguyên bản — không tự bịa câu hỏi hay đáp án.
                </Text>
              </View>
            </View>

            <Pressable
              disabled={uploading}
              onPress={() => void handlePickDocument()}
              style={[styles.primaryCtaBtn, uploading && { opacity: 0.7 }]}
            >
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons color="#FFFFFF" name="cloud-upload-outline" size={20} />
              )}
              <Text style={styles.primaryCtaText}>
                {uploading ? "Đang trích xuất & kiểm tra tính trung thực..." : "Chọn tệp PDF / DOCX / DOC / TXT / Ảnh"}
              </Text>
            </Pressable>
          </SurfaceCard>

          {/* Generated Exams Quick Practice */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Đề thi đã tạo ({generatedExams.length})</Text>
          </View>
          {loadingList ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : generatedExams.length === 0 ? (
            <SurfaceCard padding="sm">
              <Text style={styles.emptyHint}>Chưa có đề nào được tạo từ tài liệu. Hãy tải tài liệu đầu tiên!</Text>
            </SurfaceCard>
          ) : (
            <View style={{ gap: 10 }}>
              {generatedExams.map((exam) => (
                <SurfaceCard key={exam.id} padding="sm" style={styles.itemCard}>
                  <View style={styles.itemRowBetween}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text numberOfLines={2} style={styles.itemTitle}>{exam.title}</Text>
                      <Text style={styles.itemMeta}>
                        {exam.questionCount ?? 0} câu • {exam.totalDurationMinutes} phút • {exam.testType}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => pushRoute(`/user/exam?testId=${exam.id}`)}
                      style={styles.launchExamBtn}
                    >
                      <Ionicons color="#FFFFFF" name="play" size={14} />
                      <Text style={styles.launchExamBtnText}>Thi ngay</Text>
                    </Pressable>
                  </View>

                  <View style={styles.quickPartRow}>
                    {PART_CHOICES.map((p) => (
                      <Pressable
                        key={p}
                        onPress={() => pushRoute(`/user/exam?testId=${exam.id}&partFilter=${p}`)}
                        style={styles.partPracticeChip}
                      >
                        <Text style={styles.partPracticeChipText}>Luyện Part {p}</Text>
                      </Pressable>
                    ))}
                  </View>
                </SurfaceCard>
              ))}
            </View>
          )}

          {/* Imported Document History */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Tài liệu gốc đã tải lên ({documents.length})</Text>
          </View>
          {documents.map((doc) => (
            <Pressable key={doc.id} onPress={() => void handleOpenSavedDocument(doc.id)}>
              <SurfaceCard padding="sm" style={styles.itemCard}>
                <View style={styles.itemRowBetween}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text numberOfLines={1} style={styles.itemTitle}>{doc.fileName}</Text>
                    <Text style={styles.itemMeta}>
                      {doc.fileFormat} • {doc.pageCount} trang{doc.ocrUsed ? ` • OCR (${doc.ocrEngine})` : ""} •{" "}
                      {doc.validationSummary?.totalQuestions ?? doc.questions?.length ?? 0} câu
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, doc.status === "CONFIRMED" && styles.statusBadgeOk]}>
                    <Text style={styles.statusBadgeText}>{doc.status}</Text>
                  </View>
                </View>
              </SurfaceCard>
            </Pressable>
          ))}
        </View>
      ) : activeDoc ? (
        /* ============================================================================
         * REVIEW & VALIDATION STUDIO VIEW
         * ============================================================================ */
        <View style={styles.containerCol}>
          <Pressable onPress={() => setViewMode("hub")} style={styles.backToListBtn}>
            <Ionicons color={colors.primary} name="arrow-back" size={16} />
            <Text style={styles.backToListText}>Quay lại danh sách tài liệu</Text>
          </Pressable>

          {/* Source Metadata & Validation Summary */}
          <SurfaceCard style={styles.validationCard}>
            <Text style={styles.itemTitle}>{activeDoc.fileName}</Text>
            <Text style={styles.itemMeta}>
              Định dạng: {activeDoc.fileFormat} • {activeDoc.pageCount} trang
              {activeDoc.ocrUsed ? ` • OCR: ${activeDoc.ocrEngine}` : ""}
            </Text>

            <View style={styles.metricsWrap}>
              <View style={[styles.metricPill, { borderColor: "#10B981" }]}>
                <Text style={[styles.metricPillText, { color: "#10B981" }]}>
                  Hợp lệ: {activeDoc.validationSummary?.validCount ?? 0}
                </Text>
              </View>
              <View style={[styles.metricPill, { borderColor: "#F59E0B" }]}>
                <Text style={[styles.metricPillText, { color: "#F59E0B" }]}>
                  Cảnh báo: {activeDoc.validationSummary?.warningCount ?? 0}
                </Text>
              </View>
              <View style={[styles.metricPill, { borderColor: "#EF4444" }]}>
                <Text style={[styles.metricPillText, { color: "#EF4444" }]}>
                  Lỗi: {activeDoc.validationSummary?.invalidCount ?? 0}
                </Text>
              </View>
              <View style={[styles.metricPill, { borderColor: "#6366F1" }]}>
                <Text style={[styles.metricPillText, { color: "#818CF8" }]}>
                  Chưa có Đáp án gốc: {activeDoc.validationSummary?.unverifiedAnswerCount ?? 0}
                </Text>
              </View>
            </View>

            {(activeDoc.validationSummary?.issues || []).map((issue, idx) => (
              <Text key={idx} style={styles.issueLineText}>• {issue}</Text>
            ))}

            <Pressable
              disabled={analyzingAi}
              onPress={() => void handleAnalyzeWithAi()}
              style={styles.aiAnalyzeBtn}
            >
              {analyzingAi ? (
                <ActivityIndicator color="#38BDF8" size="small" />
              ) : (
                <Ionicons color="#38BDF8" name="sparkles-outline" size={17} />
              )}
              <Text style={styles.aiAnalyzeBtnText}>
                Phân tích đáp án gợi ý AI (Tách biệt, Chưa xác minh)
              </Text>
            </Pressable>
          </SurfaceCard>

          {/* Confirm & Create Exam Configuration Card */}
          <SurfaceCard style={styles.confirmCard}>
            <Text style={styles.sectionTitle}>Xác nhận & Tạo đề thi tương tác</Text>
            <TextInput
              onChangeText={setExamTitleInput}
              placeholder="Tên đề thi..."
              placeholderTextColor={colors.textMuted}
              style={styles.textInputBox}
              value={examTitleInput}
            />
            <View style={styles.quickPartRow}>
              {PART_CHOICES.map((p) => {
                const selected = selectedPartsForExam.includes(p);
                return (
                  <Pressable
                    key={p}
                    onPress={() => toggleExamPart(p)}
                    style={[styles.partTogglePill, selected && styles.partTogglePillActive]}
                  >
                    <Ionicons
                      color={selected ? "#FFFFFF" : colors.textMuted}
                      name={selected ? "checkbox" : "square-outline"}
                      size={15}
                    />
                    <Text style={[styles.partToggleText, selected && { color: "#FFFFFF" }]}>
                      Part {p} ({(activeDoc.questions || []).filter((q) => q.partNo === p && q.included).length})
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              disabled={confirming}
              onPress={() => void handleConfirmExam()}
              style={[styles.primaryCtaBtn, confirming && { opacity: 0.7 }]}
            >
              {confirming ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons color="#FFFFFF" name="checkmark-done-circle-outline" size={20} />
              )}
              <Text style={styles.primaryCtaText}>Lưu đề thi & Bắt đầu luyện tập</Text>
            </Pressable>
          </SurfaceCard>

          {/* Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(
              [
                { key: "ALL", label: `Tất cả (${activeDoc.questions.length})` },
                { key: 5, label: "Part 5" },
                { key: 6, label: "Part 6" },
                { key: 7, label: "Part 7" },
                { key: "ISSUES", label: "Cần rà soát" },
              ] as { key: PartFilter; label: string }[]
            ).map((f) => {
              const active = partFilter === f.key;
              return (
                <Pressable
                  key={String(f.key)}
                  onPress={() => setPartFilter(f.key)}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, active && { color: "#FFFFFF" }]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Question Cards with Source Fidelity Metadata & Linked Passage */}
          {filteredQuestions.map((q) => {
            const linkedPassage = q.passageId ? passageById[q.passageId] : null;
            return (
              <SurfaceCard key={q.id} style={[styles.questionReviewCard, !q.included && { opacity: 0.55 }]}>
                <View style={styles.itemRowBetween}>
                  <View style={styles.tagCluster}>
                    <View style={styles.partTag}>
                      <Text style={styles.partTagText}>
                        Part {q.partNo} • #{q.originalQuestionNumber ?? q.sortOrder}
                      </Text>
                    </View>
                    <Text style={styles.pageMetaText}>
                      Trang {q.pageNumber} • {Math.round((q.extractionConfidence ?? 0.9) * 100)}%
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.validationTag,
                      q.validationStatus === "VALID"
                        ? styles.valValid
                        : q.validationStatus === "WARNING"
                          ? styles.valWarn
                          : styles.valErr,
                    ]}
                  >
                    <Text style={styles.validationTagText}>{q.validationStatus}</Text>
                  </View>
                </View>

                {linkedPassage ? (
                  <View style={styles.passagePreviewBox}>
                    <Text style={styles.passageHeaderTag}>
                      📄 {linkedPassage.type} ({linkedPassage.kind || "PASSAGE"} • {linkedPassage.code} • Trang {linkedPassage.page})
                    </Text>
                    <Text numberOfLines={6} style={styles.passageBodyText}>{linkedPassage.content}</Text>
                  </View>
                ) : null}

                <Text style={styles.questionTextPreview}>{q.questionText}</Text>

                <View style={{ gap: 4 }}>
                  {(q.options || []).map((opt) => {
                    const isOfficial = q.answerKeyVerified && q.officialCorrectLabel === opt.optionLabel;
                    const isAi = !isOfficial && q.aiSuggestedLabel === opt.optionLabel;
                    return (
                      <View
                        key={opt.optionLabel}
                        style={[
                          styles.optionPreviewRow,
                          isOfficial && styles.optionOfficialRow,
                          isAi && styles.optionAiRow,
                        ]}
                      >
                        <Text style={styles.optionPreviewLabel}>({opt.optionLabel})</Text>
                        <Text style={styles.optionPreviewText}>{opt.optionText}</Text>
                        {isOfficial ? (
                          <Text style={styles.officialBadgeText}>Đáp án gốc ✓</Text>
                        ) : isAi ? (
                          <Text style={styles.aiBadgeText}>Gợi ý AI (Chưa xác minh)</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                {q.aiSuggestedExplanation ? (
                  <Text style={styles.aiExplainNote}>🤖 {q.aiSuggestedExplanation}</Text>
                ) : null}

                {(q.validationIssues || []).length > 0 ? (
                  <View style={styles.qIssueBox}>
                    {q.validationIssues.map((iss, i) => (
                      <Text key={i} style={styles.qIssueText}>⚠ {iss}</Text>
                    ))}
                  </View>
                ) : null}

                {/* Inline Reclassify + Edit + Include + Remove Controls */}
                <View style={styles.questionActionsRow}>
                  {PART_CHOICES.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => void handleReclassifyPart(q, p)}
                      style={[styles.miniBtn, q.partNo === p && styles.miniBtnActive]}
                    >
                      <Text style={[styles.miniBtnText, q.partNo === p && { color: "#FFFFFF" }]}>P{p}</Text>
                    </Pressable>
                  ))}

                  <Pressable onPress={() => openEditModal(q)} style={styles.miniBtn}>
                    <Text style={styles.miniBtnText}>✏️ Sửa</Text>
                  </Pressable>
                  <Pressable onPress={() => void handleToggleInclude(q)} style={styles.miniBtn}>
                    <Text style={styles.miniBtnText}>{q.included ? "✓ Dùng" : "Đã bỏ"}</Text>
                  </Pressable>
                  <Pressable onPress={() => void handleDeleteQuestion(q)} style={styles.miniBtn}>
                    <Text style={[styles.miniBtnText, { color: "#EF4444" }]}>Xóa</Text>
                  </Pressable>
                </View>
              </SurfaceCard>
            );
          })}
        </View>
      ) : null}

      {/* Inline Question Edit Modal */}
      <Modal
        animationType="slide"
        onRequestClose={() => setEditingQuestion(null)}
        transparent
        visible={Boolean(editingQuestion)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Chỉnh sửa câu #{editingQuestion?.originalQuestionNumber ?? ""}
            </Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
              <Text style={styles.fieldLabel}>Phân loại Part TOEIC</Text>
              <View style={styles.quickPartRow}>
                {PART_CHOICES.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setEditPartNo(p)}
                    style={[styles.partTogglePill, editPartNo === p && styles.partTogglePillActive]}
                  >
                    <Text style={[styles.partToggleText, editPartNo === p && { color: "#FFFFFF" }]}>
                      Part {p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Nội dung câu hỏi (Nguyên văn tiếng Anh)</Text>
              <TextInput
                multiline
                onChangeText={setEditQuestionText}
                style={[styles.textInputBox, { minHeight: 72, textAlignVertical: "top" }]}
                value={editQuestionText}
              />

              {editOptions.map((opt, idx) => (
                <View key={opt.optionLabel} style={{ gap: 4 }}>
                  <Text style={styles.fieldLabel}>Lựa chọn ({opt.optionLabel})</Text>
                  <TextInput
                    onChangeText={(txt) =>
                      setEditOptions((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, optionText: txt } : item)),
                      )
                    }
                    style={styles.textInputBox}
                    value={opt.optionText}
                  />
                </View>
              ))}

              <Text style={styles.fieldLabel}>
                Đáp án chính thức từ tài liệu (A, B, C, D hoặc để trống nếu chưa xác minh)
              </Text>
              <TextInput
                autoCapitalize="characters"
                maxLength={1}
                onChangeText={setEditOfficialKey}
                placeholder="A / B / C / D hoặc trống"
                style={styles.textInputBox}
                value={editOfficialKey}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable onPress={() => setEditingQuestion(null)} style={styles.cancelModalBtn}>
                <Text style={styles.miniBtnText}>Hủy</Text>
              </Pressable>
              <Pressable
                disabled={savingEdit}
                onPress={() => void handleSaveEditQuestion()}
                style={styles.saveModalBtn}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>
                  {savingEdit ? "Đang lưu..." : "Lưu chỉnh sửa"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    containerCol: { gap: 14, paddingBottom: 32 },
    uploadHeroCard: { gap: 14 },
    heroIconRow: { alignItems: "center", flexDirection: "row", gap: 12 },
    heroBadge: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 16,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    heroTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
    heroSubtitle: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
    primaryCtaBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    primaryCtaText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
    sectionHeaderRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    sectionTitle: { color: colors.text, fontSize: 15.5, fontWeight: "900" },
    emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
    itemCard: { gap: 10 },
    itemRowBetween: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
    itemTitle: { color: colors.text, fontSize: 14.5, fontWeight: "800" },
    itemMeta: { color: colors.textMuted, fontSize: 12 },
    launchExamBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    launchExamBtnText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
    quickPartRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    partPracticeChip: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    partPracticeChipText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
    statusBadge: {
      backgroundColor: "rgba(245,158,11,0.16)",
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusBadgeOk: { backgroundColor: "rgba(16,185,129,0.16)" },
    statusBadgeText: { color: colors.text, fontSize: 11, fontWeight: "800" },
    backToListBtn: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 6 },
    backToListText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
    validationCard: { gap: 8 },
    metricsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    metricPill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
    metricPillText: { fontSize: 11.5, fontWeight: "800" },
    issueLineText: { color: "#F59E0B", fontSize: 12, lineHeight: 17 },
    aiAnalyzeBtn: {
      alignItems: "center",
      backgroundColor: "rgba(56,189,248,0.14)",
      borderColor: "rgba(56,189,248,0.4)",
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 6,
      paddingVertical: 11,
    },
    aiAnalyzeBtnText: { color: "#0284C7", fontSize: 13, fontWeight: "800" },
    confirmCard: { gap: 10 },
    textInputBox: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.text,
      fontSize: 13.5,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    partTogglePill: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    partTogglePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    partToggleText: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    filterRow: { gap: 8, paddingVertical: 2 },
    filterPill: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterPillText: { color: colors.text, fontSize: 12.5, fontWeight: "800" },
    questionReviewCard: { gap: 10 },
    tagCluster: { alignItems: "center", flexDirection: "row", gap: 8 },
    partTag: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    partTagText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "900" },
    pageMetaText: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700" },
    validationTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    valValid: { backgroundColor: "rgba(16,185,129,0.2)" },
    valWarn: { backgroundColor: "rgba(245,158,11,0.2)" },
    valErr: { backgroundColor: "rgba(239,68,68,0.2)" },
    validationTagText: { color: colors.text, fontSize: 11, fontWeight: "900" },
    passagePreviewBox: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      gap: 4,
      padding: 10,
    },
    passageHeaderTag: { color: colors.primary, fontSize: 11.5, fontWeight: "900" },
    passageBodyText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
    questionTextPreview: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    optionPreviewRow: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    optionOfficialRow: { backgroundColor: "rgba(16,185,129,0.14)", borderColor: "#10B981" },
    optionAiRow: { backgroundColor: "rgba(56,189,248,0.12)", borderColor: "#38BDF8" },
    optionPreviewLabel: { color: colors.primary, fontSize: 13, fontWeight: "900" },
    optionPreviewText: { color: colors.text, flex: 1, fontSize: 13 },
    officialBadgeText: { color: "#10B981", fontSize: 11, fontWeight: "900" },
    aiBadgeText: { color: "#0284C7", fontSize: 10.5, fontWeight: "800" },
    aiExplainNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
    qIssueBox: { gap: 2 },
    qIssueText: { color: "#F59E0B", fontSize: 11.5 },
    questionActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
    miniBtn: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    miniBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    miniBtnText: { color: colors.text, fontSize: 11.5, fontWeight: "800" },
    modalBackdrop: {
      backgroundColor: "rgba(0,0,0,0.6)",
      flex: 1,
      justifyContent: "center",
      padding: 16,
    },
    modalCard: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 22,
      borderWidth: 1,
      gap: 12,
      padding: 16,
    },
    modalTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
    fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
    modalFooter: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    cancelModalBtn: {
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    saveModalBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
  });
