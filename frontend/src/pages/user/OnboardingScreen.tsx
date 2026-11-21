import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidCard } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  assignRecommendedPath,
  evaluatePlacementQuickTest,
  getMyProfile,
  getPlacementQuickTest,
  getUserLearningPathCatalog,
} from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import {
  PlacementEvaluationData,
  PlacementQuickQuestion,
  UserLearningPathCatalogItem,
} from "@/src/types/user-api";
import { pushRoute, replaceRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

function resolvePathAccent(score: number) {
  if (score < 500) return "#CFE0FF";
  if (score < 700) return "#D8F6D9";
  if (score < 850) return "#E2E5FF";
  return "#FEF3C7";
}

export default function OnboardingScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const { isNarrow, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [catalog, setCatalog] = useState<UserLearningPathCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<"catalog" | "quiz" | "result">("catalog");
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<PlacementQuickQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [evalResult, setEvalResult] = useState<PlacementEvaluationData | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!auth.accessToken) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await getUserLearningPathCatalog(auth.accessToken);
      const items = res.data ?? [];
      setCatalog(items);
      setSelectedPathId((prev) => {
        if (prev && items.some((p) => p.id === prev)) return prev;
        const enrolled = items.find((p) => p.enrolled);
        const recommended = items.find((p) => p.recommended);
        return enrolled?.id ?? recommended?.id ?? items[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải danh sách lộ trình.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useFocusEffect(
    useCallback(() => {
      void loadCatalog();
    }, [loadCatalog]),
  );

  const selectedPath = useMemo(
    () => catalog.find((item) => item.id === selectedPathId) ?? catalog[0] ?? null,
    [catalog, selectedPathId],
  );

  const handleAssignPath = async (overridePathId?: number | null, overrideTargetScore?: number) => {
    if (!auth.accessToken) {
      replaceRoute("/");
      return;
    }
    const chosenPath =
      typeof overridePathId === "number"
        ? catalog.find((item) => item.id === overridePathId) ?? selectedPath
        : selectedPath;
    if (!chosenPath && typeof overrideTargetScore !== "number") {
      Alert.alert("Lộ trình", "Hiện chưa có lộ trình khả dụng. Vui lòng thử lại sau.");
      return;
    }

    try {
      setSubmitting(true);
      await assignRecommendedPath(auth.accessToken, {
        learningPathId: chosenPath?.id,
        targetScore: chosenPath?.targetScore ?? overrideTargetScore,
      });
      try {
        const profileRes = await getMyProfile(auth.accessToken);
        if (profileRes.data) {
          updateUserProfile(profileRes.data);
        }
      } catch {
        // Backend already synced targetScore; best-effort client refresh.
      }
      replaceRoute("/user/practice");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể kích hoạt lộ trình.";
      Alert.alert("Lộ trình TOEIC", message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartQuickTest = async () => {
    if (!auth.accessToken) {
      replaceRoute("/");
      return;
    }
    try {
      setQuizLoading(true);
      const res = await getPlacementQuickTest(auth.accessToken);
      const questions = res.data?.questions ?? [];
      if (questions.length === 0) {
        Alert.alert("Bài test nhanh", "Chưa có câu hỏi kiểm tra trình độ. Bạn có thể tự chọn lộ trình bên dưới.");
        return;
      }
      setQuizQuestions(questions);
      setQuizAnswers({});
      setQuizIndex(0);
      setEvalResult(null);
      setStep("quiz");
    } catch (error) {
      Alert.alert(
        "Bài test nhanh",
        error instanceof Error ? error.message : "Không thể tải bài kiểm tra trình độ.",
      );
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSkipQuickTest = () => {
    setStep("catalog");
  };

  const handleSelectQuizOption = (questionKey: string, label: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionKey]: label,
    }));
  };

  const handleSubmitQuickTest = async () => {
    if (!auth.accessToken) {
      replaceRoute("/");
      return;
    }
    try {
      setQuizSubmitting(true);
      const answers = quizQuestions.map((question) => ({
        questionKey: question.questionKey,
        selectedLabel: quizAnswers[question.questionKey] ?? "",
      }));
      const res = await evaluatePlacementQuickTest(auth.accessToken, { answers });
      const evaluation = res.data ?? null;
      if (!evaluation) {
        Alert.alert("Kết quả", "Không nhận được kết quả đánh giá. Vui lòng thử lại.");
        return;
      }
      setEvalResult(evaluation);
      if (typeof evaluation.recommendedPathId === "number") {
        setSelectedPathId(evaluation.recommendedPathId);
      }
      setStep("result");
    } catch (error) {
      Alert.alert(
        "Đánh giá trình độ",
        error instanceof Error ? error.message : "Không thể chấm điểm bài test nhanh.",
      );
    } finally {
      setQuizSubmitting(false);
    }
  };

  const currentQuestion = quizQuestions[quizIndex] ?? null;
  const answeredCount = quizQuestions.filter((q) => Boolean(quizAnswers[q.questionKey])).length;

  return (
    <UserScreen contentStyle={styles.outerWrap} hasTabDock={false} scrollable={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/home")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0]?.toUpperCase() || "A"} />}
        subtitle="Thiết lập lộ trình"
        title="Mục tiêu TOEIC"
      />

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        style={styles.scrollArea}
      >
        {step === "catalog" ? (
          <>
            <LiquidCard hero style={styles.heroBanner}>
              <Text style={styles.heroEyebrow}>CÁ NHÂN HÓA LỘ TRÌNH</Text>
              <Text style={[styles.heroTitle, { fontSize: rf(isNarrow ? 19 : 21) }]}>
                Chọn lộ trình khớp mục tiêu điểm TOEIC của bạn
              </Text>
              <Text style={styles.heroSubtitle}>
                Làm bài test nhanh để hệ thống đo trình độ hiện tại và gợi ý lộ trình phù hợp, hoặc bỏ qua để tự chọn lộ trình ngay.
                {auth.user?.targetScore ? ` Mục tiêu hiện tại: ${auth.user.targetScore}+.` : ""}
              </Text>
              <Pressable hitSlop={8} onPress={() => pushRoute("/user/home")} style={styles.skipLink}>
                <Text style={styles.skipLinkText}>Để sau, quay lại Trang chủ →</Text>
              </Pressable>
            </LiquidCard>

            <SurfaceCard style={styles.placementIntroCard}>
              <View style={styles.placementIntroHeader}>
                <View style={styles.placementBadge}>
                  <Ionicons color={colors.primary} name="sparkles" size={14} />
                  <Text style={styles.placementBadgeText}>ĐÁNH GIÁ TRÌNH ĐỘ NHANH</Text>
                </View>
                <Text style={styles.placementMeta}>8 câu · ~3 phút</Text>
              </View>
              <Text style={[styles.goalTitle, { fontSize: rf(15.5) }]}>
                Kiểm tra nhanh Ngữ pháp · Từ vựng · Đọc hiểu
              </Text>
              <Text style={styles.goalDesc}>
                Phân tích điểm mạnh, Part còn yếu và đề xuất lộ trình + mục tiêu điểm phù hợp nhất với bạn.
              </Text>
              <View style={styles.placementActionRow}>
                <LiquidButton
                  compact
                  disabled={quizLoading}
                  label={quizLoading ? "Đang tải câu hỏi..." : "Làm bài test cá nhân hóa"}
                  loading={quizLoading}
                  onPress={() => void handleStartQuickTest()}
                  style={{ flex: 1 }}
                  variant="primary"
                />
                <Pressable
                  hitSlop={6}
                  onPress={handleSkipQuickTest}
                  style={styles.skipInlineBtn}
                >
                  <Text style={styles.skipInlineText}>Bỏ qua, tự chọn</Text>
                </Pressable>
              </View>
            </SurfaceCard>
          </>
        ) : step === "quiz" && currentQuestion ? (
          <View style={styles.quizWrap}>
            <SurfaceCard style={styles.quizTopBar}>
              <View style={styles.quizProgressHeader}>
                <Text style={styles.quizCounter}>
                  Câu {quizIndex + 1}/{quizQuestions.length} · Đã chọn {answeredCount}/{quizQuestions.length}
                </Text>
                <Pressable hitSlop={8} onPress={handleSkipQuickTest} style={styles.skipQuizPill}>
                  <Text style={styles.skipQuizPillText}>Bỏ qua test</Text>
                </Pressable>
              </View>
              <View style={styles.quizProgressTrack}>
                <View
                  style={[
                    styles.quizProgressFill,
                    {
                      width: `${Math.round(((quizIndex + 1) / Math.max(1, quizQuestions.length)) * 100)}%`,
                    },
                  ]}
                />
              </View>
            </SurfaceCard>

            <SurfaceCard style={styles.quizQuestionCard}>
              <View style={styles.quizMetaRow}>
                <View style={styles.partPill}>
                  <Text style={styles.partPillText}>Part {currentQuestion.partNo}</Text>
                </View>
                <Text style={styles.skillAreaText}>{currentQuestion.skillArea}</Text>
              </View>

              {currentQuestion.passageText ? (
                <View style={styles.passageBox}>
                  <Text style={styles.passageText}>{currentQuestion.passageText}</Text>
                </View>
              ) : null}

              <Text style={[styles.quizQuestionText, { fontSize: rf(15.5) }]}>
                {currentQuestion.questionText}
              </Text>

              <View style={styles.optionList}>
                {currentQuestion.options.map((opt) => {
                  const chosen = quizAnswers[currentQuestion.questionKey] === opt.label;
                  return (
                    <Pressable
                      key={opt.label}
                      onPress={() => handleSelectQuizOption(currentQuestion.questionKey, opt.label)}
                      style={[
                        styles.optionRow,
                        chosen ? styles.optionRowSelected : null,
                      ]}
                    >
                      <View style={[styles.optionLabelCircle, chosen ? styles.optionLabelCircleSelected : null]}>
                        <Text style={[styles.optionLabelText, chosen ? styles.optionLabelTextSelected : null]}>
                          {opt.label}
                        </Text>
                      </View>
                      <Text style={[styles.optionBodyText, chosen ? styles.optionBodyTextSelected : null]}>
                        {opt.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.quizNavRow}>
                <LiquidButton
                  compact
                  disabled={quizIndex === 0 || quizSubmitting}
                  label="Câu trước"
                  onPress={() => setQuizIndex((prev) => Math.max(0, prev - 1))}
                  variant="glass"
                />
                {quizIndex < quizQuestions.length - 1 ? (
                  <LiquidButton
                    compact
                    label="Câu tiếp →"
                    onPress={() => setQuizIndex((prev) => Math.min(quizQuestions.length - 1, prev + 1))}
                    style={{ flex: 1 }}
                    variant="primary"
                  />
                ) : (
                  <LiquidButton
                    compact
                    disabled={quizSubmitting}
                    label={quizSubmitting ? "Đang chấm điểm..." : "Hoàn thành & Xem lộ trình"}
                    loading={quizSubmitting}
                    onPress={() => void handleSubmitQuickTest()}
                    style={{ flex: 1 }}
                    variant="primary"
                  />
                )}
              </View>
            </SurfaceCard>
          </View>
        ) : step === "result" && evalResult ? (
          <View style={styles.quizWrap}>
            <LiquidCard hero style={styles.heroBanner}>
              <Text style={styles.heroEyebrow}>KẾT QUẢ ĐÁNH GIÁ NHANH</Text>
              <Text style={[styles.heroTitle, { fontSize: rf(20) }]}>
                Ước lượng ~{evalResult.estimatedScore} điểm · Trình độ {evalResult.levelLabel}
              </Text>
              <Text style={styles.heroSubtitle}>
                Đúng {evalResult.correctCount}/{evalResult.totalQuestions} câu ({Math.round(evalResult.accuracyPercent)}%) · Đề xuất mục tiêu {evalResult.recommendedTargetScore}+ TOEIC
              </Text>
            </LiquidCard>

            <SurfaceCard style={styles.quizQuestionCard}>
              <Text style={[styles.goalTitle, { fontSize: rf(15.5) }]}>Phân tích kỹ năng theo Part</Text>
              <View style={styles.breakdownRow}>
                {evalResult.partBreakdown.map((item) => (
                  <View key={item.partNo} style={styles.breakdownChip}>
                    <Text style={styles.breakdownChipTitle}>Part {item.partNo}</Text>
                    <Text style={styles.breakdownChipSub}>
                      {item.correct}/{item.total} ({Math.round(item.accuracyPercent)}%)
                    </Text>
                  </View>
                ))}
              </View>

              {evalResult.strengths.length > 0 ? (
                <Text style={styles.resultBullet}>
                  Điểm mạnh: {evalResult.strengths.join(" · ")}
                </Text>
              ) : null}
              {evalResult.weakAreas.length > 0 ? (
                <Text style={styles.resultWeakBullet}>
                  Cần ưu tiên cải thiện: {evalResult.weakAreas.join(" · ")}
                </Text>
              ) : null}

              <View style={styles.recommendedBox}>
                <Text style={styles.recommendedLabel}>Lộ trình đề xuất cho bạn</Text>
                <Text style={[styles.goalTitle, { fontSize: rf(16) }]}>
                  {evalResult.recommendedPathTitle ?? `Mục tiêu ${evalResult.recommendedTargetScore}+ TOEIC`}
                </Text>
              </View>

              <LiquidButton
                disabled={submitting}
                label={submitting ? "Đang kích hoạt..." : "Kích hoạt lộ trình đề xuất"}
                loading={submitting}
                onPress={() =>
                  void handleAssignPath(evalResult.recommendedPathId, evalResult.recommendedTargetScore)
                }
                variant="primary"
              />
              <Pressable hitSlop={8} onPress={() => setStep("catalog")} style={styles.reselectBtn}>
                <Text style={styles.reselectBtnText}>Chọn lại lộ trình khác</Text>
              </Pressable>
            </SurfaceCard>
          </View>
        ) : null}

        {step === "catalog" && (loading ? (
          <SurfaceCard style={styles.emptyCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.goalDesc}>Đang tải các lộ trình theo mục tiêu điểm...</Text>
          </SurfaceCard>
        ) : errorMessage ? (
          <SurfaceCard style={styles.emptyCard}>
            <Text style={styles.goalDesc}>{errorMessage}</Text>
            <LiquidButton compact label="Thử lại" onPress={() => void loadCatalog()} variant="glass" />
          </SurfaceCard>
        ) : catalog.length === 0 ? (
          <SurfaceCard style={styles.emptyCard}>
            <Ionicons color={colors.primary} name="map-outline" size={30} />
            <Text style={[styles.goalTitle, { textAlign: "center" }]}>
              Chưa có lộ trình đang mở
            </Text>
            <Text style={[styles.goalDesc, { textAlign: "center" }]}>
              Quản trị viên chưa kích hoạt lộ trình học nào. Vui lòng quay lại sau.
            </Text>
          </SurfaceCard>
        ) : (
          <View style={styles.goalList}>
            {catalog.map((path) => {
              const selected = selectedPath?.id === path.id;

              return (
                <Pressable
                  key={path.id}
                  onPress={() => setSelectedPathId(path.id)}
                  style={({ pressed }) => [pressed ? { opacity: 0.92 } : null]}
                >
                  <SurfaceCard
                    style={[
                      styles.goalCard,
                      selected ? styles.goalCardSelected : null,
                    ]}
                  >
                    <View style={styles.goalHeaderRow}>
                      <View
                        style={[
                          styles.goalIcon,
                          { backgroundColor: resolvePathAccent(path.targetScore) },
                        ]}
                      >
                        <Text style={styles.scoreBadgeLabel}>{path.targetScore}+</Text>
                      </View>

                      <View style={styles.goalHeaderCopy}>
                        <View style={styles.goalTitleRow}>
                          <Text numberOfLines={1} style={[styles.goalTitle, { fontSize: rf(16.5) }]}>
                            {path.title}
                          </Text>
                          {path.enrolled ? (
                            <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                              <Text style={styles.popularBadgeText}>Đang học</Text>
                            </View>
                          ) : path.recommended ? (
                            <View style={styles.popularBadge}>
                              <Text style={styles.popularBadgeText}>Đề xuất</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.goalLevel}>
                          {path.code} • Mục tiêu {path.targetScore}+ • {path.milestoneCount} chặng •{" "}
                          {path.moduleCount} bài học
                        </Text>
                      </View>

                      <Ionicons
                        color={selected ? colors.primary : colors.textMuted}
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                      />
                    </View>

                    {path.description ? (
                      <Text style={[styles.goalDesc, { fontSize: rf(13) }]}>{path.description}</Text>
                    ) : null}

                    {path.milestoneTitles && path.milestoneTitles.length > 0 ? (
                      <Text numberOfLines={2} style={styles.milestonePreview}>
                        Chặng học: {path.milestoneTitles.join(" → ")}
                      </Text>
                    ) : null}

                    {path.moduleCount === 0 ? (
                      <Text style={styles.pendingNote}>
                        Nội dung chi tiết đang được cập nhật thêm bài học.
                      </Text>
                    ) : (
                      <Text style={styles.resourceFoot}>
                        Gồm {path.flashcardCount} từ vựng • {path.videoLessonCount} video •{" "}
                        {path.practiceSetCount} bộ đề • ~{path.estimatedTotalMinutes} phút
                      </Text>
                    )}
                  </SurfaceCard>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {step === "catalog" ? (
        <SurfaceCard padding="sm" style={styles.bottomDock}>
          <View style={styles.dockInfo}>
            <Text style={styles.dockLabel}>Lộ trình đã chọn</Text>
            <Text numberOfLines={1} style={[styles.dockValue, { fontSize: rf(15.5) }]}>
              {selectedPath ? `${selectedPath.targetScore}+ • ${selectedPath.title}` : "Chưa chọn"}
            </Text>
          </View>
          <LiquidButton
            compact
            disabled={submitting || !selectedPath}
            label={submitting ? "Đang tạo..." : "Kích hoạt lộ trình"}
            loading={submitting}
            onPress={() => void handleAssignPath()}
            style={{ minWidth: isNarrow ? 142 : 166 }}
            variant="primary"
          />
        </SurfaceCard>
      ) : null}
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    outerWrap: {
      flex: 1,
      paddingBottom: 14,
    },
    scrollArea: {
      flex: 1,
    },
    scrollBody: {
      gap: 14,
      paddingBottom: 14,
    },
    heroBanner: {
      gap: 6,
    },
    heroEyebrow: {
      color: "rgba(255,255,255,0.88)",
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 1,
    },
    heroTitle: {
      color: colors.heroText,
      fontWeight: "900",
      lineHeight: 27,
    },
    heroSubtitle: {
      color: colors.heroTextMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    skipLink: {
      alignSelf: "flex-start",
      marginTop: 4,
    },
    skipLinkText: {
      color: colors.accentGradient[0],
      fontSize: 12.5,
      fontWeight: "800",
    },
    goalList: {
      gap: 10,
    },
    goalCard: {
      gap: 8,
    },
    goalCardSelected: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 1.75,
    },
    goalHeaderRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    goalIcon: {
      alignItems: "center",
      borderRadius: 14,
      height: 44,
      justifyContent: "center",
      minWidth: 50,
      paddingHorizontal: 6,
    },
    scoreBadgeLabel: {
      color: "#1E293B",
      fontSize: 13,
      fontWeight: "900",
    },
    emptyCard: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 24,
    },
    milestonePreview: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 17,
    },
    resourceFoot: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "700",
    },
    pendingNote: {
      color: "#D97706",
      fontSize: 11.5,
      fontWeight: "700",
    },
    goalHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    goalTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    goalTitle: {
      color: colors.text,
      flexShrink: 1,
      fontWeight: "900",
    },
    popularBadge: {
      backgroundColor: colors.success,
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    popularBadgeText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },
    goalLevel: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "700",
      marginTop: 2,
    },
    goalDesc: {
      color: colors.textMuted,
      lineHeight: 19,
    },
    bottomDock: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      marginTop: 10,
    },
    dockInfo: {
      flex: 1,
      minWidth: 0,
    },
    dockLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    dockValue: {
      color: colors.primary,
      fontWeight: "900",
      marginTop: 1,
    },
    placementIntroCard: {
      gap: 10,
    },
    placementIntroHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    placementBadge: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    placementBadgeText: {
      color: colors.primary,
      fontSize: 10.5,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    placementMeta: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    placementActionRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
    },
    skipInlineBtn: {
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    skipInlineText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "800",
    },
    quizWrap: {
      gap: 12,
    },
    quizTopBar: {
      gap: 10,
    },
    quizProgressHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    quizCounter: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    skipQuizPill: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    skipQuizPillText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "800",
    },
    quizProgressTrack: {
      backgroundColor: colors.primarySoft,
      borderRadius: 99,
      height: 7,
      overflow: "hidden",
    },
    quizProgressFill: {
      backgroundColor: colors.primary,
      borderRadius: 99,
      height: "100%",
    },
    quizQuestionCard: {
      gap: 12,
    },
    quizMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    partPill: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    partPillText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
    },
    skillAreaText: {
      color: colors.textMuted,
      flex: 1,
      fontSize: 12.5,
      fontWeight: "700",
    },
    passageBox: {
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      padding: 12,
    },
    passageText: {
      color: colors.text,
      fontSize: 13.5,
      lineHeight: 20,
    },
    quizQuestionText: {
      color: colors.text,
      fontWeight: "800",
      lineHeight: 23,
    },
    optionList: {
      gap: 8,
    },
    optionRow: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.glassBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    optionRowSelected: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    optionLabelCircle: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: 99,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    optionLabelCircleSelected: {
      backgroundColor: colors.primary,
    },
    optionLabelText: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: "900",
    },
    optionLabelTextSelected: {
      color: "#FFFFFF",
    },
    optionBodyText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
    },
    optionBodyTextSelected: {
      fontWeight: "800",
    },
    quizNavRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    },
    breakdownRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    breakdownChip: {
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    breakdownChipTitle: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "900",
    },
    breakdownChipSub: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "700",
      marginTop: 2,
    },
    resultBullet: {
      color: colors.success,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 19,
    },
    resultWeakBullet: {
      color: "#D97706",
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 19,
    },
    recommendedBox: {
      backgroundColor: colors.primarySoft,
      borderRadius: 14,
      gap: 4,
      padding: 12,
    },
    recommendedLabel: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    reselectBtn: {
      alignItems: "center",
      paddingVertical: 6,
    },
    reselectBtnText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "800",
    },
  });
