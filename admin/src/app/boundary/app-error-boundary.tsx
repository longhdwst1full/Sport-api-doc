import { Button, Result, Spin } from 'antd';
import { Component, type ErrorInfo, type ReactNode } from 'react';

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

export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
          <Result
            status="500"
            title="Không thể tải trang quản trị"
            subTitle="Vui lòng tải lại. Nếu lỗi tiếp tục xảy ra, hãy gửi mã thời gian cho bộ phận kỹ thuật."
            extra={<Button onClick={() => window.location.reload()}>Tải lại</Button>}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
