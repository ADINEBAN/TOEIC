import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { refreshTokenSession } from '@/src/services/auth.service';
import { LoginSuccessData } from '@/src/types/auth';

function isJwtExpiredOrExpiringSoon(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2 || typeof atob !== 'function') return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + 60_000;
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

function saveAuthToStorage(state: AuthState) {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failure in private mode or blocked storage.
  }
}

function clearAuthStorage() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failure in private mode or blocked storage.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(initialState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const hydrateTimer = setTimeout(() => {
      if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
        setIsHydrated(true);
        return;
      }

      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
          setIsHydrated(true);
          return;
        }

        const parsed = JSON.parse(raw) as AuthState;
        if (parsed?.accessToken && parsed?.tokenType && parsed?.user) {
          if (isJwtExpiredOrExpiringSoon(parsed.accessToken) && parsed.refreshToken) {
            setAuth(parsed);
            void refreshTokenSession(parsed.refreshToken)
              .then((res) => {
                if (res.data?.accessToken) {
                  const refreshed: AuthState = {
                    accessToken: res.data.accessToken,
                    refreshToken: res.data.refreshToken ?? parsed.refreshToken,
                    expiresIn: res.data.expiresIn,
                    tokenType: res.data.tokenType,
                    user: res.data.user,
                  };
                  setAuth(refreshed);
                  saveAuthToStorage(refreshed);
                }
              })
              .catch(() => {
                clearAuthStorage();
                setAuth(initialState);
              })
              .finally(() => {
                setIsHydrated(true);
              });
            return;
          }
          setAuth(parsed);
        }
      } catch {
        clearAuthStorage();
      }
      setIsHydrated(true);
    }, 0);

    return () => clearTimeout(hydrateTimer);
  }, []);

  const signIn = useCallback((payload: LoginSuccessData) => {
    const nextState: AuthState = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ?? null,
      expiresIn: payload.expiresIn,
      tokenType: payload.tokenType,
      user: payload.user,
    };

    setAuth(nextState);
    saveAuthToStorage(nextState);
  }, []);

  const signOut = useCallback(() => {
    setAuth(initialState);
    clearAuthStorage();
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
      saveAuthToStorage(nextState);
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
