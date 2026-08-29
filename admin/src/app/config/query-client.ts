import { QueryClient } from '@tanstack/react-query';

export function createAdminQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        retry: (failureCount, error) => {
          const status = error instanceof Error && 'status' in error ? Number(error.status) : 0;
          return status >= 400 && status < 500 ? false : failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
