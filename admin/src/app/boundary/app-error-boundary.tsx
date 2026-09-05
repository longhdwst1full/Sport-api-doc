import { Button, Result, Spin } from 'antd';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearAuthTokens } from '@/core/auth/auth-token.store';

export function AppBootSplash() {
  return (
    <div
      className="grid min-h-screen place-items-center bg-slate-50"
      aria-label="Đang tải ứng dụng"
    >
      <Spin size="large" />
    </div>
  );
}

interface AppErrorBoundaryState {
  error?: Error;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
          <Result
            status="500"
            title="Không thể tải trang quản trị"
            subTitle={
              import.meta.env.DEV
                ? this.state.error.message
                : 'Ứng dụng gặp lỗi khi tải dữ liệu hoặc giao diện. Hãy thử tải lại trang.'
            }
            extra={[
              <Button key="reload" type="primary" onClick={() => window.location.reload()}>
                Tải lại
              </Button>,
              <Button
                key="login"
                onClick={() => {
                  clearAuthTokens();
                  window.location.assign('/login');
                }}
              >
                Xóa phiên và đăng nhập lại
              </Button>,
            ]}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
