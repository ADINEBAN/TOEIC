import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import { LiquidButton, LiquidCard } from "@/src/components/ui/LiquidGlass";
import AppHeader, { AvatarBadge } from "@/src/components/user/AppHeader";
import ProgressBar from "@/src/components/user/ProgressBar";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  completeOrUnlockNextModule,
  getUserModuleContent,
  getUserRoadmap,
} from "@/src/services/user.service";
import { vocabProgressStore } from "@/src/store/progress-store";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { UserModuleContent, UserRoadmapModuleItem } from "@/src/types/user-api";
import { isNoActiveLearningPathError } from "@/src/utils/api-errors";
import { pushRoute, safeBack } from "@/src/utils/navigation";
import { useResponsiveLayout } from "@/src/utils/responsive";

export default function RoadmapScreen() {
  const { auth, isHydrated } = useAuth();
  const { theme } = useAppTheme();
  const { gridItemWidth, rf } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ moduleId?: string; vocabDone?: string; focus?: string }>();

  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [moduleInfo, setModuleInfo] = useState<UserRoadmapModuleItem | null>(null);
  const [moduleContent, setModuleContent] = useState<UserModuleContent | null>(null);
  const [practiceDoneModuleId, setPracticeDoneModuleId] = useState<number | null>(null);

  const selectedModuleId = useMemo(() => {
    if (!params.moduleId) return undefined;
    const parsed = Number(params.moduleId);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [params.moduleId]);

  const loadModule = useCallback(async () => {
    if (!auth.accessToken) return;

    try {
      setLoading(true);
      setErrorMessage(null);

      const roadmapPayload = await getUserRoadmap(auth.accessToken);
      const roadmap = roadmapPayload.data;
      const roadmapModules = (roadmap?.milestones ?? [])
        .flatMap((milestone) => milestone?.modules ?? [])
        .filter((module): module is UserRoadmapModuleItem => Boolean(module && typeof module.moduleId === "number"))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const fallbackModuleId = roadmap?.currentModuleId ?? roadmapModules[0]?.moduleId ?? selectedModuleId;
      const resolvedModuleId = selectedModuleId ?? fallbackModuleId;

      if (!resolvedModuleId) {
        setModuleInfo(null);
        setModuleContent(null);
        setErrorMessage("Không tìm thấy module trong roadmap của bạn.");
        return;
      }

      setModuleInfo(roadmapModules.find((module) => module.moduleId === resolvedModuleId) ?? null);

      const modulePayload = await getUserModuleContent(auth.accessToken, resolvedModuleId);
      setModuleContent(modulePayload.data ?? null);
    } catch (error) {
      setModuleInfo(null);
      setModuleContent(null);
      if (isNoActiveLearningPathError(error)) {
        setErrorMessage("Tài khoản này chưa có roadmap. Hãy chọn lộ trình trước.");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Không thể tải chi tiết module.");
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, selectedModuleId]);

  useEffect(() => {
    if (!isHydrated || !auth.accessToken) return;
    const timer = setTimeout(() => {
      void loadModule();
    }, 0);
    return () => clearTimeout(timer);
  }, [auth.accessToken, isHydrated, loadModule]);

  const activeModuleId = moduleContent?.moduleId ?? moduleInfo?.moduleId;
  const practiceStepDone = typeof activeModuleId === "number" && practiceDoneModuleId === activeModuleId;
  const totalVideoLessons = moduleContent?.videoLessons?.length ?? 0;
  const totalFlashcards = moduleContent?.flashcards?.length ?? 0;
  const totalPracticeSets = moduleContent?.practiceSets?.length ?? 0;
  const completedVideoLessons =
    moduleContent?.videoLessons?.filter((lesson) => lesson.progressStatus === "COMPLETED").length ?? 0;
  const allVideosCompleted = totalVideoLessons > 0 && completedVideoLessons === totalVideoLessons;
  const videosSatisfied = totalVideoLessons === 0 || allVideosCompleted;
  const vocabStepDone =
    (typeof activeModuleId === "number" && vocabProgressStore.isCompleted(activeModuleId)) ||
    params.vocabDone === "true";
  const vocabSatisfied = totalFlashcards === 0 || vocabStepDone;
  const practiceSatisfied = totalPracticeSets === 0 || practiceStepDone;
  const canOpenVocab = videosSatisfied && totalFlashcards > 0;
  const canOpenPractice = videosSatisfied && vocabSatisfied && totalPracticeSets > 0;
  const canCompleteModule = videosSatisfied && vocabSatisfied && practiceSatisfied;
  const shouldHighlightPractice = params.focus === "practice" && canOpenPractice;

  useEffect(() => {
    if (params.vocabDone === "true" && typeof activeModuleId === "number") {
      vocabProgressStore.markCompleted(activeModuleId);
    }
  }, [activeModuleId, params.vocabDone]);

  const handleCompleteModule = async () => {
    if (!auth.accessToken || !activeModuleId || unlocking) return;

    try {
      setUnlocking(true);
      const response = await completeOrUnlockNextModule(auth.accessToken, activeModuleId, true);

      if (response.data?.pathCompleted) {
        const pathTitle = moduleInfo?.title ?? moduleContent?.title ?? "Khóa học TOEIC";
        pushRoute(
          `/user/path-complete?completed=true&moduleId=${activeModuleId}&pathTitle=${encodeURIComponent(pathTitle)}`,
        );
        return;
      }

      await loadModule();

      if (response.data?.nextModuleUnlocked && response.data?.nextModuleId) {
        Alert.alert("Module", "Đã mở module tiếp theo.");
        pushRoute(`/user/roadmap?moduleId=${response.data.nextModuleId}`);
        return;
      }

      Alert.alert("Module", "Đã cập nhật trạng thái module.");
    } catch (error) {
      if (isNoActiveLearningPathError(error)) {
        const pathTitle = moduleContent?.title ?? moduleInfo?.title ?? "Khóa học TOEIC";
        pushRoute(
          `/user/path-complete?completed=true&moduleId=${activeModuleId}&pathTitle=${encodeURIComponent(pathTitle)}`,
        );
        return;
      }

      const message = error instanceof Error ? error.message : "Không thể cập nhật module.";
      Alert.alert("Module", message);
    } finally {
      setUnlocking(false);
    }
  };

  const statW = gridItemWidth(3, 8, true);

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => safeBack("/user/practice")}
        rightSlot={<AvatarBadge label={auth.user?.fullName?.[0]?.toUpperCase() || "A"} />}
        subtitle={moduleContent?.moduleType ?? moduleInfo?.moduleType ?? "MODULE"}
        title={moduleContent?.title ?? moduleInfo?.title ?? "Chi tiết Module"}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải nội dung module...</Text>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {!loading &&
      (errorMessage?.toLowerCase().includes("chưa có roadmap") ||
        errorMessage?.toLowerCase().includes("chua co roadmap")) ? (
        <LiquidButton
          label="Bắt đầu Onboarding"
          onPress={() => pushRoute("/user/onboarding")}
          style={{ marginBottom: 14 }}
          variant="primary"
        />
      ) : null}

      {shouldHighlightPractice ? (
        <SurfaceCard style={styles.readyBanner}>
          <Ionicons color={colors.success} name="checkmark-circle" size={20} />
          <View style={{ flex: 1 }}>
            <Text style={styles.readyTitle}>Sẵn sàng luyện Practice</Text>
            <Text style={styles.readySub}>Bạn đã xong video và từ vựng của module này.</Text>
          </View>
        </SurfaceCard>
      ) : null}

      <LiquidCard hero style={styles.heroCard}>
        <Text style={styles.heroDesc}>
          {moduleContent?.description ?? moduleInfo?.description ?? "Hoàn thành lần lượt 4 bước bên dưới."}
        </Text>

        <View style={styles.kpiRow}>
          <View style={[styles.kpiTile, { width: statW }]}>
            <Text style={styles.kpiValue}>{moduleContent?.videoLessons?.length ?? 0}</Text>
            <Text style={styles.kpiLabel}>Videos</Text>
          </View>
          <View style={[styles.kpiTile, { width: statW }]}>
            <Text style={styles.kpiValue}>{moduleContent?.flashcards?.length ?? 0}</Text>
            <Text style={styles.kpiLabel}>Từ vựng</Text>
          </View>
          <View style={[styles.kpiTile, { width: statW }]}>
            <Text style={styles.kpiValue}>{moduleContent?.practiceSets?.length ?? 0}</Text>
            <Text style={styles.kpiLabel}>Practice</Text>
          </View>
        </View>

        <ProgressBar
          accentColor={colors.accent}
          label="Tiến độ module"
          labelColor={colors.heroTextMuted}
          rightLabel={`${Math.round(moduleInfo?.progressPercent ?? 0)}%`}
          rightLabelColor={colors.heroText}
          value={moduleInfo?.progressPercent ?? 0}
        />
      </LiquidCard>

      <SectionTitle title="Trình tự hoàn thành" />
      <SurfaceCard style={styles.stepsCard}>
        <View style={styles.stepRow}>
          <View style={[styles.stepCircle, videosSatisfied ? styles.stepDone : null]}>
            <Text style={[styles.stepNum, videosSatisfied ? styles.stepNumDone : null]}>1</Text>
          </View>
          <View style={styles.stepCopy}>
            <Text style={[styles.stepTitle, { fontSize: rf(14.5) }]}>Học video bài giảng</Text>
            <Text style={styles.stepSub}>
              {totalVideoLessons === 0
                ? "Không có video — có thể chuyển sang bước sau"
                : `${completedVideoLessons}/${totalVideoLessons} video đã xong`}
            </Text>
          </View>
          <LiquidButton
            compact
            disabled={!activeModuleId || totalVideoLessons === 0}
            label={totalVideoLessons === 0 ? "Không có" : "Mở"}
            onPress={() => {
              if (activeModuleId) pushRoute(`/user/lesson?moduleId=${activeModuleId}`);
            }}
            variant="primary"
          />
        </View>

        <View style={[styles.stepRow, styles.stepRowBorder]}>
          <View style={[styles.stepCircle, vocabSatisfied ? styles.stepDone : null]}>
            <Text style={[styles.stepNum, vocabSatisfied ? styles.stepNumDone : null]}>2</Text>
          </View>
          <View style={styles.stepCopy}>
            <Text style={[styles.stepTitle, { fontSize: rf(14.5) }]}>Luyện từ vựng ({totalFlashcards} thẻ)</Text>
            <Text style={styles.stepSub}>
              {totalFlashcards === 0
                ? "Không có thẻ từ vựng trong mô-đun này"
                : totalVideoLessons === 0
                  ? "Sẵn sàng học thẻ từ"
                  : "Mở sau khi hoàn tất video"}
            </Text>
          </View>
          <LiquidButton
            compact
            disabled={!activeModuleId || !canOpenVocab}
            label={totalFlashcards === 0 ? "Không có" : vocabStepDone ? "Xem lại" : "Học"}
            onPress={() => {
              if (activeModuleId) pushRoute(`/user/cards?moduleId=${activeModuleId}`);
            }}
            variant={vocabStepDone ? "glass" : "primary"}
          />
        </View>

        <View style={[styles.stepRow, styles.stepRowBorder]}>
          <View style={[styles.stepCircle, practiceSatisfied ? styles.stepDone : null]}>
            <Text style={[styles.stepNum, practiceSatisfied ? styles.stepNumDone : null]}>3</Text>
          </View>
          <View style={styles.stepCopy}>
            <Text style={[styles.stepTitle, { fontSize: rf(14.5) }]}>Luyện Practice ({totalPracticeSets} bộ đề)</Text>
            <Text style={styles.stepSub}>
              {totalPracticeSets === 0
                ? "Không có bộ đề thực hành trong mô-đun này"
                : "Mở sau khi hoàn tất các bước trước"}
            </Text>
          </View>
          <LiquidButton
            compact
            disabled={!activeModuleId || !canOpenPractice}
            label={totalPracticeSets === 0 ? "Không có" : "Làm đề"}
            onPress={() => {
              if (activeModuleId) {
                setPracticeDoneModuleId(activeModuleId);
                pushRoute(`/user/practice-module?moduleId=${activeModuleId}`);
              }
            }}
            variant={shouldHighlightPractice ? "accent" : "glass"}
          />
        </View>

        <LiquidButton
          disabled={!activeModuleId || unlocking || !canCompleteModule}
          label={unlocking ? "Đang cập nhật..." : "Bước 4: Hoàn thành Module"}
          loading={unlocking}
          onPress={handleCompleteModule}
          style={{ marginTop: 12 }}
          variant="primary"
        />
      </SurfaceCard>

      <SectionTitle title="Nội dung xem nhanh" />
      <SurfaceCard style={styles.previewCard}>
        {(moduleContent?.videoLessons ?? []).slice(0, 3).map((lesson) => (
          <View key={lesson.lessonId} style={styles.previewRow}>
            <Ionicons color={colors.primary} name="play-circle-outline" size={17} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.previewTitle}>{lesson.lessonTitle}</Text>
              <Text style={styles.previewSub}>{lesson.durationSeconds}s • {lesson.progressStatus}</Text>
            </View>
          </View>
        ))}

        {(moduleContent?.flashcards ?? []).slice(0, 2).map((card) => (
          <View key={card.id} style={styles.previewRow}>
            <Ionicons color={colors.accent} name="book-outline" size={17} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.previewTitle}>{card.englishWord}</Text>
              <Text numberOfLines={1} style={styles.previewSub}>{card.meaningVi}</Text>
            </View>
          </View>
        ))}

        {(moduleContent?.practiceSets ?? []).slice(0, 2).map((set) => (
          <Pressable
            key={set.id}
            disabled={!canOpenPractice}
            onPress={() => {
              setPracticeDoneModuleId(activeModuleId ?? null);
              pushRoute(`/user/practice-module?moduleId=${activeModuleId}`);
            }}
            style={[styles.previewRow, !canOpenPractice ? { opacity: 0.5 } : null]}
          >
            <Ionicons color={colors.success} name="document-text-outline" size={17} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.previewTitle}>{set.title}</Text>
              <Text style={styles.previewSub}>{set.durationMinutes ?? "--"} phút • Part {set.partNo ?? "--"}</Text>
            </View>
            <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
          </Pressable>
        ))}
      </SurfaceCard>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    loadingWrap: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 13,
    },
    errorText: {
      backgroundColor: colors.isDark ? "rgba(239,68,68,0.16)" : "rgba(249,112,102,0.1)",
      borderColor: colors.isDark ? "rgba(248,113,113,0.34)" : "rgba(249,112,102,0.24)",
      borderRadius: 12,
      borderWidth: 1,
      color: colors.danger,
      marginBottom: 12,
      padding: 12,
    },
    readyBanner: {
      alignItems: "center",
      backgroundColor: colors.isDark ? "rgba(31,157,108,0.18)" : "#E8F8EE",
      borderColor: colors.success,
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    readyTitle: {
      color: colors.success,
      fontSize: 14,
      fontWeight: "900",
    },
    readySub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    heroCard: {
      gap: 12,
      marginBottom: 18,
    },
    heroDesc: {
      color: colors.heroText,
      fontSize: 13.5,
      lineHeight: 20,
    },
    kpiRow: {
      flexDirection: "row",
      gap: 8,
    },
    kpiTile: {
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderColor: "rgba(255,255,255,0.18)",
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 10,
    },
    kpiValue: {
      color: colors.heroText,
      fontSize: 20,
      fontWeight: "900",
    },
    kpiLabel: {
      color: colors.heroTextMuted,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },
    stepsCard: {
      marginBottom: 18,
    },
    stepRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingVertical: 10,
    },
    stepRowBorder: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
    },
    stepCircle: {
      alignItems: "center",
      backgroundColor: colors.glassFill,
      borderColor: colors.glassBorder,
      borderRadius: radius.pill,
      borderWidth: 1,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    stepDone: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    stepNum: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "900",
    },
    stepNumDone: {
      color: "#FFFFFF",
    },
    stepCopy: {
      flex: 1,
      minWidth: 0,
    },
    stepTitle: {
      color: colors.text,
      fontWeight: "800",
    },
    stepSub: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    previewCard: {
      gap: 12,
    },
    previewRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
    },
    previewTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "700",
    },
    previewSub: {
      color: colors.textMuted,
      fontSize: 11.5,
      marginTop: 2,
    },
  });
