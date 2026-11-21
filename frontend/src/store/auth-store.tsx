import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { ApiError } from '@/src/services/api.client';
import { refreshTokenSession } from '@/src/services/auth.service';
import { LoginSuccessData } from '@/src/types/auth';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  if (typeof atob === 'function') {
    return atob(padded);
  }
  let out = '';
  for (let i = 0; i < padded.length; i += 4) {
    const c1 = BASE64_CHARS.indexOf(padded[i]);
    const c2 = BASE64_CHARS.indexOf(padded[i + 1]);
    const c3 = padded[i + 2] === '=' ? -1 : BASE64_CHARS.indexOf(padded[i + 2]);
    const c4 = padded[i + 3] === '=' ? -1 : BASE64_CHARS.indexOf(padded[i + 3]);
    if (c1 < 0 || c2 < 0) break;
    out += String.fromCharCode((c1 << 2) | (c2 >> 4));
    if (c3 >= 0) out += String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2));
    if (c4 >= 0) out += String.fromCharCode(((c3 & 3) << 6) | c4);
  }
  return out;
}

function isJwtExpiringWithinMs(token: string, thresholdMs: number): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    const json = decodeBase64Url(parts[1]);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + thresholdMs;
  } catch {
    return false;
  }
}

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  tokenType: string | null;
  user: LoginSuccessData['user'] | null;
};

type AuthContextValue = {
  auth: AuthState;
  isHydrated: boolean;
  signIn: (payload: LoginSuccessData) => void;
  signOut: () => void;
  updateUserProfile: (user: LoginSuccessData['user']) => void;
};

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  expiresIn: null,
  tokenType: null,
  user: null,
};

export const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_STORAGE_KEY = 'toeic_trainer_auth';
const ACCESS_REFRESH_WINDOW_MS = 60 * 60 * 1000; // Proactively renew access token within 60m of expiry

async function readAuthFromStorage(): Promise<string | null> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY);
    } catch {
      return null;
    }
  }
  try {
    return await AsyncStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function saveAuthToStorage(state: AuthState): Promise<void> {
  const serialized = JSON.stringify(state);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage failure in private mode or blocked storage.
    }
    return;
  }
  try {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, serialized);
  } catch {
    // Ignore native storage errors safely.
  }
}

async function clearAuthStorage(): Promise<void> {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore storage failure in private mode or blocked storage.
    }
    return;
  }
  try {
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore native storage errors safely.
  }
}

function isExplicitAuthRejection(error: unknown): boolean {
  return error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(initialState);
  const [isHydrated, setIsHydrated] = useState(false);
  const refreshingRef = useRef(false);
  const authRef = useRef(auth);

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  const tryRefreshSession = useCallback(async (current: AuthState): Promise<boolean> => {
    if (!current.refreshToken || refreshingRef.current) {
      return false;
    }
    refreshingRef.current = true;
    try {
      const res = await refreshTokenSession(current.refreshToken);
      if (res.data?.accessToken) {
        const refreshed: AuthState = {
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken ?? current.refreshToken,
          expiresIn: res.data.expiresIn,
          tokenType: res.data.tokenType,
          user: res.data.user,
        };
        setAuth(refreshed);
        void saveAuthToStorage(refreshed);
        return true;
      }
      return false;
    } catch (err) {
      // Only clear saved session if server explicitly rejected/revoked the refresh token.
      // Transient offline or server hiccups never log the user out!
      if (isExplicitAuthRejection(err)) {
        void clearAuthStorage();
        setAuth(initialState);
      }
      return false;
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const raw = await readAuthFromStorage();
        if (!active || !raw) return;

        const parsed = JSON.parse(raw) as AuthState;
        if (parsed?.accessToken && parsed?.tokenType && parsed?.user) {
          setAuth(parsed);
          if (isJwtExpiringWithinMs(parsed.accessToken, ACCESS_REFRESH_WINDOW_MS) && parsed.refreshToken) {
            await tryRefreshSession(parsed);
          }
        }
      } catch {
        // Corrupt JSON in storage -> reset cleanly
        void clearAuthStorage();
      } finally {
        if (active) {
          setIsHydrated(true);
        }
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, [tryRefreshSession]);

  // Keep session seamlessly alive while user returns from background or uses the app long-term
  useEffect(() => {
    const checkAndRenew = () => {
      const curr = authRef.current;
      if (!curr.accessToken || !curr.refreshToken) return;
      if (isJwtExpiringWithinMs(curr.accessToken, ACCESS_REFRESH_WINDOW_MS)) {
        void tryRefreshSession(curr);
      }
    };

    const interval = setInterval(checkAndRenew, 5 * 60 * 1000);
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkAndRenew();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [tryRefreshSession]);

  const signIn = useCallback((payload: LoginSuccessData) => {
    const nextState: AuthState = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ?? null,
      expiresIn: payload.expiresIn,
      tokenType: payload.tokenType,
      user: payload.user,
    };

    setAuth(nextState);
    void saveAuthToStorage(nextState);
  }, []);

  const signOut = useCallback(() => {
    setAuth(initialState);
    void clearAuthStorage();
  }, []);

  const updateUserProfile = useCallback((user: LoginSuccessData['user']) => {
    setAuth((prev) => {
      try {
        if (prev.user && JSON.stringify(prev.user) === JSON.stringify(user)) {
          return prev;
        }
      } catch {
        // Fallback to updating state cleanly
      }
      const nextState: AuthState = { ...prev, user };
      void saveAuthToStorage(nextState);
      return nextState;
    });
  }, []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({ auth, isHydrated, signIn, signOut, updateUserProfile }),
    [auth, isHydrated, signIn, signOut, updateUserProfile],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
