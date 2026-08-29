import { Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth-context';

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) {
    return <Spin fullscreen tip="Đang xác thực phiên làm việc..." />;
  }
  if (!auth.authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
