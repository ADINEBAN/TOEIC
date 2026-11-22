import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { radius } from "@/src/assets/styles/user-theme";
import AppHeader from "@/src/components/user/AppHeader";
import ProgressBar from "@/src/components/user/ProgressBar";
import SectionTitle from "@/src/components/user/SectionTitle";
import SurfaceCard from "@/src/components/user/SurfaceCard";
import UserScreen from "@/src/components/user/UserScreen";
import { useAuth } from "@/src/hooks/use-auth";
import {
  createSubscriptionPaymentOrder,
  getMyPaymentOrders,
  getPaymentOrderStatus,
  getSubscriptionPlansOverview,
  PaymentOrderData,
  PlanOptionDto,
  SubscriptionPlansOverviewData,
  simulateSepayOrderWebhook,
} from "@/src/services/subscription.service";
import { getMyProfile } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { alertCrossPlatform } from "@/src/utils/web-dialog";

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

function formatDateTimeVi(iso?: string | null): string {
  if (!iso) return "Không thời hạn";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function extractErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function SubscriptionScreen() {
  const { auth, updateUserProfile } = useAuth();
  const { theme } = useAppTheme();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [creatingPlanCode, setCreatingPlanCode] = useState<string | null>(null);
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);
  const [overview, setOverview] = useState<SubscriptionPlansOverviewData | null>(null);
  const [orders, setOrders] = useState<PaymentOrderData[]>([]);
  const [activeOrder, setActiveOrder] = useState<PaymentOrderData | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSubscriptionData = useCallback(async () => {
    if (!auth.accessToken) {
      setLoading(false);
      return;
    }
    try {
      setErrorMessage(null);
      const [overviewRes, ordersRes] = await Promise.all([
        getSubscriptionPlansOverview(auth.accessToken),
        getMyPaymentOrders(auth.accessToken),
      ]);
      setOverview(overviewRes);
      setOrders(ordersRes);
    } catch (error) {
      setErrorMessage(extractErrorText(error, "Không thể tải thông tin gói đăng ký"));
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useFocusEffect(
    useCallback(() => {
      void loadSubscriptionData();
    }, [loadSubscriptionData])
  );

  // Auto-poll active VietQR order every 3s for SePay Webhook completion
  useEffect(() => {
    if (!auth.accessToken || !activeOrder || activeOrder.status !== "PENDING") {
      return;
    }
    const token = auth.accessToken;
    const timer = setInterval(async () => {
      try {
        const refreshed = await getPaymentOrderStatus(token, activeOrder.orderCode);
        setActiveOrder(refreshed);
        if (refreshed.status === "PAID") {
          clearInterval(timer);
          await loadSubscriptionData();
          try {
            const profileRes = await getMyProfile(token);
            if (profileRes.data) {
              updateUserProfile(profileRes.data);
            }
          } catch {
            // ignore profile sync failure
          }
          alertCrossPlatform(
            "Thanh toán thành công 🎉",
            `Đã kích hoạt gói ${refreshed.planTier} (+${refreshed.bonusDiamonds} 💎) qua SePay Webhook!`
          );
        }
      } catch {
        // ignore transient polling error
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [activeOrder, auth.accessToken, loadSubscriptionData, updateUserProfile]);

  const handleCreateOrder = async (plan: PlanOptionDto) => {
    if (!auth.accessToken) return;
    try {
      setCreatingPlanCode(plan.planCode);
      setErrorMessage(null);
      const order = await createSubscriptionPaymentOrder(auth.accessToken, plan.planCode);
      setActiveOrder(order);
      setOrders((prev) => [order, ...prev.filter((item) => item.orderCode !== order.orderCode)]);
    } catch (error) {
      setErrorMessage(extractErrorText(error, "Không thể khởi tạo mã VietQR SePay"));
    } finally {
      setCreatingPlanCode(null);
    }
  };

  const handleSimulateWebhook = async () => {
    if (!auth.accessToken || !activeOrder) return;
    try {
      setSimulatingWebhook(true);
      const updated = await simulateSepayOrderWebhook(auth.accessToken, activeOrder.orderCode);
      setActiveOrder(updated);
      await loadSubscriptionData();
      try {
        const profileRes = await getMyProfile(auth.accessToken);
        if (profileRes.data) {
          updateUserProfile(profileRes.data);
        }
      } catch {
        // ignore
      }
      alertCrossPlatform(
        "Đã kích hoạt gói thành công 🎉",
        `Đơn ${updated.orderCode} đã thanh toán thành công. Gói ${updated.planTier} và +${updated.bonusDiamonds} 💎 đã được cộng vào tài khoản!`
      );
    } catch (error) {
      alertCrossPlatform(
        "Không thể giả lập Webhook",
        extractErrorText(error, "Vui lòng thử lại.")
      );
    } finally {
      setSimulatingWebhook(false);
    }
  };

  const currentTier = (overview?.currentTier ?? "FREE").toUpperCase();
  const filteredPlans = (overview?.plans ?? []).filter((plan) =>
    selectedCycle === "MONTHLY" ? plan.durationDays <= 31 : plan.durationDays > 31
  );

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => router.back()}
        subtitle="Thanh toán tự động SePay VietQR • Mở khóa AI & đề thi"
        title="Nâng cấp gói PLUS & PRO"
      />

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.helperText}>Đang tải bảng giá & hạn mức AI...</Text>
        </SurfaceCard>
      ) : null}

      {errorMessage ? (
        <SurfaceCard style={styles.errorCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </SurfaceCard>
      ) : null}

      {overview ? (
        <>
          <SurfaceCard style={styles.currentPlanCard}>
            <View style={styles.currentPlanTop}>
              <View style={styles.tierBadgeWrap}>
                <View
                  style={[
                    styles.tierBadge,
                    currentTier === "PRO"
                      ? styles.tierBadgePro
                      : currentTier === "PLUS"
                        ? styles.tierBadgePlus
                        : styles.tierBadgeFree,
                  ]}
                >
                  <Ionicons
                    name={
                      currentTier === "PRO"
                        ? "diamond"
                        : currentTier === "PLUS"
                          ? "sparkles"
                          : "leaf-outline"
                    }
                    size={15}
                    color="#FFFFFF"
                  />
                  <Text style={styles.tierBadgeText}>GÓI HIỆN TẠI: {currentTier}</Text>
                </View>
                {overview.verified ? (
                  <View style={styles.verifiedChip}>
                    <Ionicons name="checkmark-circle" size={14} color="#0284C7" />
                    <Text style={styles.verifiedChipText}>Verified PRO</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.diamondPill}>
                <Text style={styles.diamondPillText}>💎 {overview.diamonds.toLocaleString("vi-VN")}</Text>
              </View>
            </View>

            <Text style={styles.expiryText}>
              {currentTier === "FREE"
                ? "Bạn đang sử dụng gói FREE (miễn phí). Nâng cấp PLUS chỉ từ 10.000đ/30 ngày để mở khóa toàn bộ bài giảng & tăng gấp 10 lần lượt AI."
                : `Hiệu lực gói ${currentTier}: đến ngày ${formatDateTimeVi(overview.planExpiresAt)}`}
            </Text>
          </SurfaceCard>

          <SectionTitle
            title="Hạn mức tính năng AI của bạn"
            actionLabel="Làm mới tự động"
          />
          <View style={styles.quotaGrid}>
            {overview.quotas.map((q) => {
              const percent = q.unlimited
                ? 100
                : q.limitCount > 0
                  ? Math.min(100, Math.round((q.usedCount / q.limitCount) * 100))
                  : 100;
              return (
                <SurfaceCard key={q.featureKey} style={styles.quotaCard}>
                  <View style={styles.quotaHeader}>
                    <Text style={styles.quotaTitle}>{q.featureTitle}</Text>
                    <Text style={styles.quotaPeriod}>{q.periodLabel}</Text>
                  </View>
                  <Text style={styles.quotaValue}>
                    {q.unlimited
                      ? "∞ Không giới hạn (PRO)"
                      : q.locked
                        ? "🔒 Yêu cầu gói PLUS / PRO"
                        : `Đã dùng ${q.usedCount} / ${q.limitCount} lượt`}
                  </Text>
                  <ProgressBar value={percent} />
                </SurfaceCard>
              );
            })}
          </View>

          <View style={styles.cycleToggleRow}>
            <Pressable
              style={[
                styles.cycleButton,
                selectedCycle === "MONTHLY" && styles.cycleButtonActive,
              ]}
              onPress={() => setSelectedCycle("MONTHLY")}
            >
              <Text
                style={[
                  styles.cycleButtonText,
                  selectedCycle === "MONTHLY" && styles.cycleButtonTextActive,
                ]}
              >
                Theo tháng (30 ngày)
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.cycleButton,
                selectedCycle === "YEARLY" && styles.cycleButtonActive,
              ]}
              onPress={() => setSelectedCycle("YEARLY")}
            >
              <Text
                style={[
                  styles.cycleButtonText,
                  selectedCycle === "YEARLY" && styles.cycleButtonTextActive,
                ]}
              >
                Theo năm (365 ngày • Tặng 💎 lớn)
              </Text>
            </Pressable>
          </View>

          <View style={styles.planCardsWrap}>
            {filteredPlans.map((plan) => {
              const isPro = plan.tier === "PRO";
              const isBusy = creatingPlanCode === plan.planCode;
              return (
                <SurfaceCard
                  key={plan.planCode}
                  style={[
                    styles.planCard,
                    isPro ? styles.planCardPro : styles.planCardPlus,
                  ]}
                >
                  <View style={styles.planCardTop}>
                    <View>
                      <Text style={[styles.planTierTag, isPro && styles.planTierTagPro]}>
                        {plan.tier} • {plan.cycleLabel.toUpperCase()}
                      </Text>
                      <Text style={styles.planTitle}>{plan.title}</Text>
                    </View>
                    <View style={[styles.planBadgeChip, isPro && styles.planBadgeChipPro]}>
                      <Text style={[styles.planBadgeChipText, isPro && styles.planBadgeChipTextPro]}>
                        {plan.badgeText}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={[styles.priceValue, isPro && styles.priceValuePro]}>
                      {formatVnd(plan.priceVnd)}
                    </Text>
                    <Text style={styles.priceCycle}>/ {plan.cycleLabel}</Text>
                  </View>

                  <View style={styles.bonusChip}>
                    <Text style={styles.bonusChipText}>
                      🎁 Tặng ngay +{plan.bonusDiamonds.toLocaleString("vi-VN")} Kim cương 💎
                    </Text>
                  </View>

                  <View style={styles.highlightList}>
                    {plan.highlights.map((line, index) => (
                      <View key={`${plan.planCode}-${index}`} style={styles.highlightRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={isPro ? "#7C3AED" : colors.primaryDark}
                        />
                        <Text style={styles.highlightText}>{line}</Text>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    style={[
                      styles.buyButton,
                      isPro ? styles.buyButtonPro : styles.buyButtonPlus,
                      isBusy && styles.buttonDisabled,
                    ]}
                    disabled={isBusy}
                    onPress={() => handleCreateOrder(plan)}
                  >
                    {isBusy ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.buyButtonText}>
                          Thanh toán SePay VietQR • {formatVnd(plan.priceVnd)}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </SurfaceCard>
              );
            })}
          </View>

          <SurfaceCard style={styles.compareCard}>
            <Text style={styles.compareTitle}>Bảng so sánh đặc quyền FREE vs PLUS vs PRO</Text>
            <View style={styles.compareRowHeader}>
              <Text style={[styles.compareCellFeature, styles.compareHeaderText]}>Tính năng</Text>
              <Text style={[styles.compareCellTier, styles.compareHeaderText]}>FREE</Text>
              <Text style={[styles.compareCellTier, styles.compareHeaderText]}>PLUS</Text>
              <Text style={[styles.compareCellTier, styles.compareHeaderText]}>PRO</Text>
            </View>
            {[
              ["Ngữ pháp, Flashcard SM-2, Arena 1v1", "Mở 100%", "Mở 100%", "Mở 100%"],
              ["Video bài giảng & Full Test 200 câu", "Hạn chế", "Mở 100%", "Mở 100%"],
              ["AI Giải thích đáp án chi tiết", "3 / ngày", "30 / ngày", "Không giới hạn"],
              ["Upload đề PDF/Word & Tạo phòng thi", "1 / tháng", "10 / tháng", "Không giới hạn"],
              ["AI Phân tích đáp án đề tài liệu", "Khóa 🔒", "Mở khóa ✓", "Không giới hạn"],
              ["Import Video AI phụ đề song ngữ", "Khóa 🔒", "5 / tháng", "Không giới hạn"],
              ["Camera AI nhận diện đồ vật", "2 / ngày", "20 / ngày", "Không giới hạn"],
              ["Thưởng Kim cương học tập & Tích xanh", "x1.0", "+100–500 💎", "x1.5 💎 + Tích xanh"],
            ].map(([feature, freeVal, plusVal, proVal], idx) => (
              <View key={`cmp-${idx}`} style={styles.compareRow}>
                <Text style={styles.compareCellFeature}>{feature}</Text>
                <Text style={styles.compareCellTier}>{freeVal}</Text>
                <Text style={[styles.compareCellTier, styles.comparePlusText]}>{plusVal}</Text>
                <Text style={[styles.compareCellTier, styles.compareProText]}>{proVal}</Text>
              </View>
            ))}
          </SurfaceCard>

          {orders.length > 0 ? (
            <>
              <SectionTitle title="Lịch sử đơn thanh toán gần đây" />
              {orders.slice(0, 5).map((ord) => (
                <Pressable
                  key={ord.orderCode}
                  onPress={() => setActiveOrder(ord)}
                >
                  <SurfaceCard style={styles.orderHistoryRow}>
                    <View style={styles.orderHistoryLeft}>
                      <Text style={styles.orderCodeText}>
                        #{ord.orderCode} • {ord.planCode}
                      </Text>
                      <Text style={styles.orderMetaText}>
                        {formatVnd(ord.amountVnd)} • +{ord.bonusDiamonds} 💎 •{" "}
                        {formatDateTimeVi(ord.createdAt)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.orderStatusBadge,
                        ord.status === "PAID"
                          ? styles.orderStatusPaid
                          : ord.status === "EXPIRED"
                            ? styles.orderStatusExpired
                            : styles.orderStatusPending,
                      ]}
                    >
                      <Text style={styles.orderStatusText}>
                        {ord.status === "PAID"
                          ? "ĐÃ THANH TOÁN"
                          : ord.status === "EXPIRED"
                            ? "HẾT HẠN"
                            : "CHỜ QUÉT QR"}
                      </Text>
                    </View>
                  </SurfaceCard>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      ) : null}

      <Modal
        visible={Boolean(activeOrder)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveOrder(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Thanh toán tự động SePay VietQR</Text>
              <Pressable onPress={() => setActiveOrder(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            {activeOrder ? (
              <ScrollView contentContainerStyle={styles.modalBody}>
                <View style={styles.qrBox}>
                  <Image
                    source={{ uri: activeOrder.qrImageUrl }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>

                <View
                  style={[
                    styles.statusBanner,
                    activeOrder.status === "PAID"
                      ? styles.statusBannerPaid
                      : styles.statusBannerPending,
                  ]}
                >
                  {activeOrder.status === "PENDING" ? (
                    <ActivityIndicator size="small" color="#0284C7" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                  )}
                  <Text
                    style={[
                      styles.statusBannerText,
                      activeOrder.status === "PAID" && styles.statusBannerTextPaid,
                    ]}
                  >
                    {activeOrder.status === "PAID"
                      ? `Đã nhận thanh toán! Gói ${activeOrder.planTier} đã được kích hoạt.`
                      : "Đang chờ SePay Webhook xác nhận tự động (kiểm tra mỗi 3 giây)..."}
                  </Text>
                </View>

                <View style={styles.bankInfoBox}>
                  <View style={styles.bankInfoRow}>
                    <Text style={styles.bankInfoLabel}>Ngân hàng:</Text>
                    <Text style={styles.bankInfoValue}>{activeOrder.bankCode}</Text>
                  </View>
                  <View style={styles.bankInfoRow}>
                    <Text style={styles.bankInfoLabel}>Số tài khoản:</Text>
                    <Text style={styles.bankInfoValue}>{activeOrder.accountNumber}</Text>
                  </View>
                  <View style={styles.bankInfoRow}>
                    <Text style={styles.bankInfoLabel}>Chủ tài khoản:</Text>
                    <Text style={styles.bankInfoValue}>{activeOrder.accountName}</Text>
                  </View>
                  <View style={styles.bankInfoRow}>
                    <Text style={styles.bankInfoLabel}>Số tiền chính xác:</Text>
                    <Text style={styles.bankInfoHighlight}>{formatVnd(activeOrder.amountVnd)}</Text>
                  </View>
                  <View style={styles.bankInfoRow}>
                    <Text style={styles.bankInfoLabel}>Nội dung chuyển khoản:</Text>
                    <Text style={styles.bankInfoCode}>{activeOrder.transferContent}</Text>
                  </View>
                </View>

                <Text style={styles.webhookHint}>
                  💡 Khi quét mã VietQR trên ứng dụng ngân hàng, số tiền và nội dung{" "}
                  <Text style={styles.boldText}>{activeOrder.transferContent}</Text> sẽ được điền
                  tự động. Ngay khi chuyển khoản, SePay bắn Webhook về{" "}
                  <Text style={styles.boldText}>POST /api/payments/sepay/webhook</Text> và mở khóa
                  gói trong vài giây.
                </Text>

                {activeOrder.status !== "PAID" ? (
                  <Pressable
                    style={[styles.simulateButton, simulatingWebhook && styles.buttonDisabled]}
                    disabled={simulatingWebhook}
                    onPress={handleSimulateWebhook}
                  >
                    {simulatingWebhook ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="flash" size={16} color="#FFFFFF" />
                        <Text style={styles.simulateButtonText}>
                          Giả lập SePay Webhook đã nhận tiền (Test Local 1-Click)
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.simulateButton, { backgroundColor: "#0D9488" }]}
                    onPress={() => setActiveOrder(null)}
                  >
                    <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                    <Text style={styles.simulateButtonText}>
                      Hoàn tất & Bắt đầu sử dụng gói {activeOrder.planTier}
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </UserScreen>
  );
}

const createStyles = (colors: LiquidThemeColors) =>
  StyleSheet.create({
    container: {
      gap: 14,
      padding: 16,
      paddingBottom: 36,
    },
    centerCard: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 24,
    },
    helperText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    errorCard: {
      backgroundColor: "#FEF2F2",
      borderColor: "#FCA5A5",
    },
    errorText: {
      color: "#B91C1C",
      fontSize: 13,
      fontWeight: "700",
    },
    currentPlanCard: {
      gap: 10,
    },
    currentPlanTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 8,
    },
    tierBadgeWrap: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    tierBadge: {
      alignItems: "center",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    tierBadgeFree: {
      backgroundColor: "#64748B",
    },
    tierBadgePlus: {
      backgroundColor: "#0D9488",
    },
    tierBadgePro: {
      backgroundColor: "#7C3AED",
    },
    tierBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "800",
    },
    verifiedChip: {
      alignItems: "center",
      backgroundColor: "#E0F2FE",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    verifiedChipText: {
      color: "#0369A1",
      fontSize: 11,
      fontWeight: "800",
    },
    diamondPill: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    diamondPillText: {
      color: colors.primaryDark,
      fontSize: 13,
      fontWeight: "800",
    },
    expiryText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 19,
    },
    quotaGrid: {
      gap: 10,
    },
    quotaCard: {
      gap: 8,
      paddingVertical: 12,
    },
    quotaHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    quotaTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
    },
    quotaPeriod: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    quotaValue: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "700",
    },
    cycleToggleRow: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1,
      flexDirection: "row",
      padding: 4,
      gap: 6,
    },
    cycleButton: {
      alignItems: "center",
      borderRadius: radius.md,
      flex: 1,
      paddingVertical: 10,
    },
    cycleButtonActive: {
      backgroundColor: colors.primary,
    },
    cycleButtonText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "800",
    },
    cycleButtonTextActive: {
      color: "#FFFFFF",
    },
    planCardsWrap: {
      gap: 14,
    },
    planCard: {
      borderWidth: 2,
      gap: 12,
    },
    planCardPlus: {
      borderColor: colors.primary,
    },
    planCardPro: {
      borderColor: "#8B5CF6",
      backgroundColor: "#FAF5FF",
    },
    planCardTop: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    planTierTag: {
      color: colors.primaryDark,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.6,
    },
    planTierTagPro: {
      color: "#6D28D9",
    },
    planTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 2,
    },
    planBadgeChip: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    planBadgeChipPro: {
      backgroundColor: "#EDE9FE",
    },
    planBadgeChipText: {
      color: colors.primaryDark,
      fontSize: 11,
      fontWeight: "800",
    },
    planBadgeChipTextPro: {
      color: "#6D28D9",
    },
    priceRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 6,
    },
    priceValue: {
      color: colors.primaryDark,
      fontSize: 28,
      fontWeight: "900",
    },
    priceValuePro: {
      color: "#6D28D9",
    },
    priceCycle: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "700",
    },
    bonusChip: {
      alignSelf: "flex-start",
      backgroundColor: "#FEF3C7",
      borderColor: "#F59E0B",
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    bonusChipText: {
      color: "#B45309",
      fontSize: 12,
      fontWeight: "800",
    },
    highlightList: {
      gap: 8,
    },
    highlightRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 8,
    },
    highlightText: {
      color: colors.text,
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 19,
    },
    buyButton: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      marginTop: 4,
      minHeight: 46,
      paddingHorizontal: 16,
    },
    buyButtonPlus: {
      backgroundColor: colors.primary,
    },
    buyButtonPro: {
      backgroundColor: "#7C3AED",
    },
    buyButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "800",
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    compareCard: {
      gap: 10,
    },
    compareTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "900",
    },
    compareRowHeader: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      paddingBottom: 6,
    },
    compareHeaderText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
    },
    compareRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      paddingVertical: 7,
    },
    compareCellFeature: {
      color: colors.text,
      flex: 1.8,
      fontSize: 12,
      fontWeight: "700",
      paddingRight: 6,
    },
    compareCellTier: {
      color: colors.textMuted,
      flex: 1,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
    },
    comparePlusText: {
      color: colors.primaryDark,
      fontWeight: "800",
    },
    compareProText: {
      color: "#6D28D9",
      fontWeight: "900",
    },
    orderHistoryRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 12,
    },
    orderHistoryLeft: {
      flex: 1,
      gap: 3,
    },
    orderCodeText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    orderMetaText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    orderStatusBadge: {
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    orderStatusPaid: {
      backgroundColor: "#DCFCE7",
    },
    orderStatusPending: {
      backgroundColor: "#E0F2FE",
    },
    orderStatusExpired: {
      backgroundColor: "#F1F5F9",
    },
    orderStatusText: {
      color: "#0F172A",
      fontSize: 10,
      fontWeight: "800",
    },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: "rgba(15, 23, 42, 0.65)",
      flex: 1,
      justifyContent: "center",
      padding: 16,
    },
    modalCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: radius.xl,
      maxHeight: "92%",
      maxWidth: 460,
      padding: 18,
      width: "100%",
    },
    modalHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
    },
    closeBtn: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      padding: 6,
    },
    modalBody: {
      alignItems: "center",
      gap: 12,
      paddingBottom: 8,
    },
    qrBox: {
      alignItems: "center",
      backgroundColor: "#FFFFFF",
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      padding: 12,
    },
    qrImage: {
      height: 230,
      width: 230,
    },
    statusBanner: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      width: "100%",
    },
    statusBannerPending: {
      backgroundColor: "#E0F2FE",
    },
    statusBannerPaid: {
      backgroundColor: "#DCFCE7",
    },
    statusBannerText: {
      color: "#0369A1",
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
    },
    statusBannerTextPaid: {
      color: "#15803D",
    },
    bankInfoBox: {
      backgroundColor: "#F8FAFC",
      borderColor: "#E2E8F0",
      borderRadius: radius.md,
      borderWidth: 1,
      gap: 8,
      padding: 12,
      width: "100%",
    },
    bankInfoRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    bankInfoLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    bankInfoValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    bankInfoHighlight: {
      color: "#0D9488",
      fontSize: 15,
      fontWeight: "900",
    },
    bankInfoCode: {
      backgroundColor: "#FEF3C7",
      borderRadius: 6,
      color: "#B45309",
      fontSize: 13,
      fontWeight: "900",
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    webhookHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    boldText: {
      color: colors.text,
      fontWeight: "800",
    },
    simulateButton: {
      alignItems: "center",
      backgroundColor: "#7C3AED",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 14,
      width: "100%",
    },
    simulateButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "800",
    },
  });
