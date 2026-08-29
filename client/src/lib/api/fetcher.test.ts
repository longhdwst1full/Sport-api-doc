import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { apiFetcher } from './fetcher';

describe('apiFetcher', () => {
  it('passes generated query parameters to Axios', async () => {
    let request: InternalAxiosRequestConfig | undefined;
    const adapter: AxiosAdapter = async (config) => {
      request = config;
      return {
        config,
        data: { items: [] },
        headers: {},
        status: 200,
        statusText: 'OK',
      };
    };

    const result = await apiFetcher<{ items: unknown[] }>(
      {
        url: '/api/v1/catalog/products',
        method: 'GET',
        params: { page: 1, search: 'tạ tay' },
      },
      { adapter },
    );

    expect(result).toEqual({ items: [] });
    expect(request?.baseURL).toBe('http://localhost:4000');
    expect(request?.params).toEqual({ page: 1, search: 'tạ tay' });
    expect(request?.withCredentials).toBe(true);
  });
});
