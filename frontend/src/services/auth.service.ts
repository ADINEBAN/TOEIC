import { apiRequest, ApiError } from '@/src/services/api.client';
import {
  ApiResponse,
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
