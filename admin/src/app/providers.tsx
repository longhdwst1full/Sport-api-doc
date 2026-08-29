import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { useState, type ReactNode } from 'react';
import { createAdminQueryClient } from '@/app/config/query-client';
import { ADMIN_THEME } from '@/app/config/theme';
import { PermissionProvider } from '@/core/auth/permissions';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAdminQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={ADMIN_THEME}>
        <AntApp>
          <PermissionProvider>{children}</PermissionProvider>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
