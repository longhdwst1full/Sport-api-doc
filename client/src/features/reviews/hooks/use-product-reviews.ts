'use client';

import { useMemo } from 'react';
import { useListProductReviews } from '@/generated/api/reviews/reviews';

export function useProductReviews(productSlug: string) {
  const query = useListProductReviews(productSlug);
  const summary = useMemo(() => {
    const review = query.data?.items[0];
    if (!review || !query.data) return undefined;
    const comment = review.comments[0];

    return {
      averageRating: query.data.averageRating,
      content: review.content,
      customerLabel: review.customerDisplayName,
      purchaseLabel: review.verifiedPurchase ? 'Đã xác minh mua hàng' : 'Khách hàng',
      comment: comment
        ? {
            authorName: comment.authorName,
            content: comment.content,
          }
        : undefined,
    };
  }, [query.data]);

  return {
    summary,
    isPending: query.isPending,
    isError: query.isError,
  };
}
