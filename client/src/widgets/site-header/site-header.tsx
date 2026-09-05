'use client';

import Link from 'next/link';
import { Dumbbell, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { useAppSelector } from '@/app/store/hooks';

export function SiteHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const cartQuantity = useAppSelector((state) =>
    state.cart.items.reduce((total, item) => total + item.quantity, 0),
  );
  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-cream/95 backdrop-blur-xl">
      <div className="bg-ink px-4 py-2 text-center text-[11px] font-bold uppercase tracking-[.16em] text-white/85 sm:text-xs">
        Giao từ kho gần nhất · Giá hiển thị đã gồm VAT
      </div>
      <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-5 lg:px-10">
        <Link href="/" className="flex items-center gap-3 text-lg font-black tracking-tight sm:text-xl">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Dumbbell className="size-5" />
          </span>
          DCTD SPORT
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-bold lg:flex" aria-label="Điều hướng chính">
          <Link className="transition hover:text-brand-600" href="/#shop-by-sport">Môn thể thao</Link>
          <Link className="transition hover:text-brand-600" href="/#products">Sản phẩm</Link>
          <Link className="transition hover:text-brand-600" href="/#benefits">Dịch vụ</Link>
          <Link className="transition hover:text-brand-600" href="/#stories">Kiến thức</Link>
          <Link className="transition hover:text-brand-600" href="/#about">Về DCTD</Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/#products" className="grid size-11 place-items-center rounded-full transition hover:bg-white" aria-label="Tìm sản phẩm">
            <Search className="size-5" />
          </Link>
          <Link href="/login" className="hidden size-11 place-items-center rounded-full transition hover:bg-white sm:grid" aria-label="Đăng nhập tài khoản">
            <UserRound className="size-5" />
          </Link>
          <button className="relative grid size-11 place-items-center rounded-full transition hover:bg-white" aria-label={`Giỏ hàng, ${cartQuantity} sản phẩm`}>
            <ShoppingBag className="size-5" />
            {cartQuantity > 0 && (
              <span className="absolute right-0 top-0 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {cartQuantity > 99 ? '99+' : cartQuantity}
              </span>
            )}
          </button>
          <button
            className="grid size-11 place-items-center rounded-full lg:hidden"
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <nav className="border-t border-ink/10 bg-cream px-5 py-5 lg:hidden" aria-label="Điều hướng di động">
          <div className="mx-auto grid max-w-7xl gap-1 text-base font-bold">
            {[
              ['Môn thể thao', '/#shop-by-sport'],
              ['Sản phẩm', '/#products'],
              ['Dịch vụ', '/#benefits'],
              ['Kiến thức', '/#stories'],
              ['Về DCTD', '/#about'],
              ['Đăng nhập', '/login'],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="rounded-xl px-3 py-3 hover:bg-white" onClick={() => setMobileMenuOpen(false)}>{label}</Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
