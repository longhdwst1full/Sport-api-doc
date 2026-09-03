import { yupResolver } from '@hookform/resolvers/yup';
import { KeyOutlined, LockOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import * as yup from 'yup';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAdminCurrentUserQueryKey, useChangeAdminPassword } from '@/generated/api/auth/auth';
import type { ChangePasswordDto } from '@/generated/api/auth/models';
import { getApiErrorMessage } from '@/lib/api/error';

const schema: yup.ObjectSchema<ChangePasswordDto & { confirmPassword: string }> = yup.object({
  currentPassword: yup.string().required('Nhập mật khẩu hiện tại').min(8).max(128),
  newPassword: yup
    .string()
    .required('Nhập mật khẩu mới')
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .max(128)
    .notOneOf([yup.ref('currentPassword')], 'Mật khẩu mới phải khác mật khẩu hiện tại'),
  confirmPassword: yup
    .string()
    .required('Nhập lại mật khẩu mới')
    .oneOf([yup.ref('newPassword')], 'Mật khẩu nhập lại chưa khớp'),
});

export function ChangePasswordPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<ChangePasswordDto & { confirmPassword: string }>({
    resolver: yupResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const changePassword = useChangeAdminPassword({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetAdminCurrentUserQueryKey() });
        void message.success('Đã đổi mật khẩu. Bạn có thể tiếp tục làm việc.');
        navigate('/', { replace: true });
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể đổi mật khẩu.')),
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-amber-500 text-xl text-white">
            <KeyOutlined />
          </div>
          <Typography.Title level={3} className="!mb-1">Đổi mật khẩu lần đầu</Typography.Title>
          <Typography.Text type="secondary">
            Tài khoản mới hoặc vừa được mở khóa phải đổi mật khẩu mặc định trước khi sử dụng.
          </Typography.Text>
        </div>
        <Form
          layout="vertical"
          onFinish={() => void form.handleSubmit(({ confirmPassword: _, ...data }) => {
            void _;
            changePassword.mutate({ data });
          })()}
        >
          {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((name) => (
            <Form.Item
              key={name}
              label={name === 'currentPassword' ? 'Mật khẩu hiện tại' : name === 'newPassword' ? 'Mật khẩu mới' : 'Nhập lại mật khẩu mới'}
              validateStatus={form.formState.errors[name] ? 'error' : undefined}
              help={form.formState.errors[name]?.message}
            >
              <Controller
                name={name}
                control={form.control}
                render={({ field }) => (
                  <Input.Password
                    {...field}
                    prefix={<LockOutlined />}
                    autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'}
                  />
                )}
              />
            </Form.Item>
          ))}
          <Button block type="primary" htmlType="submit" loading={changePassword.isPending}>
            Đổi mật khẩu và tiếp tục
          </Button>
        </Form>
      </Card>
    </main>
  );
}
