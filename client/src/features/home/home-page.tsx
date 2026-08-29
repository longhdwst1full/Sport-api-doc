import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BenefitsStrip } from '@/widgets/benefits-strip/benefits-strip';
import { StorefrontLayout } from '@/layouts/storefront-layout';
import { SectionHeading } from '@/foundation/components/section-heading';
import { ProductShowcase } from '@/features/catalog/components/product-showcase';
import { ContentStories } from '@/features/content/components/content-stories';
import { ProductReviews } from '@/features/reviews/components/product-reviews';

export function HomePage() {
  return (
    <StorefrontLayout>
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
            <Link
              href="#products"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 font-bold text-white"
            >
              Khám phá sản phẩm <ArrowRight className="size-5" />
            </Link>
            <Link href="#stories" className="rounded-full border border-ink/20 px-7 py-4 font-bold">
              Xem hướng dẫn tập
            </Link>
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
      <BenefitsStrip />
      <section id="products" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <SectionHeading
          eyebrow="Được yêu thích"
          title="Thiết bị nổi bật"
          action={
            <Link href="/products" className="hidden items-center gap-2 font-bold md:flex">
              Xem tất cả <ArrowRight className="size-4" />
            </Link>
          }
        />
        <ProductShowcase />
      </section>
      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <ProductReviews />
      </section>
      <section id="stories" className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <SectionHeading eyebrow="Kiến thức luyện tập" title="Bài viết mới" />
        <ContentStories />
      </section>
    </StorefrontLayout>
  );
}
