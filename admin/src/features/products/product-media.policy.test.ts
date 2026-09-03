import { describe, expect, it } from 'vitest';
import { reorderProductMedia } from './product-media.policy';

describe('product media ordering', () => {
  const media = [
    { id: 'a', mediaAssetId: 'asset-a', secureUrl: 'https://cdn/a', sortOrder: 0, isPrimary: true, status: 'ACTIVE' as const },
    { id: 'b', mediaAssetId: 'asset-b', secureUrl: 'https://cdn/b', sortOrder: 1, isPrimary: false, status: 'ACTIVE' as const },
  ];

  it('builds a complete deterministic replacement order', () => {
    expect(reorderProductMedia(media, 0, 1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
  });

  it('does not emit a mutation outside the list boundary', () => {
    expect(reorderProductMedia(media, 0, -1)).toBeUndefined();
  });
});
