import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ProductPurchasePanel } from '@/features/catalog/components/product-purchase-panel';
import { getCatalogProduct } from '@/generated/api/catalog/catalog';
import { ApiError } from '@/lib/api/fetcher';

export const revalidate = 0;

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let product;
  try {
    product = await getCatalogProduct(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1.15fr_0.85fr]">
      <section>
        <div className="relative aspect-[4/3] overflow-hidden rounded-[32px] bg-stone-100">
          <Image
            src={product.imageUrl ?? '/icon.svg'}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 58vw"
            className="object-cover"
          />
        </div>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-brand-600">
          {product.brand ?? 'DCTD Sport'} · {product.primaryCategory ?? 'Thiết bị thể thao'}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{product.name}</h1>
        {product.shortDescription && (
          <p className="mt-4 text-lg leading-8 text-stone-600">{product.shortDescription}</p>
        )}
      </section>
      <ProductPurchasePanel product={product} />
    </main>
  );
}
