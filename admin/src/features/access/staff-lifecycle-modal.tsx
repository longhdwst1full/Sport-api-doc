import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Input, Modal, Typography } from 'antd';
import { useEffect, useState } from 'react';
import {
  getListAdminUsersQueryKey,
  useLockAdminStaffUser,
  useUnlockAdminStaffUser,
} from '@/generated/api/iam/iam';
import type { UserDto } from '@/generated/api/iam/models';
import { getApiErrorMessage } from '@/lib/api/error';

export type StaffLifecycleAction = 'LOCK' | 'UNLOCK';

interface StaffLifecycleModalProps {
  action?: StaffLifecycleAction;
  user?: UserDto;
  onClose: () => void;
}

export function StaffLifecycleModal({ action, user, onClose }: StaffLifecycleModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const finish = async (successMessage: string) => {
    await queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    void message.success(successMessage);
    onClose();
  };
  const lockUser = useLockAdminStaffUser({
    mutation: {
      onSuccess: () => finish('Đã khóa tài khoản và thu hồi toàn bộ phiên đăng nhập.'),
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể khóa tài khoản.')),
    },
  });
  const unlockUser = useUnlockAdminStaffUser({
    mutation: {
      onSuccess: () => finish('Đã mở khóa và reset mật khẩu về Aa@123456.'),
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể mở khóa tài khoản.')),
    },
  });

  useEffect(() => {
    if (!action) setReason('');
  }, [action]);

  const isLock = action === 'LOCK';
  const pending = lockUser.isPending || unlockUser.isPending;
  const submit = () => {
    if (!user || !action) return;
    if (isLock) {
      lockUser.mutate({ userId: user.id, data: { reason: reason.trim() } });
      return;
    }
    unlockUser.mutate({ userId: user.id });
  };

  return (
    <Modal
      open={Boolean(action && user)}
      title={isLock ? 'Khóa tài khoản nhân viên' : 'Mở khóa tài khoản nhân viên'}
      okText={isLock ? 'Khóa tài khoản' : 'Mở khóa & reset mật khẩu'}
      okButtonProps={{ danger: isLock, disabled: isLock && reason.trim().length < 3 }}
      confirmLoading={pending}
      cancelText="Hủy"
      onCancel={onClose}
      onOk={submit}
      destroyOnHidden
    >
      <Typography.Paragraph>
        Nhân viên: <Typography.Text strong>{user?.displayName}</Typography.Text>
      </Typography.Paragraph>
      {isLock ? (
        <>
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            message="Tất cả phiên đăng nhập sẽ bị thu hồi ngay"
            description="Access token và refresh token hiện tại của nhân viên sẽ không còn sử dụng được."
          />
          <Typography.Text>Lý do khóa</Typography.Text>
          <Input.TextArea
            className="mt-2"
            value={reason}
            maxLength={255}
            showCount
            rows={3}
            placeholder="Nhập lý do (tối thiểu 3 ký tự)"
            onChange={(event) => setReason(event.target.value)}
          />
        </>
      ) : (
        <Alert
          type="warning"
          showIcon
          message="Mật khẩu sẽ được reset về Aa@123456"
          description="Các phiên cũ vẫn bị thu hồi; nhân viên phải đăng nhập lại bằng mật khẩu mặc định."
        />
      )}
    </Modal>
  );
}
