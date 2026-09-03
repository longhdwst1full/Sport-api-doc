import { yupResolver } from '@hookform/resolvers/yup';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import * as yup from 'yup';
import { useLoginAdmin } from '@/generated/api/auth/auth';
import type { LoginDto } from '@/generated/api/auth/models';
import { saveAuthTokens } from '@/core/auth/auth-token.store';
import { useAuth } from '@/core/auth/auth-context';
import { getApiErrorMessage } from '@/lib/api/error';

const schema: yup.ObjectSchema<LoginDto> = yup.object({
  identifier: yup.string().trim().required('Vui lòng nhập email hoặc số điện thoại').max(255),
  password: yup.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').required('Vui lòng nhập mật khẩu'),
});

export function LoginPage() {
  const { message } = App.useApp();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginDto>({
    resolver: yupResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });
  const login = useLoginAdmin({
    mutation: {
      onSuccess: (tokens) => {
        saveAuthTokens(tokens);
        if (tokens.mustChangePassword) {
          navigate('/change-password', { replace: true });
          return;
        }
        const from = (location.state as { from?: string } | null)?.from ?? '/';
        navigate(from, { replace: true });
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Đăng nhập thất bại.')),
    },
  });

  if (auth.authenticated) {
    return <Navigate to={auth.currentUser?.mustChangePassword ? '/change-password' : '/'} replace />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-emerald-600 text-xl font-bold text-white">
            D
          </div>
          <Typography.Title level={3} className="!mb-1">DCTD Admin</Typography.Title>
          <Typography.Text type="secondary">Đăng nhập hệ thống quản trị</Typography.Text>
        </div>
        <Form layout="vertical" onFinish={() => void form.handleSubmit((data) => login.mutate({ data }))()}>
          <Form.Item
            label="Email hoặc số điện thoại"
            validateStatus={form.formState.errors.identifier ? 'error' : undefined}
            help={form.formState.errors.identifier?.message}
          >
            <Controller
              name="identifier"
              control={form.control}
              render={({ field }) => <Input {...field} prefix={<UserOutlined />} autoComplete="username" />}
            />
          </Form.Item>
          <Form.Item
            label="Mật khẩu"
            validateStatus={form.formState.errors.password ? 'error' : undefined}
            help={form.formState.errors.password?.message}
          >
            <Controller
              name="password"
              control={form.control}
              render={({ field }) => (
                <Input.Password {...field} prefix={<LockOutlined />} autoComplete="current-password" />
              )}
            />
          </Form.Item>
          <Button block type="primary" htmlType="submit" loading={login.isPending}>
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </main>
  );
}
