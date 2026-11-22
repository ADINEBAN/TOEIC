import { apiRequest } from "@/src/services/api.client";
import { ApiResponse } from "@/src/types/auth";

export type PlanOptionDto = {
  planCode: "PLUS_MONTHLY" | "PLUS_YEARLY" | "PRO_MONTHLY" | "PRO_YEARLY" | string;
  tier: "PLUS" | "PRO" | string;
  title: string;
  cycleLabel: string;
  durationDays: number;
  priceVnd: number;
  bonusDiamonds: number;
  badgeText: string;
  highlights: string[];
};

export type QuotaStatusDto = {
  featureKey: string;
  featureTitle: string;
  periodLabel: string;
  usedCount: number;
  limitCount: number;
  unlimited: boolean;
  locked: boolean;
};

export type SubscriptionPlansOverviewData = {
  currentTier: "FREE" | "PLUS" | "PRO" | string;
  planExpiresAt: string | null;
  verified: boolean;
  diamonds: number;
  plans: PlanOptionDto[];
  quotas: QuotaStatusDto[];
};

export type PaymentOrderData = {
  id: number;
  orderCode: string;
  planCode: string;
  planTier: string;
  durationDays: number;
  amountVnd: number;
  bonusDiamonds: number;
  status: "PENDING" | "PAID" | "EXPIRED" | string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  transferContent: string;
  qrImageUrl: string;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
};

function buildAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function getSubscriptionPlansOverview(
  accessToken: string
): Promise<SubscriptionPlansOverviewData> {
  const response = await apiRequest<ApiResponse<SubscriptionPlansOverviewData>>(
    "/api/payments/plans",
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    }
  );
  return response.data;
}

export async function createSubscriptionPaymentOrder(
  accessToken: string,
  planCode: string
): Promise<PaymentOrderData> {
  const response = await apiRequest<ApiResponse<PaymentOrderData>>(
    "/api/payments/orders",
    {
      body: JSON.stringify({ planCode }),
      headers: buildAuthHeaders(accessToken),
      method: "POST",
    }
  );
  return response.data;
}

export async function getPaymentOrderStatus(
  accessToken: string,
  orderCode: string
): Promise<PaymentOrderData> {
  const response = await apiRequest<ApiResponse<PaymentOrderData>>(
    `/api/payments/orders/${encodeURIComponent(orderCode)}`,
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    }
  );
  return response.data;
}

export async function getMyPaymentOrders(
  accessToken: string
): Promise<PaymentOrderData[]> {
  const response = await apiRequest<ApiResponse<PaymentOrderData[]>>(
    "/api/payments/orders/mine",
    {
      headers: buildAuthHeaders(accessToken),
      method: "GET",
    }
  );
  return response.data;
}

export async function simulateSepayOrderWebhook(
  accessToken: string,
  orderCode: string
): Promise<PaymentOrderData> {
  const response = await apiRequest<ApiResponse<PaymentOrderData>>(
    `/api/payments/orders/${encodeURIComponent(orderCode)}/simulate-webhook`,
    {
      body: JSON.stringify({}),
      headers: buildAuthHeaders(accessToken),
      method: "POST",
    }
  );
  return response.data;
}
