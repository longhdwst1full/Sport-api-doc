import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  Dumbbell,
  Footprints,
  Goal,
  HeartPulse,
  MoveUpRight,
  Trophy,
} from 'lucide-react';
import { BenefitsStrip } from '@/widgets/benefits-strip/benefits-strip';
import { StorefrontLayout } from '@/layouts/storefront-layout';
import { SectionHeading } from '@/foundation/components/section-heading';
import { ProductShowcase } from '@/features/catalog/components/product-showcase';
import { ContentStories } from '@/features/content/components/content-stories';
import { ProductReviews } from '@/features/reviews/components/product-reviews';

const SPORT_CATEGORIES = [
  {
    title: 'Gym & Fitness',
    description: 'Tạ, ghế tập và phụ kiện',
    image: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=900&q=85',
    icon: Dumbbell,
  },
  {
    title: 'Chạy bộ',
    description: 'Trang bị cho từng cung đường',
    image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=900&q=85',
    icon: Footprints,
  },
  {
    title: 'Bóng đá',
    description: 'Bóng, giày và đồ tập',
    image: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=900&q=85',
    icon: Goal,
  },
  {
    title: 'Yoga & Phục hồi',
    description: 'Tập đúng, hồi phục tốt',
    image: 'https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=900&q=85',
    icon: HeartPulse,
  },
] as const;

export function HomePage() {
  return (
    <StorefrontLayout>
      <section className="px-4 pb-6 sm:px-6 lg:px-8">
        <div className="relative mx-auto min-h-[620px] max-w-[1480px] overflow-hidden rounded-[28px] bg-ink text-white sm:rounded-[40px]">
          <Image
            src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2000&q=90"
            alt="Không gian tập luyện với thiết bị gym hiện đại"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/10" />
          <div className="relative z-10 flex min-h-[620px] max-w-4xl flex-col justify-center px-6 py-16 sm:px-12 lg:px-20">
            <p className="mb-6 flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.2em] backdrop-blur">
              <BadgeCheck className="size-4 text-emerald-300" /> Thiết bị chính hãng · Giá đã gồm VAT
            </p>
            <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.05em] sm:text-6xl lg:text-[84px]">
              Xây không gian tập <span className="text-emerald-400">đúng chất bạn.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-white/75 sm:text-xl sm:leading-8">
              Từ một góc tập tại nhà đến phòng gym hoàn chỉnh — chọn đúng thiết bị, đúng mục tiêu
              và nhận hàng từ chi nhánh gần nhất.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="#products"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-7 py-4 font-extrabold text-ink transition hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Mua sắm ngay <ArrowRight className="size-5" />
              </Link>
              <Link
                href="#shop-by-sport"
                className="rounded-full border border-white/35 bg-white/5 px-7 py-4 font-bold backdrop-blur transition hover:bg-white/15"
              >
                Chọn theo môn tập
              </Link>
            </div>
            <div className="mt-12 grid max-w-2xl grid-cols-3 divide-x divide-white/20 border-t border-white/20 pt-6">
              <div className="pr-4"><strong className="block text-2xl">1–1</strong><span className="text-xs text-white/60 sm:text-sm">Chi nhánh · kho</span></div>
              <div className="px-4"><strong className="block text-2xl">100%</strong><span className="text-xs text-white/60 sm:text-sm">Giá gồm VAT</span></div>
              <div className="pl-4"><strong className="block text-2xl">7 ngày</strong><span className="text-xs text-white/60 sm:text-sm">Hỗ trợ mỗi tuần</span></div>
            </div>
          </div>
          <div className="absolute bottom-6 right-6 z-10 hidden max-w-xs rounded-3xl border border-white/20 bg-white/90 p-5 text-ink shadow-2xl backdrop-blur lg:block">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-600">Gợi ý tuần này</p>
            <strong className="mt-2 block text-xl">Combo Home Gym</strong>
            <p className="mt-2 text-sm leading-6 text-stone-600">Một bộ cố định, đủ dụng cụ cho lịch tập toàn thân tại nhà.</p>
            <Link href="#products" className="mt-4 inline-flex items-center gap-1 text-sm font-bold">Xem combo <ChevronRight className="size-4" /></Link>
          </div>
        </div>
      </section>

      <BenefitsStrip />

      <section id="shop-by-sport" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <SectionHeading eyebrow="Tìm nhanh hơn" title="Bạn muốn tập gì hôm nay?" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SPORT_CATEGORIES.map(({ title, description, image, icon: Icon }, index) => (
            <Link
              key={title}
              href="#products"
              className={`group relative overflow-hidden rounded-[28px] bg-ink ${index === 0 ? 'sm:col-span-2 lg:col-span-1' : ''}`}
            >
              <div className="relative aspect-[4/5]">
                <Image
                  src={image}
                  alt={`Khám phá sản phẩm ${title}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-55"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <Icon className="mb-4 size-8 text-emerald-300" />
                  <h3 className="text-2xl font-black">{title}</h3>
                  <p className="mt-1 text-sm text-white/65">{description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold">Khám phá <MoveUpRight className="size-4 transition group-hover:translate-x-1 group-hover:-translate-y-1" /></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="products" className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
        <SectionHeading
          eyebrow="Tuyển chọn cho bạn"
          title="Sản phẩm nổi bật"
          action={
            <Link href="#stories" className="hidden items-center gap-2 font-bold md:flex">
              Xem hướng dẫn chọn hàng <ArrowRight className="size-4" />
            </Link>
          }
        />
        <ProductShowcase />
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="grid overflow-hidden rounded-[36px] bg-[#d9ff45] lg:grid-cols-[1fr_.9fr]">
          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
            <Trophy className="size-11" />
            <p className="mt-8 text-sm font-black uppercase tracking-[.22em]">DCTD Training Lab</p>
            <h2 className="mt-3 max-w-xl text-4xl font-black leading-tight sm:text-5xl">Không chỉ bán thiết bị. Chúng tôi giúp bạn chọn đúng.</h2>
            <p className="mt-5 max-w-xl leading-7 text-ink/70">Diện tích, mục tiêu, tần suất tập và ngân sách đều ảnh hưởng đến lựa chọn. Bắt đầu từ hướng dẫn thực tế trước khi đặt mua.</p>
            <Link href="#stories" className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-ink px-6 py-3.5 font-bold text-white">Xem kiến thức luyện tập <ArrowRight className="size-4" /></Link>
          </div>
          <div className="relative min-h-[360px] lg:min-h-[520px]">
            <Image
              src="https://images.unsplash.com/photo-1590487988256-9ed24133863e?auto=format&fit=crop&w=1200&q=85"
              alt="Huấn luyện viên tư vấn bài tập với thiết bị"
              fill
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover"
            />
          </div>
        </div>
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
