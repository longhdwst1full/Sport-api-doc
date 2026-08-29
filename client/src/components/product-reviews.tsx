'use client';

import { MessageCircle, Star } from 'lucide-react';
import { useListProductReviews } from '@/generated/api/storefront-reviews/storefront-reviews';

export function ProductReviews() {
  const query = useListProductReviews('may-chay-bo-dctd-pro-x1');
  if (!query.data?.items.length) return null;
  const review = query.data.items[0];

  return (
    <div className="grid gap-8 rounded-[36px] bg-ink p-8 text-white md:grid-cols-[.7fr_1.3fr] md:p-12">
      <div>
        <MessageCircle className="size-10 text-brand-500" />
        <p className="mt-5 text-5xl font-extrabold">{query.data.averageRating}/5</p>
        <div className="mt-3 flex gap-1 text-amber-400">
          {Array.from({ length: 5 }, (_, index) => (
            <Star key={index} className="size-5 fill-current" />
          ))}
        </div>
        <p className="mt-3 text-sm text-white/60">Đánh giá từ khách đã mua</p>
      </div>
      <blockquote>
        <p className="text-2xl font-bold leading-relaxed">“{review.content}”</p>
        <footer className="mt-6 text-sm text-white/70">
          {review.customerDisplayName} ·{' '}
          {review.verifiedPurchase ? 'Đã xác minh mua hàng' : 'Khách hàng'}
        </footer>
        {review.comments[0] && (
          <p className="mt-5 rounded-2xl bg-white/10 p-4 text-sm">
            <strong>{review.comments[0].authorName}:</strong> {review.comments[0].content}
          </p>
        )}
      </blockquote>
    </div>
  );
}
