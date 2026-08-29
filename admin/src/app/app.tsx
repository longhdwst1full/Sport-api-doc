import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppBootSplash, AppErrorBoundary } from '@/app/boundary/app-error-boundary';
import { AppRoutes } from '@/app/router/app-routes';

export function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<AppBootSplash />}>
          <AppRoutes />
        </Suspense>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
