export type ApiResponse<T> = {
  code: number;
  data: T;
  message: string;
  status: string;
  timestamp: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  avatarUrl: string;
  currentLevel: string;
  email: string;
  fullName: string;
  password: string;
  targetScore: number;
};

export type AuthUser = {
  arenaElo?: number;
  arenaLosses?: number;
  arenaWins?: number;
  authProvider: string;
  avatarUrl: string | null;
  bio?: string | null;
  createdAt: string;
  currentLevel: string;
  diamonds?: number;
  email: string;
  equippedAvatarId?: string | null;
  equippedFrameId?: string | null;
  fullName: string;
  id: number;
  learningXp?: number;
  level?: number;
  currentLevelMinXp?: number;
  nextLevelXp?: number;
  levelProgressPercent?: number;
  levelTitle?: string;
  premium: boolean;
  verified?: boolean;
  profileId: number;
  providerUserId: string | null;
  role: string;
  status: string;
  targetScore: number;
  totalStudyMinutes?: number;
  updatedAt: string;
  username?: string | null;
};

export type LoginSuccessData = {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn: number;
  tokenType: string;
  user: AuthUser;
};

export type LoginResponse = ApiResponse<LoginSuccessData>;

export type GoogleOAuthStatusData = {
  configured: boolean;
  redirectConfigured: boolean;
};

export type GoogleOAuthStatusResponse = ApiResponse<GoogleOAuthStatusData>;

export type RegisterResponse = ApiResponse<AuthUser>;
