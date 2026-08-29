import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetcher } from './fetcher';

describe('apiFetcher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes request bodies for generated mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'product-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetcher<{ id: string }>({
      url: '/api/v1/admin/products',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { name: 'Tạ tay' },
    });

    expect(result).toEqual({ id: 'product-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/admin/products',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Tạ tay' }),
      }),
    );
  });
});
