/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logoutAdmin, refreshAdminToken, useGetAdminCurrentUser } from '@/generated/api/auth/auth';
import type { CurrentUserDto } from '@/generated/api/auth/models';
import {
  clearAuthTokens,
  readAuthTokens,
  subscribeAuthTokens,
  saveAuthTokens,
  usesAuthCookieTransport,
} from './auth-token.store';

interface AuthContextValue {
  currentUser?: CurrentUserDto;
  authenticated: boolean;
  loading: boolean;
  developmentBypass: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function hasStoredTokens(): boolean {
  return Boolean(readAuthTokens());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [restoringCookieSession, setRestoringCookieSession] = useState(usesAuthCookieTransport());
  const hasTokens = useSyncExternalStore(subscribeAuthTokens, hasStoredTokens, () => false);
  const developmentBypass =
    import.meta.env.DEV && (import.meta.env.VITE_DEV_BYPASS_PERMISSIONS ?? 'true') === 'true';
  const currentUserQuery = useGetAdminCurrentUser({
    query: { enabled: hasTokens, retry: false },
  });

  useEffect(() => {
    if (!usesAuthCookieTransport() || hasTokens) {
      setRestoringCookieSession(false);
      return;
    }
    let active = true;
    void refreshAdminToken({})
      .then((tokens) => {
        if (active) saveAuthTokens(tokens);
      })
      .catch(() => {
        if (active) clearAuthTokens();
      })
      .finally(() => {
        if (active) setRestoringCookieSession(false);
      });
    return () => {
      active = false;
    };
  }, [hasTokens]);

  const signOut = async () => {
    const refreshToken = readAuthTokens()?.refreshToken;
    try {
      if (refreshToken || usesAuthCookieTransport()) {
        await logoutAdmin(refreshToken ? { refreshToken } : {});
      }
    } finally {
      clearAuthTokens();
      queryClient.clear();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser: currentUserQuery.data,
        authenticated: Boolean(currentUserQuery.data),
        loading:
          restoringCookieSession || (hasTokens && currentUserQuery.isPending),
        developmentBypass,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
