'use client';

import Link from 'next/link';
import { Dumbbell, Menu, ShoppingBag, UserRound } from 'lucide-react';
import { useAppSelector } from '@/app/store/hooks';

export function SiteHeader() {
  const cartQuantity = useAppSelector((state) =>
    state.cart.items.reduce((total, item) => total + item.quantity, 0),
  );
  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
      <Link href="/" className="flex items-center gap-3 text-xl font-extrabold">
        <span className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-white">
          <Dumbbell />
        </span>
        DCTD SPORT
      </Link>
      <nav
        className="hidden items-center gap-8 text-sm font-semibold md:flex"
        aria-label="Điều hướng chính"
      >
        <Link href="/#products">Sản phẩm</Link>
        <Link href="/#benefits">Dịch vụ</Link>
        <Link href="/#stories">Bài viết</Link>
        <Link href="/#about">Giới thiệu</Link>
      </nav>
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="hidden items-center gap-2 rounded-full border border-ink/15 px-4 py-3 text-sm font-bold md:flex"
        >
          <UserRound className="size-5" />
          Tài khoản
        </Link>
        <button
          className="relative hidden rounded-full border border-ink/15 p-3 md:grid"
          aria-label={`Mở giỏ hàng, ${cartQuantity} sản phẩm`}
        >
          <ShoppingBag />
          {cartQuantity > 0 && (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">
              {cartQuantity > 99 ? '99+' : cartQuantity}
            </span>
          )}
        </button>
        <button className="rounded-full border border-ink/15 p-3 md:hidden" aria-label="Mở menu">
          <Menu />
        </button>
      </div>
    </header>
  );
}
