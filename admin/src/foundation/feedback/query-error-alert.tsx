import { Alert, Button } from 'antd';
import { getApiErrorMessage } from '@/lib/api/error';

interface QueryErrorAlertProps {
  error?: unknown;
  retry?: () => void;
}

export function QueryErrorAlert({ error, retry }: QueryErrorAlertProps) {
  return (
    <Alert
      type="error"
      showIcon
      message="Không thể tải dữ liệu"
      description={getApiErrorMessage(
        error,
        'Kết nối hoặc dịch vụ đang có lỗi. Vui lòng thử lại.',
      )}
      action={retry ? <Button onClick={retry}>Thử lại</Button> : undefined}
    />
  );
}
