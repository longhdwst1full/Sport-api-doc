import { yupResolver } from '@hookform/resolvers/yup';
import { App, Form, Input, Modal } from 'antd';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import * as yup from 'yup';
import { getListAdminUsersQueryKey, useRevokeAdminUserRoleAssignment } from '@/generated/api/iam/iam';
import type { UserDto, UserRoleAssignmentDto } from '@/generated/api/iam/models';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api/error';

interface RevokeValues { reason: string }

const schema: yup.ObjectSchema<RevokeValues> = yup.object({
  reason: yup.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(255).required('Nhập lý do thu hồi'),
});

export function RoleAssignmentRevokeModal({
  target,
  onClose,
}: {
  target?: { user: UserDto; assignment: UserRoleAssignmentDto };
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { control, handleSubmit, reset, setError, formState: { errors } } = useForm<RevokeValues>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });
  const revoke = useRevokeAdminUserRoleAssignment({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        void message.success('Đã thu hồi vai trò và làm mới permission version.');
        reset();
        onClose();
      },
      onError: (error) => {
        Object.entries(getApiFieldErrors(error)).forEach(([field, fieldMessage]) => {
          if (field === 'reason') setError('reason', { message: fieldMessage });
        });
        void message.error(getApiErrorMessage(error, 'Không thể thu hồi vai trò.'));
      },
    },
  });

  useEffect(() => {
    if (!target) reset({ reason: '' });
  }, [reset, target]);

  const submit = handleSubmit((values) => {
    if (!target) return;
    revoke.mutate({
      userId: target.user.id,
      assignmentId: target.assignment.id,
      data: { reason: values.reason.trim() },
    });
  });

  return (
    <Modal
      open={Boolean(target)}
      title={`Thu hồi ${target?.assignment.roleCode ?? 'vai trò'}?`}
      okText="Thu hồi"
      okButtonProps={{ danger: true }}
      cancelText="Hủy"
      confirmLoading={revoke.isPending}
      onCancel={onClose}
      onOk={() => void submit()}
    >
      <p>
        Người dùng <strong>{target?.user.displayName}</strong> sẽ mất quyền của assignment này ngay khi
        permission version thay đổi. Bản ghi assignment được giữ lại ở trạng thái REVOKED để audit.
      </p>
      <Form layout="vertical">
        <Form.Item label="Lý do" required validateStatus={errors.reason ? 'error' : undefined} help={errors.reason?.message}>
          <Controller name="reason" control={control} render={({ field }) => <Input.TextArea {...field} rows={3} maxLength={255} showCount />} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
