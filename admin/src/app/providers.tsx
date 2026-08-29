import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { useState, type ReactNode } from 'react';
import { PermissionProvider } from '@/core/auth/permissions';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#16a56a',
            borderRadius: 12,
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        }}
      >
        <AntApp>
          <PermissionProvider>{children}</PermissionProvider>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
