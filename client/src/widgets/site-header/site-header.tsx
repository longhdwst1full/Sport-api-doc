import Link from 'next/link';
import { Dumbbell, Menu, ShoppingBag } from 'lucide-react';

export function SiteHeader() {
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
        <button
          className="hidden rounded-full border border-ink/15 p-3 md:grid"
          aria-label="Mở giỏ hàng"
        >
          <ShoppingBag />
        </button>
        <button className="rounded-full border border-ink/15 p-3 md:hidden" aria-label="Mở menu">
          <Menu />
        </button>
      </div>
    </header>
  );
}
