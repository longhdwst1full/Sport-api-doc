'use client';

import { useCallback, useMemo } from 'react';
import { addCartItem } from '@/app/store/cart.slice';
import { useAppDispatch } from '@/app/store/hooks';
import { useListCatalogProducts } from '@/generated/api/catalog/catalog';
import { vndMoney } from '@/shared/format/money';

export function useProductShowcase() {
  const dispatch = useAppDispatch();
  const query = useListCatalogProducts({ page: 1, limit: 8 });
  const products = useMemo(
    () =>
      (query.data?.items ?? []).map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        badge: product.tags[0] ?? product.category,
        imageUrl: product.imageUrl,
        rating: product.rating,
        reviewCount: product.reviewCount,
        price: product.price,
        displayPrice: vndMoney.format(product.price),
      })),
    [query.data?.items],
  );

  const addToCart = useCallback(
    (product: (typeof products)[number]) => {
      dispatch(
        addCartItem({
          productId: product.id,
          name: product.name,
          price: product.price,
        }),
      );
    },
    [dispatch],
  );

  return {
    products,
    addToCart,
    isPending: query.isPending,
    isError: query.isError,
  };
}
