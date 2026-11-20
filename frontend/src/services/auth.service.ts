import { API_BASE_URL } from '@/src/config/env';
import { apiRequest, ApiError } from '@/src/services/api.client';
import {
  ApiResponse,
  GoogleOAuthStatusResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/src/types/auth';

function validateLoginResponse(payload: LoginResponse) {
  if (payload.data?.accessToken) {
    return payload;
  }

  throw new ApiError(
    'Dang nhap that bai. Response khong co accessToken.',
    '/api/auth/login'
  );
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const payload = await apiRequest<LoginResponse>('/api/auth/login', {
    body: JSON.stringify(credentials),
    method: 'POST',
  });

  return validateLoginResponse(payload);
}

function validateRegisterResponse(payload: RegisterResponse) {
  if (payload?.data) {
    return payload;
  }

  throw new ApiError(
    'Dang ky that bai. Response khong hop le.',
    '/api/auth/register'
  );
}

export async function register(
  payload: RegisterRequest
): Promise<RegisterResponse> {
  const response = await apiRequest<RegisterResponse>('/api/auth/register', {
    body: JSON.stringify(payload),
    method: 'POST',
  });

  return validateRegisterResponse(response);
}

export async function logout(
  accessToken: string,
  tokenType = 'Bearer'
): Promise<void> {
  await apiRequest<ApiResponse<null>>('/api/auth/logout', {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
    },
    method: 'POST',
  });
}

export async function refreshTokenSession(
  refreshToken: string
): Promise<LoginResponse> {
  const payload = await apiRequest<LoginResponse>('/api/auth/refresh', {
    body: JSON.stringify({ refreshToken }),
    method: 'POST',
  });

  return validateLoginResponse(payload);
}

export async function changePassword(
  accessToken: string,
  payload: { currentPassword: string; newPassword: string }
): Promise<ApiResponse<null>> {
  return apiRequest<ApiResponse<null>>('/api/auth/change-password', {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: 'POST',
  });
}

export async function getGoogleAuthStatus(): Promise<GoogleOAuthStatusResponse> {
  return apiRequest<GoogleOAuthStatusResponse>('/api/auth/google/status', {
    method: 'GET',
  });
}

export function buildGoogleAuthorizeUrl(clientRedirectUri: string): string {
  const base = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
  return `${base}/auth/google/authorize?redirect_uri=${encodeURIComponent(clientRedirectUri)}`;
}

export async function exchangeGoogleAuthCode(code: string): Promise<LoginResponse> {
  const payload = await apiRequest<LoginResponse>('/api/auth/google/exchange', {
    body: JSON.stringify({ code }),
    method: 'POST',
  });

  return validateLoginResponse(payload);
}

export async function loginWithGoogleTokens(payload: {
  idToken?: string;
  accessToken?: string;
}): Promise<LoginResponse> {
  const response = await apiRequest<LoginResponse>('/api/auth/google', {
    body: JSON.stringify(payload),
    method: 'POST',
  });

  return validateLoginResponse(response);
}
