import { BaseAdminService } from '@/src/services/admin/base-admin.service';
import { ApiResponse } from '@/src/types/auth';
import { AdminAnalyticsOverviewApiItem, AdminUserApiItem } from '@/src/types/admin-api';

export class AdminAnalyticsService extends BaseAdminService {
  getOverview() {
    return this.request<ApiResponse<AdminAnalyticsOverviewApiItem>>(
      '/api/admin/analytics/overview',
      { method: 'GET' },
    );
  }

  getAllUsers() {
    return this.request<ApiResponse<AdminUserApiItem[]>>('/api/users', {
      method: 'GET',
    });
  }

  updateUserStatus(userId: number, status: 'ACTIVE' | 'BLOCKED' | 'DELETED') {
    return this.request<ApiResponse<AdminUserApiItem>>(
      `/api/admin/users/${userId}/status`,
      {
        body: JSON.stringify({ status }),
        method: 'PATCH',
      },
    );
  }

  updateUserPremium(userId: number, premium: boolean) {
    return this.request<ApiResponse<AdminUserApiItem>>(
      `/api/admin/users/${userId}/premium`,
      {
        body: JSON.stringify({ premium }),
        method: 'PATCH',
      },
    );
  }

  updateUserPlan(
    userId: number,
    planTier: 'FREE' | 'PLUS' | 'PRO',
    durationDays?: number,
  ) {
    return this.request<ApiResponse<AdminUserApiItem>>(
      `/api/admin/users/${userId}/plan`,
      {
        body: JSON.stringify({
          planTier,
          ...(durationDays != null ? { durationDays } : {}),
        }),
        method: 'PATCH',
      },
    );
  }

  updateUserVerified(userId: number, verified: boolean) {
    return this.request<ApiResponse<AdminUserApiItem>>(
      `/api/admin/users/${userId}/verified`,
      {
        body: JSON.stringify({ verified }),
        method: 'PATCH',
      },
    );
  }
}
