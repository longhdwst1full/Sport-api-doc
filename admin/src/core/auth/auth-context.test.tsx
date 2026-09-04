// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

const { useGetAdminCurrentUserMock } = vi.hoisted(() => ({
  useGetAdminCurrentUserMock: vi.fn(() => ({
    data: undefined,
    isPending: false,
  })),
}));

vi.mock('@/generated/api/auth/auth', () => ({
  logoutAdmin: vi.fn(),
  refreshAdminToken: vi.fn(),
  useGetAdminCurrentUser: useGetAdminCurrentUserMock,
}));

function AuthStateProbe() {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.authenticated ? 'authenticated' : 'anonymous'}</span>
      <span>{auth.developmentBypass ? 'permissions-open' : 'permissions-checked'}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('keeps authentication required when development permission bypass is enabled', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('anonymous')).toBeTruthy();
    expect(screen.getByText('permissions-open')).toBeTruthy();
  });
});
