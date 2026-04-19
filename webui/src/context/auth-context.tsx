/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Ontheia is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Ontheia.  If not, see <https://www.gnu.org/licenses/>.
 *
 * For commercial licensing inquiries, please see LICENSE-COMMERCIAL.md
 * or contact https://ontheia.ai
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

import {
  loginApi,
  signupApi,
  logoutApi,
  currentUserApi,
  acceptTosApi
} from '../lib/api';
import { useTranslation } from 'react-i18next';
import { localizeError } from '../lib/error-utils';

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  allow_admin_memory?: boolean;
  requires_tos?: boolean;
  avatar: {
    dataUrl: string | null;
    updatedAt: string | null;
  } | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  requiresTos: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  signup: (payload: { email: string; password: string; name?: string | null }) => Promise<{ status: string; message?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  acceptTos: () => Promise<void>;
};

const STORAGE_KEY = 'mcp.session.token';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readTokenFromStorage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to load session token', error);
    return null;
  }
}

function writeTokenToStorage(value: string | null) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to save session token', error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['auth', 'errors']);
  const [token, setToken] = useState<string | null>(() => readTokenFromStorage());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const storeToken = useCallback((value: string | null) => {
    writeTokenToStorage(value);
    setToken(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const response = await currentUserApi();
        if (cancelled) return;
        if (response && typeof response === 'object' && response.user) {
          setUser(response.user as AuthUser);
        } else {
          setUser(null);
        }
      } catch (error: any) {
        console.warn(t('sessionInvalid'), error);
        storeToken(null);
        setUser(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadUser();
    return () => {
      cancelled = true;
    };
  }, [token, storeToken]);

  const login = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
    try {
      const response = await loginApi({ email, password });
      if (
        !response ||
        typeof response !== 'object' ||
        typeof (response as any).token !== 'string'
      ) {
        throw new Error(t('invalidResponse'));
      }
      const authUser = (response as any).user as AuthUser | undefined;
      storeToken((response as any).token);
      setUser(authUser ?? null);
      setLoading(false);
    } catch (error: any) {
      const message = localizeError(error, t, 'loginFailed');
      const err = new Error(message);
      const code = error?.details?.error || error?.code;
      if (code) (err as any).code = code;
      throw err;
    }
  },
  [storeToken, t]
  );

  const signup = useCallback(
    async ({ email, password, name }: { email: string; password: string; name?: string | null }) => {
      try {
        const response = (await signupApi({ email, password, name })) as any;
        if (!response || typeof response !== 'object') {
          throw new Error(t('invalidResponse'));
        }

        if (response.status === 'pending') {
          return { status: 'pending', message: response.message };
        }

        if (typeof response.token !== 'string') {
          throw new Error(t('invalidResponse'));
        }

        const authUser = response.user as AuthUser | undefined;
        storeToken(response.token);
        setUser(authUser ?? null);
        setLoading(false);
        return { status: 'success' };
      } catch (error: any) {
        const message = localizeError(error, t, 'signupFailed');
        const err = new Error(message);
        const code = error?.details?.error || error?.code;
        if (code) (err as any).code = code;
        throw err;
      }
    },
    [storeToken, t]
  );

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch (error) {
      console.warn(t('logoutFailed'), error);
    } finally {
      storeToken(null);
      setUser(null);
      setLoading(false);
    }
  }, [storeToken, t]);

  const refresh = useCallback(async () => {
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const response = await currentUserApi();
      if (response && typeof response === 'object' && response.user) {
        setUser(response.user as AuthUser);
      }
    } catch (error) {
      console.warn(t('profileUpdateError'), error);
    }
  }, [token, t]);

  const acceptTos = useCallback(async () => {
    await acceptTosApi();
    setUser((prev) => prev ? { ...prev, requires_tos: false } : prev);
  }, []);

  const requiresTos = Boolean(token && user && user.requires_tos);

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      requiresTos,
      login,
      signup,
      logout,
      refresh,
      acceptTos,
    };
  }, [user, token, loading, requiresTos, login, signup, logout, refresh, acceptTos]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
