/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logoutAdmin, useGetAdminCurrentUser } from '@/generated/api/auth/auth';
import type { CurrentUserDto } from '@/generated/api/auth/models';
import {
  clearAuthTokens,
  readAuthTokens,
  subscribeAuthTokens,
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
  const hasTokens = useSyncExternalStore(subscribeAuthTokens, hasStoredTokens, () => false);
  const developmentBypass =
    import.meta.env.DEV && (import.meta.env.VITE_DEV_BYPASS_PERMISSIONS ?? 'true') === 'true';
  const currentUserQuery = useGetAdminCurrentUser({
    query: { enabled: !developmentBypass && hasTokens, retry: false },
  });

  const signOut = async () => {
    const refreshToken = readAuthTokens()?.refreshToken;
    try {
      if (refreshToken) await logoutAdmin({ refreshToken });
    } finally {
      clearAuthTokens();
      queryClient.clear();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser: currentUserQuery.data,
        authenticated: developmentBypass || Boolean(currentUserQuery.data),
        loading: !developmentBypass && hasTokens && currentUserQuery.isPending,
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
