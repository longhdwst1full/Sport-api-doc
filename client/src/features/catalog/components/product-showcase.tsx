'use client';

import Image from 'next/image';
import { ShoppingBag, Star } from 'lucide-react';
import { useListCatalogProducts } from '@/generated/api/storefront-catalog/storefront-catalog';
import { vndMoney } from '@/shared/format/money';

export function ProductShowcase() {
  const { data, isPending, isError } = useListCatalogProducts({ page: 1, limit: 8 });
  if (isPending)
    return <div className="rounded-3xl bg-white p-10 text-center">Đang tải sản phẩm…</div>;
  if (isError || !data)
    return <div className="rounded-3xl bg-red-50 p-10 text-red-700">Không thể tải sản phẩm.</div>;
  if (!data.items.length)
    return (
      <div className="rounded-3xl bg-white p-10 text-center text-stone-500">
        Chưa có sản phẩm phù hợp.
      </div>
    );

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {data.items.map((product) => (
        <article
          key={product.id}
          className="group overflow-hidden rounded-[28px] bg-white shadow-card"
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold">
              {product.tags[0] ?? product.category}
            </span>
          </div>
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
              {product.brand}
            </p>
            <h3 className="mt-2 min-h-14 text-lg font-bold">{product.name}</h3>
            <div className="mt-3 flex items-center gap-1 text-sm">
              <Star className="size-4 fill-amber-400 text-amber-400" /> {product.rating}{' '}
              <span className="text-stone-400">({product.reviewCount})</span>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <strong className="text-lg">{vndMoney.format(product.price)}</strong>
              <button
                aria-label={`Thêm ${product.name} vào giỏ`}
                className="grid size-11 place-items-center rounded-full bg-ink text-white transition hover:bg-brand-600"
              >
                <ShoppingBag className="size-5" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
