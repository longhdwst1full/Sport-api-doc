import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetcher } from './fetcher';

describe('apiFetcher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes generated query parameters and returns JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetcher<{ items: unknown[] }>({
      url: '/api/v1/catalog/products',
      method: 'GET',
      params: { page: 1, search: 'tạ tay' },
    });

    expect(result).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/catalog/products?page=1&search=t%E1%BA%A1+tay',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });
});
