import { ApiError } from '@/src/services/api.client';
import { login } from '@/src/services/auth.service';
import { LoginRequest, LoginResponse } from '@/src/types/auth';

export function hasAdminConsoleAccess(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'CONTENT_MANAGER';
}

export async function loginAdmin(
  credentials: LoginRequest
): Promise<LoginResponse> {
  const payload = await login(credentials);

  if (!hasAdminConsoleAccess(payload.data.user.role)) {
    throw new ApiError(
      'Tài khoản này không có quyền truy cập trang quản trị (yêu cầu ADMIN hoặc CONTENT_MANAGER).',
      '/api/auth/login',
      403,
      payload
    );
  }

  return payload;
}
