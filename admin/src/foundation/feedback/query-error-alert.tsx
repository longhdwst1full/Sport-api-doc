import { Alert, Button } from 'antd';

export function QueryErrorAlert({ retry }: { retry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      message="Không thể tải dữ liệu"
      description="Kết nối hoặc dịch vụ đang có lỗi. Vui lòng thử lại."
      action={retry ? <Button onClick={retry}>Thử lại</Button> : undefined}
    />
  );
}
