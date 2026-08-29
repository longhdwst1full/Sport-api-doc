'use client';

import { useMemo } from 'react';
import { useListPublishedPosts } from '@/generated/api/content/content';

export function useContentStories() {
  const query = useListPublishedPosts();
  const stories = useMemo(
    () =>
      (query.data?.items ?? []).map((post) => ({
        id: post.id,
        title: post.title,
        excerpt: post.excerpt,
        slug: post.slug,
        coverUrl: post.coverUrl,
        typeLabel: post.postType.replaceAll('_', ' '),
      })),
    [query.data?.items],
  );

  return {
    stories,
    isPending: query.isPending,
    isError: query.isError,
  };
}
