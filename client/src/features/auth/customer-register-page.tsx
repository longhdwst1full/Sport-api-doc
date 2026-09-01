'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { useRegisterCustomer } from '@/generated/api/auth/auth';
import type { RegisterCustomerDto } from '@/generated/api/auth/models';
import { getCustomerAuthError } from './auth-error';
import { saveCustomerAuthTokens } from './auth-token.store';

const optionalIdentity = () => yup.string().trim().transform((value) => value || undefined).optional();
const schema: yup.ObjectSchema<RegisterCustomerDto> = yup
  .object({
    displayName: yup.string().trim().required('Nhập họ tên').max(255),
    email: optionalIdentity().email('Email không hợp lệ').max(255),
    phone: optionalIdentity().max(32),
    password: yup.string().required('Nhập mật khẩu').min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128),
  })
  .test('identity-required', 'Nhập email hoặc số điện thoại', function requireIdentity(value) {
    return Boolean(value.email || value.phone)
      || this.createError({ path: 'email', message: 'Nhập email hoặc số điện thoại' });
  });

export function CustomerRegisterPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState('');
  const form = useForm<RegisterCustomerDto>({
    resolver: yupResolver(schema),
    defaultValues: { displayName: '', email: '', phone: '', password: '' },
  });
  const register = useRegisterCustomer({
    mutation: {
      onSuccess: (tokens) => {
        saveCustomerAuthTokens(tokens);
        router.replace('/');
      },
      onError: (error) => setSubmitError(getCustomerAuthError(error, 'Đăng ký không thành công.')),
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl shadow-stone-200/70 sm:p-9">
        <Link href="/" className="text-sm font-bold text-brand-700">← DCTD SPORT</Link>
        <h1 className="mt-6 text-3xl font-black text-ink">Tạo tài khoản</h1>
        <p className="mt-2 text-sm text-stone-500">Cung cấp email, số điện thoại hoặc cả hai. V1 chưa yêu cầu OTP.</p>
        <form
          className="mt-7 grid gap-5 sm:grid-cols-2"
          onSubmit={form.handleSubmit((data) => {
            setSubmitError('');
            register.mutate({ data });
          })}
        >
          <label className="block text-sm font-bold text-ink sm:col-span-2">
            Họ và tên
            <input {...form.register('displayName')} autoComplete="name" className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            {form.formState.errors.displayName && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.displayName.message}</span>}
          </label>
          <label className="block text-sm font-bold text-ink">
            Email
            <input {...form.register('email')} type="email" autoComplete="email" className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            {form.formState.errors.email && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.email.message}</span>}
          </label>
          <label className="block text-sm font-bold text-ink">
            Số điện thoại Việt Nam
            <input {...form.register('phone')} type="tel" autoComplete="tel" placeholder="0912 345 678" className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            {form.formState.errors.phone && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.phone.message}</span>}
          </label>
          <label className="block text-sm font-bold text-ink sm:col-span-2">
            Mật khẩu
            <input {...form.register('password')} type="password" autoComplete="new-password" className="mt-2 w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            {form.formState.errors.password && <span className="mt-1 block text-xs text-red-600">{form.formState.errors.password.message}</span>}
          </label>
          {submitError && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">{submitError}</p>}
          <button type="submit" disabled={register.isPending} className="rounded-2xl bg-brand-600 px-5 py-3 font-extrabold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
            {register.isPending ? 'Đang tạo tài khoản…' : 'Đăng ký và đăng nhập'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-500">Đã có tài khoản? <Link href="/login" className="font-bold text-brand-700">Đăng nhập</Link></p>
      </section>
    </main>
  );
}
