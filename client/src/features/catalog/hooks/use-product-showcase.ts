'use client';

import { useMemo } from 'react';
import { useListCatalogProducts } from '@/generated/api/catalog/catalog';
import { vndMoney } from '@/shared/format/money';

export function useProductShowcase() {
  const query = useListCatalogProducts({ page: 1, limit: 8 });
  const products = useMemo(
    () =>
      (query.data?.items ?? []).map((product) => ({
        id: product.id,
        slug: product.slug,
        productType: product.productType,
        name: product.name,
        brand: product.brand ?? 'DCTD Sport',
        category: product.primaryCategory ?? 'Thiết bị thể thao',
        badge: product.primaryCategory ?? 'Sản phẩm mới',
        imageUrl: product.imageUrl ?? '/icon.svg',
        rating: 0,
        reviewCount: 0,
        price: Number(product.minPrice ?? 0),
        displayPrice: vndMoney.format(Number(product.minPrice ?? 0)),
      })),
    [query.data?.items],
  );

  return {
    products,
    isPending: query.isPending,
    isError: query.isError,
  };
}
