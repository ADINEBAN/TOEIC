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
import { showDiamondRewardToast } from "@/src/components/common/DiamondRewardToast";
import AppHeader from "@/src/components/user/AppHeader";
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
  redeemSubscriptionWithDiamonds,
  SubscriptionPlansOverviewData,
} from "@/src/services/subscription.service";
import { getMyProfile } from "@/src/services/user.service";
import { LiquidThemeColors, useAppTheme, useThemedStyles } from "@/src/store/theme-store";
import { useResponsiveLayout } from "@/src/utils/responsive";
import { alertCrossPlatform, confirmCrossPlatform } from "@/src/utils/web-dialog";

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

function computeProjectedExpiryVi(currentExpiryIso: string | null | undefined, addDays: number): string {
  const now = new Date();
  let base = now;
  if (currentExpiryIso) {
    const parsed = new Date(currentExpiryIso);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      base = parsed;
    }
  }
  const projected = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000);
  return projected.toLocaleDateString("vi-VN", {
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
  const { isDesktopWeb } = useResponsiveLayout();
  const colors = theme.colors;
  const styles = useThemedStyles(createStyles);

  const [loading, setLoading] = useState(true);
  const [creatingPlanCode, setCreatingPlanCode] = useState<string | null>(null);
  const [redeemingPlanCode, setRedeemingPlanCode] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
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
          if (refreshed.bonusDiamonds > 0) {
            showDiamondRewardToast(
              refreshed.bonusDiamonds,
              `Kích hoạt gói ${refreshed.planTier} (+${refreshed.durationDays} ngày)`,
            );
          }
        }
      } catch {
        // ignore transient polling error
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [activeOrder, auth.accessToken, loadSubscriptionData, updateUserProfile]);

  const startCreateOrder = async (plan: PlanOptionDto) => {
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

  const handleSelectPlan = (plan: PlanOptionDto) => {
    const activeTier = (overview?.currentTier ?? "FREE").toUpperCase();
    if (activeTier !== "FREE") {
      const projectedDate = computeProjectedExpiryVi(overview?.planExpiresAt, plan.durationDays);
      confirmCrossPlatform(
        `Xác nhận mua cộng dồn gói ${plan.tier}`,
        `Bạn đang dùng gói ${activeTier} (hạn hiện tại: ${formatDateTimeVi(overview?.planExpiresAt)}).\n\n` +
          `Khi thanh toán ${plan.title} (${formatVnd(plan.priceVnd)}):\n` +
          `• Cộng dồn thêm +${plan.durationDays} ngày (hạn mới: ${projectedDate})\n` +
          `• Cộng dồn thêm +${plan.bonusDiamonds} 💎 vào ví\n\n` +
          `Tạo mã VietQR MBBank ngay?`,
        () => {
          void startCreateOrder(plan);
        },
        "Tạo mã QR cộng dồn",
        "Hủy"
      );
      return;
    }
    void startCreateOrder(plan);
  };

  const executeDiamondRedeem = async (plan: PlanOptionDto) => {
    if (!auth.accessToken || !plan.diamondCost) return;
    try {
      setRedeemingPlanCode(plan.planCode);
      setErrorMessage(null);
      const updatedOverview = await redeemSubscriptionWithDiamonds(
        auth.accessToken,
        plan.planCode,
      );
      setOverview(updatedOverview);
      try {
        const profileRes = await getMyProfile(auth.accessToken);
        if (profileRes.data) {
          updateUserProfile(profileRes.data);
        }
      } catch {
        // ignore profile sync failure
      }
      alertCrossPlatform(
        `Đổi gói ${plan.tier} thành công 💎`,
        `Đã trừ ${plan.diamondCost.toLocaleString("vi-VN")} 💎 và mở khóa ${plan.title}. Hạn sử dụng mới: ${formatDateTimeVi(updatedOverview.planExpiresAt)}.`
      );
    } catch (error) {
      alertCrossPlatform(
        "Không thể đổi bằng Kim cương",
        extractErrorText(error, "Vui lòng thử lại.")
      );
    } finally {
      setRedeemingPlanCode(null);
    }
  };

  const handleRedeemWithDiamonds = (plan: PlanOptionDto) => {
    const cost = plan.diamondCost ?? 0;
    if (cost <= 0) return;
    const balance = overview?.diamonds ?? auth.user?.diamonds ?? 0;
    if (balance < cost) {
      const missing = cost - balance;
      alertCrossPlatform(
        "Chưa đủ kim cương để đổi",
        `Để đổi ${plan.title} bạn cần tích đủ ${cost.toLocaleString("vi-VN")} 💎.\n` +
          `Hiện có: ${balance.toLocaleString("vi-VN")} 💎 (cần thêm ${missing.toLocaleString("vi-VN")} 💎).\n\n` +
          `Hãy học bài, luyện đề, đấu Solo hoặc thanh toán VietQR để mở khóa ngay!`
      );
      return;
    }

    const projectedDate = computeProjectedExpiryVi(overview?.planExpiresAt, plan.durationDays);
    const remaining = balance - cost;
    confirmCrossPlatform(
      `Đổi ${cost.toLocaleString("vi-VN")} 💎 lấy ${plan.title}`,
      `Số dư hiện tại: ${balance.toLocaleString("vi-VN")} 💎\n` +
        `Số kim cương sẽ dùng: -${cost.toLocaleString("vi-VN")} 💎 (còn ${remaining.toLocaleString("vi-VN")} 💎)\n` +
        `Quyền lợi: Cộng +${plan.durationDays} ngày gói ${plan.tier} (đến ${projectedDate}).\n\n` +
        `Xác nhận đổi ngay?`,
      () => {
        void executeDiamondRedeem(plan);
      },
      `Đổi ngay (${cost.toLocaleString("vi-VN")} 💎)`,
      "Hủy"
    );
  };

  const handleCheckPaymentStatusNow = async () => {
    if (!auth.accessToken || !activeOrder) return;
    try {
      setCheckingPayment(true);
      const refreshed = await getPaymentOrderStatus(auth.accessToken, activeOrder.orderCode);
      setActiveOrder(refreshed);
      if (refreshed.status === "PAID") {
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
          "Thanh toán thành công 🎉",
          `Hệ thống đã nhận giao dịch chuyển khoản đơn ${refreshed.orderCode}. Gói ${refreshed.planTier} (+${refreshed.durationDays} ngày) và +${refreshed.bonusDiamonds} 💎 đã được cộng dồn!`
        );
      } else {
        alertCrossPlatform(
          "Đang chờ ngân hàng xác nhận",
          `Hệ thống đang chờ SePay gửi Webhook xác nhận giao dịch với nội dung ${refreshed.transferContent}. Ngay khi chuyển khoản thành công, gói sẽ tự động mở khóa.`
        );
      }
    } catch (error) {
      alertCrossPlatform(
        "Không thể kiểm tra trạng thái",
        extractErrorText(error, "Vui lòng thử lại.")
      );
    } finally {
      setCheckingPayment(false);
    }
  };

  const currentTier = (overview?.currentTier ?? "FREE").toUpperCase();
  const filteredPlans = (overview?.plans ?? []).filter((plan) =>
    selectedCycle === "MONTHLY" ? plan.durationDays <= 31 : plan.durationDays > 31
  );
  const paidOrders = orders.filter((o) => o.status === "PAID").slice(0, 3);

  return (
    <UserScreen hasTabDock={false}>
      <AppHeader
        leftIcon="chevron-back-outline"
        onLeftPress={() => router.back()}
        subtitle="MBBank VietQR tự động • Mua thêm tự động cộng dồn ngày"
        title="Gói thành viên PLUS & PRO"
      />

      {loading ? (
        <SurfaceCard style={styles.centerCard}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.helperText}>Đang tải thông tin gói...</Text>
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
                    size={14}
                    color="#FFFFFF"
                  />
                  <Text style={styles.tierBadgeText}>GÓI HIỆN TẠI: {currentTier}</Text>
                </View>
                {overview.verified ? (
                  <View style={styles.verifiedChip}>
                    <Ionicons name="checkmark-circle" size={13} color="#0284C7" />
                    <Text style={styles.verifiedChipText}>Verified</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.diamondPill}>
                <Text style={styles.diamondPillText}>💎 {overview.diamonds.toLocaleString("vi-VN")}</Text>
              </View>
            </View>

            <Text style={styles.expiryText}>
              {currentTier === "FREE"
                ? "Đang dùng gói FREE • Nâng cấp PLUS (10.000đ hoặc 10.000 💎) hoặc PRO (30.000đ hoặc 20.000 💎)."
                : `Hiệu lực đến ngày ${formatDateTimeVi(overview.planExpiresAt)} • Mua QR hoặc đổi 💎 sẽ tự động cộng dồn ngày.`}
            </Text>

            <View style={styles.compactQuotaGrid}>
              {overview.quotas.map((q) => (
                <View
                  key={q.featureKey}
                  style={[
                    styles.compactQuotaChip,
                    isDesktopWeb ? { flexBasis: "23%" } : null,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.compactQuotaName}>
                    {q.featureTitle.replace(" nhận diện đồ vật", "").replace(" phụ đề song ngữ", "")}
                  </Text>
                  <Text style={styles.compactQuotaVal}>
                    {q.unlimited
                      ? "∞ Không giới hạn"
                      : q.locked
                        ? "🔒 Gói PLUS/PRO"
                        : `${q.usedCount}/${q.limitCount} (${q.periodLabel.toLowerCase()})`}
                  </Text>
                </View>
              ))}
            </View>
          </SurfaceCard>

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
                Gói 30 ngày
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
                Gói 365 ngày (Tiết kiệm)
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.planCardsWrap,
              isDesktopWeb ? { alignItems: "stretch", flexDirection: "row", gap: 18 } : null,
            ]}
          >
            {filteredPlans.map((plan) => {
              const isPro = plan.tier === "PRO";
              const isBusy = creatingPlanCode === plan.planCode;
              const isRedeeming = redeemingPlanCode === plan.planCode;
              const isStacking = currentTier !== "FREE";
              const projectedExpiry = computeProjectedExpiryVi(overview.planExpiresAt, plan.durationDays);
              const diamondCost = plan.diamondCost ?? 0;
              const supportsDiamondRedeem = diamondCost > 0;
              const canAffordDiamonds = supportsDiamondRedeem && overview.diamonds >= diamondCost;
              const diamondRatio = supportsDiamondRedeem
                ? Math.max(0.03, Math.min(1, overview.diamonds / diamondCost))
                : 0;
              const missingDiamonds = Math.max(0, diamondCost - overview.diamonds);
              return (
                <SurfaceCard
                  key={plan.planCode}
                  style={[
                    styles.planCard,
                    isDesktopWeb ? { flex: 1, justifyContent: "space-between" } : null,
                    isPro ? styles.planCardPro : styles.planCardPlus,
                  ]}
                >
                  <View style={styles.planCardTop}>
                    <View>
                      <Text style={styles.planTitle}>{plan.title}</Text>
                      <View style={styles.priceRow}>
                        <Text style={[styles.priceValue, isPro && styles.priceValuePro]}>
                          {formatVnd(plan.priceVnd)}
                        </Text>
                        <Text style={styles.priceCycle}>/ {plan.cycleLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.bonusChip}>
                      <Text style={styles.bonusChipText}>
                        +{plan.bonusDiamonds.toLocaleString("vi-VN")} 💎
                      </Text>
                    </View>
                  </View>

                  <View style={styles.highlightList}>
                    {plan.highlights.slice(0, 3).map((line, index) => (
                      <View key={`${plan.planCode}-${index}`} style={styles.highlightRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={isPro ? "#7C3AED" : colors.primaryDark}
                        />
                        <Text style={styles.highlightText}>{line}</Text>
                      </View>
                    ))}
                  </View>

                  {isStacking ? (
                    <Text style={styles.stackingHint}>
                      ➕ Mua thêm sẽ cộng dồn hạn sử dụng đến {projectedExpiry} (+{plan.durationDays} ngày)
                    </Text>
                  ) : null}

                  <Pressable
                    style={[
                      styles.buyButton,
                      isPro ? styles.buyButtonPro : styles.buyButtonPlus,
                      (isBusy || isRedeeming) && styles.buttonDisabled,
                    ]}
                    disabled={isBusy || isRedeeming}
                    onPress={() => handleSelectPlan(plan)}
                  >
                    {isBusy ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="qr-code-outline" size={17} color="#FFFFFF" />
                        <Text style={styles.buyButtonText}>
                          {isStacking
                            ? `Mua cộng dồn (+${plan.durationDays} ngày) • ${formatVnd(plan.priceVnd)}`
                            : `Thanh toán VietQR • ${formatVnd(plan.priceVnd)}`}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  {supportsDiamondRedeem ? (
                    <View style={styles.diamondRedeemBox}>
                      <View style={styles.diamondRedeemTop}>
                        <Text style={styles.diamondRedeemLabel}>
                          💎 Đổi bằng Kim cương tích lũy
                        </Text>
                        <Text
                          style={[
                            styles.diamondRedeemCounter,
                            canAffordDiamonds && styles.diamondRedeemCounterReady,
                          ]}
                        >
                          {overview.diamonds.toLocaleString("vi-VN")} /{" "}
                          {diamondCost.toLocaleString("vi-VN")} 💎
                        </Text>
                      </View>
                      <View style={styles.diamondTrack}>
                        <View
                          style={[
                            styles.diamondFill,
                            canAffordDiamonds && styles.diamondFillReady,
                            { width: `${Math.round(diamondRatio * 100)}%` },
                          ]}
                        />
                      </View>
                      <Pressable
                        disabled={isBusy || isRedeeming}
                        onPress={() => handleRedeemWithDiamonds(plan)}
                        style={[
                          styles.diamondRedeemBtn,
                          canAffordDiamonds
                            ? styles.diamondRedeemBtnReady
                            : styles.diamondRedeemBtnPending,
                          (isBusy || isRedeeming) && styles.buttonDisabled,
                        ]}
                      >
                        {isRedeeming ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <Ionicons
                              name={canAffordDiamonds ? "diamond" : "lock-closed-outline"}
                              size={15}
                              color={canAffordDiamonds ? "#FFFFFF" : "#0369A1"}
                            />
                            <Text
                              style={[
                                styles.diamondRedeemBtnText,
                                !canAffordDiamonds && styles.diamondRedeemBtnTextPending,
                              ]}
                            >
                              {canAffordDiamonds
                                ? `Đổi ngay bằng ${diamondCost.toLocaleString("vi-VN")} 💎`
                                : `Cần thêm ${missingDiamonds.toLocaleString("vi-VN")} 💎 để đổi`}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ) : null}
                </SurfaceCard>
              );
            })}
          </View>

          {paidOrders.length > 0 ? (
            <>
              <SectionTitle title="Giao dịch đã thanh toán" />
              {paidOrders.map((ord) => (
                <Pressable
                  key={ord.orderCode}
                  onPress={() => setActiveOrder(ord)}
                >
                  <SurfaceCard style={styles.orderHistoryRow}>
                    <View style={styles.orderHistoryLeft}>
                      <Text style={styles.orderCodeText}>
                        #{ord.orderCode} • {ord.planTier} (+{ord.durationDays} ngày)
                      </Text>
                      <Text style={styles.orderMetaText}>
                        {formatVnd(ord.amountVnd)} • +{ord.bonusDiamonds} 💎 •{" "}
                        {formatDateTimeVi(ord.paidAt ?? ord.createdAt)}
                      </Text>
                    </View>
                    <View style={[styles.orderStatusBadge, styles.orderStatusPaid]}>
                      <Text style={styles.orderStatusText}>ĐÃ CỘNG DỒN</Text>
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
              <Text style={styles.modalTitle}>Quét mã VietQR MBBank tự động</Text>
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
                      ? `Đã nhận thanh toán! Gói ${activeOrder.planTier} (+${activeOrder.durationDays} ngày) đã được cộng dồn.`
                      : `Chờ chuyển khoản MBBank • Tự động cộng dồn +${activeOrder.durationDays} ngày & +${activeOrder.bonusDiamonds} 💎`}
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
                    <Text style={styles.bankInfoLabel}>Số tiền:</Text>
                    <Text style={styles.bankInfoHighlight}>{formatVnd(activeOrder.amountVnd)}</Text>
                  </View>
                  <View style={styles.bankInfoRow}>
                    <Text style={styles.bankInfoLabel}>Nội dung CK:</Text>
                    <Text style={styles.bankInfoCode}>{activeOrder.transferContent}</Text>
                  </View>
                </View>

                {activeOrder.status !== "PAID" ? (
                  <Pressable
                    style={[styles.simulateButton, checkingPayment && styles.buttonDisabled]}
                    disabled={checkingPayment}
                    onPress={handleCheckPaymentStatusNow}
                  >
                    {checkingPayment ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="refresh" size={16} color="#FFFFFF" />
                        <Text style={styles.simulateButtonText}>
                          Tôi đã chuyển khoản • Kiểm tra ngay
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
    centerCard: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 20,
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
      gap: 6,
    },
    tierBadge: {
      alignItems: "center",
      borderRadius: radius.pill,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 5,
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
      gap: 3,
      paddingHorizontal: 8,
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
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    diamondPillText: {
      color: colors.primaryDark,
      fontSize: 12.5,
      fontWeight: "800",
    },
    expiryText: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: "600",
      lineHeight: 18,
    },
    compactQuotaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 2,
    },
    compactQuotaChip: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: 1,
      flexBasis: "48%",
      flexGrow: 1,
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    compactQuotaName: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    compactQuotaVal: {
      color: colors.primaryDark,
      fontSize: 12,
      fontWeight: "800",
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
      paddingVertical: 9,
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
      gap: 12,
    },
    planCard: {
      borderWidth: 1.5,
      gap: 10,
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
    planTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
    },
    priceRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 4,
      marginTop: 2,
    },
    priceValue: {
      color: colors.primaryDark,
      fontSize: 22,
      fontWeight: "900",
    },
    priceValuePro: {
      color: "#6D28D9",
    },
    priceCycle: {
      color: colors.textMuted,
      fontSize: 12.5,
      fontWeight: "700",
    },
    bonusChip: {
      backgroundColor: "#FEF3C7",
      borderColor: "#F59E0B",
      borderRadius: radius.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    bonusChipText: {
      color: "#B45309",
      fontSize: 12,
      fontWeight: "800",
    },
    highlightList: {
      gap: 6,
    },
    highlightRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    highlightText: {
      color: colors.text,
      flex: 1,
      fontSize: 12.5,
      fontWeight: "600",
      lineHeight: 18,
    },
    stackingHint: {
      backgroundColor: "#F0FDF4",
      borderColor: "#BBF7D0",
      borderRadius: radius.md,
      borderWidth: 1,
      color: "#15803D",
      fontSize: 11.5,
      fontWeight: "700",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    buyButton: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 7,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 14,
    },
    buyButtonPlus: {
      backgroundColor: colors.primary,
    },
    buyButtonPro: {
      backgroundColor: "#7C3AED",
    },
    buyButtonText: {
      color: "#FFFFFF",
      fontSize: 13.5,
      fontWeight: "800",
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    diamondRedeemBox: {
      backgroundColor: "#F0F9FF",
      borderColor: "#BAE6FD",
      borderRadius: radius.md,
      borderWidth: 1,
      gap: 7,
      padding: 10,
    },
    diamondRedeemTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 6,
    },
    diamondRedeemLabel: {
      color: "#0369A1",
      fontSize: 11.5,
      fontWeight: "800",
    },
    diamondRedeemCounter: {
      color: "#0284C7",
      fontSize: 11.5,
      fontWeight: "900",
    },
    diamondRedeemCounterReady: {
      color: "#059669",
    },
    diamondTrack: {
      backgroundColor: "#E0F2FE",
      borderRadius: 99,
      height: 6,
      overflow: "hidden",
      width: "100%",
    },
    diamondFill: {
      backgroundColor: "#0EA5E9",
      borderRadius: 99,
      height: "100%",
    },
    diamondFillReady: {
      backgroundColor: "#10B981",
    },
    diamondRedeemBtn: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: 12,
    },
    diamondRedeemBtnReady: {
      backgroundColor: "#059669",
    },
    diamondRedeemBtnPending: {
      backgroundColor: "#E0F2FE",
      borderColor: "#7DD3FC",
      borderWidth: 1,
    },
    diamondRedeemBtnText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "800",
    },
    diamondRedeemBtnTextPending: {
      color: "#0369A1",
    },
    orderHistoryRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 10,
    },
    orderHistoryLeft: {
      flex: 1,
      gap: 2,
    },
    orderCodeText: {
      color: colors.text,
      fontSize: 12.5,
      fontWeight: "800",
    },
    orderMetaText: {
      color: colors.textMuted,
      fontSize: 11.5,
      fontWeight: "600",
    },
    orderStatusBadge: {
      borderRadius: radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    orderStatusPaid: {
      backgroundColor: "#DCFCE7",
    },
    orderStatusText: {
      color: "#15803D",
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
      maxHeight: "90%",
      maxWidth: 440,
      padding: 16,
      width: "100%",
    },
    modalHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 15.5,
      fontWeight: "900",
    },
    closeBtn: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      padding: 6,
    },
    modalBody: {
      alignItems: "center",
      gap: 10,
      paddingBottom: 6,
    },
    qrBox: {
      alignItems: "center",
      backgroundColor: "#FFFFFF",
      borderColor: colors.border,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      padding: 10,
    },
    qrImage: {
      height: 220,
      width: 220,
    },
    statusBanner: {
      alignItems: "center",
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 11,
      paddingVertical: 9,
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
      gap: 6,
      padding: 11,
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
      fontSize: 12.5,
      fontWeight: "800",
    },
    bankInfoHighlight: {
      color: "#0D9488",
      fontSize: 14.5,
      fontWeight: "900",
    },
    bankInfoCode: {
      backgroundColor: "#FEF3C7",
      borderRadius: 6,
      color: "#B45309",
      fontSize: 12.5,
      fontWeight: "900",
      paddingHorizontal: 8,
      paddingVertical: 2,
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
      fontSize: 12.5,
      fontWeight: "800",
    },
  });
