import type { ReactNode } from 'react';
import Link from 'next/link';
import { Dumbbell } from 'lucide-react';
import { SiteHeader } from '@/widgets/site-header/site-header';

export function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>{children}</main>
      <footer
        id="about"
        className="border-t border-white/10 bg-ink px-6 py-14 text-white lg:px-10"
      >
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3 text-xl font-black">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-400 text-ink"><Dumbbell className="size-5" /></span>
              DCTD SPORT
            </div>
            <p className="mt-5 max-w-md leading-7 text-white/60">Thiết bị tập luyện và đồ thể thao được tuyển chọn cho người Việt, từ góc tập tại nhà đến không gian chuyên nghiệp.</p>
          </div>
          <div>
            <h2 className="font-bold text-white">Mua sắm</h2>
            <div className="mt-4 grid gap-3 text-sm text-white/60">
              <Link className="hover:text-white" href="/#shop-by-sport">Theo môn thể thao</Link>
              <Link className="hover:text-white" href="/#products">Sản phẩm nổi bật</Link>
              <Link className="hover:text-white" href="/#stories">Hướng dẫn chọn hàng</Link>
            </div>
          </div>
          <div>
            <h2 className="font-bold text-white">Cam kết V1</h2>
            <ul className="mt-4 grid gap-3 text-sm text-white/60">
              <li>Giá thanh toán đã gồm VAT</li>
              <li>Một đơn giao từ một chi nhánh</li>
              <li>Hỗ trợ đổi trả có kiểm tra</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-6 text-xs text-white/40">© 2026 DCTD Sport. Nền tảng đang trong giai đoạn phát triển V1.</div>
      </footer>
    </div>
  );
}
