'use client';

import { MessageCircle, Star } from 'lucide-react';
import { useProductReviews } from '../hooks/use-product-reviews';

export function ProductReviews() {
  const { summary, isPending } = useProductReviews('may-chay-bo-dctd-pro-x1');
  if (isPending) return <div className="h-64 animate-pulse rounded-[36px] bg-ink/80" />;
  if (!summary) return null;

  return (
    <div className="grid gap-8 rounded-[36px] bg-ink p-8 text-white md:grid-cols-[.7fr_1.3fr] md:p-12">
      <div>
        <MessageCircle className="size-10 text-brand-500" />
        <p className="mt-5 text-5xl font-extrabold">{summary.averageRating}/5</p>
        <div className="mt-3 flex gap-1 text-amber-400">
          {Array.from({ length: 5 }, (_, index) => (
            <Star key={index} className="size-5 fill-current" />
          ))}
        </div>
        <p className="mt-3 text-sm text-white/60">Đánh giá từ khách đã mua</p>
      </div>
      <blockquote>
        <p className="text-2xl font-bold leading-relaxed">“{summary.content}”</p>
        <footer className="mt-6 text-sm text-white/70">
          {summary.customerLabel} · {summary.purchaseLabel}
        </footer>
        {summary.comment && (
          <p className="mt-5 rounded-2xl bg-white/10 p-4 text-sm">
            <strong>{summary.comment.authorName}:</strong> {summary.comment.content}
          </p>
        )}
      </blockquote>
    </div>
  );
}
