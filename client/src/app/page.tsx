import { ArrowRight, Dumbbell, Menu, ShieldCheck, Truck } from 'lucide-react';
import { ProductShowcase } from '@/components/product-showcase';
import { ContentStories } from '@/components/content-stories';
import { ProductReviews } from '@/components/product-reviews';

export default function HomePage() {
  return (
    <main>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a href="#" className="flex items-center gap-3 text-xl font-extrabold">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-white">
            <Dumbbell />
          </span>
          DCTD SPORT
        </a>
        <nav className="hidden items-center gap-8 text-sm font-semibold md:flex">
          <a href="#products">Sản phẩm</a>
          <a href="#benefits">Dịch vụ</a>
          <a href="#stories">Bài viết</a>
          <a href="#about">Giới thiệu</a>
        </nav>
        <button className="rounded-full border border-ink/15 p-3 md:hidden" aria-label="Mở menu">
          <Menu />
        </button>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 pb-16 pt-8 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pt-16">
        <div className="self-center">
          <p className="mb-6 inline-flex rounded-full bg-brand-50 px-4 py-2 text-sm font-bold text-brand-900">
            Trang bị tốt. Tập luyện bền.
          </p>
          <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.06] md:text-7xl">
            Không gian tập của bạn, <span className="text-brand-600">nâng cấp đúng cách.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-stone-600">
            Thiết bị được tuyển chọn, giá đã gồm VAT và giao từ chi nhánh gần bạn.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <a
              href="#products"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 font-bold text-white"
            >
              Khám phá sản phẩm <ArrowRight className="size-5" />
            </a>
            <a href="#stories" className="rounded-full border border-ink/20 px-7 py-4 font-bold">
              Xem hướng dẫn tập
            </a>
          </div>
        </div>
        <div className="relative min-h-[420px] overflow-hidden rounded-[44px] bg-[url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=85')] bg-cover bg-center">
          <div className="absolute inset-x-6 bottom-6 rounded-3xl bg-white/90 p-5 backdrop-blur">
            <strong>Combo tập gym tại nhà</strong>
            <p className="mt-1 text-sm text-stone-600">
              Bộ dụng cụ cố định, đủ cho buổi tập toàn thân.
            </p>
          </div>
        </div>
      </section>

      <section id="benefits" className="border-y border-ink/10 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:grid-cols-3 lg:px-10">
          {[
            [Truck, 'Giao từ kho gần nhất', 'Thời gian và phí giao rõ ràng.'],
            [ShieldCheck, 'Thanh toán an toàn', 'Chuyển khoản một lần, đối soát đầy đủ.'],
            [Dumbbell, 'Tư vấn đúng nhu cầu', 'Chọn thiết bị theo không gian và mục tiêu.'],
          ].map(([titleIcon, title, text], i) => {
            const Icon = titleIcon as typeof Truck;
            return (
              <div key={i} className="flex gap-4">
                <Icon className="mt-1 text-brand-600" />
                <div>
                  <h2 className="font-bold">{title as string}</h2>
                  <p className="mt-1 text-sm text-stone-500">{text as string}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="products" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <div className="mb-9 flex items-end justify-between">
          <div>
            <p className="font-bold uppercase tracking-[.2em] text-brand-600">Được yêu thích</p>
            <h2 className="mt-2 text-4xl font-extrabold">Thiết bị nổi bật</h2>
          </div>
          <a href="#" className="hidden items-center gap-2 font-bold md:flex">
            Xem tất cả <ArrowRight className="size-4" />
          </a>
        </div>
        <ProductShowcase />
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <ProductReviews />
      </section>

      <section id="stories" className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="mb-9">
          <p className="font-bold uppercase tracking-[.2em] text-brand-600">Kiến thức luyện tập</p>
          <h2 className="mt-2 text-4xl font-extrabold">Bài viết mới</h2>
        </div>
        <ContentStories />
      </section>
    </main>
  );
}
