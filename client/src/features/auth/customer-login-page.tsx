'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { useLoginCustomer } from '@/generated/api/auth/auth';
import type { LoginDto } from '@/generated/api/auth/models';
import { getCustomerAuthError } from './auth-error';
import { saveCustomerAuthTokens } from './auth-token.store';

const schema: yup.ObjectSchema<LoginDto> = yup.object({
  identifier: yup.string().trim().required('Nhập email hoặc số điện thoại').max(255),
  password: yup.string().required('Nhập mật khẩu').min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128),
});

export function CustomerLoginPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState('');
  const form = useForm<LoginDto>({
    resolver: yupResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });
  const login = useLoginCustomer({
    mutation: {
      onSuccess: (tokens) => {
        saveCustomerAuthTokens(tokens);
        router.replace('/');
      },
      onError: (error) => setSubmitError(getCustomerAuthError(error, 'Đăng nhập không thành công.')),
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl shadow-stone-200/70 sm:p-9">
        <Link href="/" className="text-sm font-bold text-brand-700">← DCTD SPORT</Link>
        <h1 className="mt-6 text-3xl font-black text-ink">Đăng nhập</h1>
        <p className="mt-2 text-sm text-stone-500">Dùng email hoặc số điện thoại đã đăng ký.</p>
        <form
          className="mt-7 space-y-5"
          onSubmit={form.handleSubmit((data) => {
            setSubmitError('');
            login.mutate({ data });
          })}
        >
          <label className="block text-sm font-bold text-ink">
            Email hoặc số điện thoại
            <input
              {...form.register('identifier')}
              autoComplete="username"
              className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              placeholder="email@example.com hoặc 0912 345 678"
            />
            {form.formState.errors.identifier && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.identifier.message}</span>}
          </label>
          <label className="block text-sm font-bold text-ink">
            Mật khẩu
            <input
              {...form.register('password')}
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            />
            {form.formState.errors.password && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.password.message}</span>}
          </label>
          {submitError && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p>}
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-2xl bg-brand-600 px-5 py-3 font-extrabold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-500">
          Chưa có tài khoản? <Link href="/register" className="font-bold text-brand-700">Đăng ký</Link>
        </p>
      </section>
    </main>
  );
}
