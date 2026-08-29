import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { createAdminQueryClient } from '@/app/config/query-client';
import { ADMIN_THEME } from '@/app/config/theme';
import { hydrateLayout } from '@/app/store/layout.slice';
import { readPersistedLayout } from '@/app/store/root.saga';
import { adminStore } from '@/app/store/store';
import { PermissionProvider } from '@/core/auth/permissions';
import { AuthProvider } from '@/core/auth/auth-context';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAdminQueryClient);

  useEffect(() => {
    const persistedLayout = readPersistedLayout();
    if (persistedLayout) adminStore.dispatch(hydrateLayout(persistedLayout));
  }, []);

  return (
    <ReduxProvider store={adminStore}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={ADMIN_THEME}>
          <AntApp>
            <AuthProvider>
              <PermissionProvider>{children}</PermissionProvider>
            </AuthProvider>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </ReduxProvider>
  );
}
