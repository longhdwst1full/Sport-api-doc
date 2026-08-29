'use client';

import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { useListPublishedPosts } from '@/generated/api/storefront-content/storefront-content';

export function ContentStories() {
  const query = useListPublishedPosts();
  if (query.isPending) return <div className="h-72 animate-pulse rounded-[32px] bg-white" />;
  if (!query.data?.items.length) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {query.data.items.map((post) => (
        <article
          key={post.id}
          className="group grid overflow-hidden rounded-[32px] bg-white md:grid-cols-[.9fr_1.1fr]"
        >
          <div className="relative min-h-64 overflow-hidden">
            <Image
              src={post.coverUrl}
              alt={post.title}
              fill
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          </div>
          <div className="flex flex-col justify-between p-7">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-brand-600">
                {post.postType.replaceAll('_', ' ')}
              </p>
              <h3 className="mt-3 text-2xl font-extrabold">{post.title}</h3>
              <p className="mt-3 leading-7 text-stone-600">{post.excerpt}</p>
            </div>
            <a
              href={`/stories/${post.slug}`}
              className="mt-6 inline-flex items-center gap-2 font-bold"
            >
              Đọc bài viết <ArrowUpRight className="size-4" />
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
