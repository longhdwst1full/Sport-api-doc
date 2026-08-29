import type { ReactNode } from 'react';
import { SiteHeader } from '@/widgets/site-header/site-header';

export function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>{children}</main>
      <footer
        id="about"
        className="border-t border-ink/10 bg-white px-6 py-10 text-center text-sm text-stone-500"
      >
        DCTD Sport · Thiết bị tập luyện và đồ thể thao chính hãng
      </footer>
    </div>
  );
}
