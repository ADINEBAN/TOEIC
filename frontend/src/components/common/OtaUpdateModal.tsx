import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { LiquidCard } from "@/src/components/ui/LiquidGlass";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";

const SNOOZE_STORAGE_KEY = "toeic_ota_snooze_v1";
const SNOOZE_DURATION_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const CHECK_THROTTLE_MS = 60 * 1000;

type SnoozeRecord = {
  updateId: string;
  dismissedAtMs: number;
};

type PendingUpdateInfo = {
  updateId: string;
  versionLabel: string;
  builtAtLabel: string;
};

function formatBuiltAt(iso?: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function shouldPromptForOtaUpdate(
  updateId: string,
  snooze: SnoozeRecord | null,
  nowMs: number,
): boolean {
  if (!snooze) return true;
  if (snooze.updateId !== updateId) return true;
  return nowMs - snooze.dismissedAtMs >= SNOOZE_DURATION_MS;
}

export default function OtaUpdateModal() {
  const { theme } = useAppTheme();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);

  const checkingRef = useRef(false);
  const lastCheckAtRef = useRef(0);

  const checkForUpdates = useCallback(async (force = false) => {
    if (Platform.OS === "web" || __DEV__ || !Updates.isEnabled) return;
    const now = Date.now();
    if (!force && now - lastCheckAtRef.current < CHECK_THROTTLE_MS) return;
    if (checkingRef.current) return;

    checkingRef.current = true;
    lastCheckAtRef.current = now;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable || !result.manifest?.id) return;

      const updateId = String(result.manifest.id);
      let snooze: SnoozeRecord | null = null;
      try {
        const raw = await AsyncStorage.getItem(SNOOZE_STORAGE_KEY);
        if (raw) {
          snooze = JSON.parse(raw) as SnoozeRecord;
        }
      } catch {
        snooze = null;
      }

      if (!shouldPromptForOtaUpdate(updateId, snooze, Date.now())) {
        return;
      }

      const manifestAny = result.manifest as {
        createdAt?: string;
        extra?: {
          expoClient?: { version?: string };
          otaRelease?: { version?: string; commitSha?: string; builtAt?: string };
        };
      };
      const release = manifestAny.extra?.otaRelease;
      const version = release?.version || manifestAny.extra?.expoClient?.version || "Mới";
      const commitTag = release?.commitSha ? ` (${release.commitSha})` : "";
      const builtAtLabel = formatBuiltAt(release?.builtAt || manifestAny.createdAt);

      setPendingUpdate({
        updateId,
        versionLabel: `${version}${commitTag}`,
        builtAtLabel,
      });
    } catch {
      // Silently ignore offline / transient manifest check failures
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || __DEV__ || !Updates.isEnabled) return;
    const timer = setTimeout(() => {
      void checkForUpdates(true);
    }, 1500);

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void checkForUpdates(false);
      }
    });

    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [checkForUpdates]);

  const handleInstallNow = async () => {
    if (downloading) return;
    try {
      setDownloading(true);
      await Updates.fetchUpdateAsync();
      await AsyncStorage.removeItem(SNOOZE_STORAGE_KEY).catch(() => {});
      setPendingUpdate(null);
      await Updates.reloadAsync();
    } catch (err) {
      setDownloading(false);
      Alert.alert(
        "Cập nhật ứng dụng",
        err instanceof Error
          ? err.message
          : "Không thể tải bản cập nhật lúc này. Vui lòng thử lại sau.",
      );
    }
  };

  const handleDismissForTwoDays = async () => {
    if (downloading || !pendingUpdate) return;
    const payload: SnoozeRecord = {
      updateId: pendingUpdate.updateId,
      dismissedAtMs: Date.now(),
    };
    setPendingUpdate(null);
    try {
      await AsyncStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures safely
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!downloading) void handleDismissForTwoDays();
      }}
      transparent
      visible={pendingUpdate !== null}
    >
      <View style={styles.backdrop}>
        <LiquidCard style={styles.sheet}>
          <View style={styles.iconCircle}>
            <Ionicons color={colors.primary} name="cloud-download" size={28} />
          </View>

          <Text style={styles.title}>Đã có bản cập nhật mới!</Text>
          <Text style={styles.metaText}>
            Phiên bản {pendingUpdate?.versionLabel}
            {pendingUpdate?.builtAtLabel ? ` • ${pendingUpdate.builtAtLabel}` : ""}
          </Text>
          <Text style={styles.bodyText}>
            Ứng dụng đã có tính năng và bản sửa lỗi mới từ máy chủ. Bạn có thể tải và áp dụng ngay trong app trong vài giây (không cần tải file APK).
          </Text>

          <Pressable
            disabled={downloading}
            onPress={() => void handleInstallNow()}
            style={({ pressed }) => [
              styles.primaryBtn,
              downloading ? styles.primaryBtnDisabled : null,
              pressed && !downloading ? { opacity: 0.9 } : null,
            ]}
          >
            {downloading ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.primaryBtnText}>Đang tải bản cập nhật...</Text>
              </>
            ) : (
              <>
                <Ionicons color="#FFFFFF" name="sparkles" size={16} />
                <Text style={styles.primaryBtnText}>Cập nhật ngay</Text>
              </>
            )}
          </Pressable>

          <Pressable
            disabled={downloading}
            onPress={() => void handleDismissForTwoDays()}
            style={({ pressed }) => [
              styles.laterBtn,
              pressed && !downloading ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={styles.laterBtnText}>Bỏ qua (nhắc lại sau 2 ngày)</Text>
          </Pressable>
        </LiquidCard>
      </View>
    </Modal>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    backdrop: {
      alignItems: "center",
      backgroundColor: "rgba(15, 23, 42, 0.62)",
      flex: 1,
      justifyContent: "center",
      padding: 22,
    },
    sheet: {
      alignItems: "center",
      gap: 10,
      maxWidth: 380,
      width: "100%",
    },
    iconCircle: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: 999,
      height: 58,
      justifyContent: "center",
      marginBottom: 2,
      width: 58,
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
    },
    metaText: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: "800",
      textAlign: "center",
    },
    bodyText: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 20,
      marginBottom: 6,
      textAlign: "center",
    },
    primaryBtn: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 99,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: 18,
      width: "100%",
    },
    primaryBtnDisabled: {
      opacity: 0.78,
    },
    primaryBtnText: {
      color: "#FFFFFF",
      fontSize: 14.5,
      fontWeight: "900",
    },
    laterBtn: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      width: "100%",
    },
    laterBtnText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "700",
    },
  });
