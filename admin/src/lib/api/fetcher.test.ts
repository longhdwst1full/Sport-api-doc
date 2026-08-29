import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { apiFetcher } from './fetcher';
import { clearAuthTokens, saveAuthTokens } from '@/core/auth/auth-token.store';

describe('apiFetcher', () => {
  it('serializes request bodies for generated mutations', async () => {
    saveAuthTokens({
      accessToken: 'verified-access-token',
      refreshToken: 'refresh-token-long-enough-for-test',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    let request: InternalAxiosRequestConfig | undefined;
    const adapter: AxiosAdapter = async (config) => {
      request = config;
      return {
        config,
        data: { id: 'product-1' },
        headers: {},
        status: 201,
        statusText: 'Created',
      };
    };

    const result = await apiFetcher<{ id: string }>(
      {
        url: '/api/v1/admin/products',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { name: 'Tạ tay' },
      },
      { adapter },
    );

    expect(result).toEqual({ id: 'product-1' });
    expect(request?.baseURL).toBe('http://localhost:4000');
    expect(request?.method).toBe('post');
    expect(request?.data).toBe(JSON.stringify({ name: 'Tạ tay' }));
    expect(request?.headers.Authorization).toBe('Bearer verified-access-token');
    expect(request?.headers['x-permissions']).toBeUndefined();
    clearAuthTokens();
  });
});
