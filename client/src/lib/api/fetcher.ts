import axios, { type AxiosRequestConfig } from 'axios';
import type { TokenPairDto } from '@/generated/api/auth/models';
import {
  clearCustomerAuthTokens,
  readCustomerAuthTokens,
  saveCustomerAuthTokens,
  usesCustomerAuthCookieTransport,
} from '../../features/auth/auth-token.store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError<T = unknown> extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: T,
  ) {
    super(status ? `API request failed with status ${status}` : 'API request failed');
    this.name = 'ApiError';
  }
}

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

let refreshPromise: Promise<TokenPairDto> | undefined;

async function rotateTokens(): Promise<TokenPairDto> {
  const refreshToken = readCustomerAuthTokens()?.refreshToken;
  if (!refreshToken && !usesCustomerAuthCookieTransport()) {
    throw new Error('No refresh token is available');
  }
  refreshPromise ??= axios
    .post<TokenPairDto>(
      '/api/v1/auth/refresh',
      refreshToken ? { refreshToken } : {},
      { baseURL: API_URL, withCredentials: true, headers: { Accept: 'application/json' } },
    )
    .then(({ data }) => {
      saveCustomerAuthTokens(data);
      return data;
    })
    .catch((error: unknown) => {
      clearCustomerAuthTokens();
      throw error;
    })
    .finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise;
}

export async function apiFetcher<T>(
  config: AxiosRequestConfig,
  options: AxiosRequestConfig = {},
): Promise<T> {
  const accessToken = readCustomerAuthTokens()?.accessToken;
  const requestConfig: AxiosRequestConfig = {
    ...config,
    ...options,
    headers: {
      ...config.headers,
      ...options.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  };
  try {
    const response = await apiClient.request<T>(requestConfig);
    return response.data;
  } catch (error) {
    const isAuthEndpoint = String(config.url ?? '').includes('/auth/');
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      accessToken &&
      !isAuthEndpoint
    ) {
      const tokens = await rotateTokens();
      const response = await apiClient.request<T>({
        ...requestConfig,
        headers: { ...requestConfig.headers, Authorization: `Bearer ${tokens.accessToken}` },
      });
      return response.data;
    }
    if (axios.isAxiosError(error)) {
      throw new ApiError(error.response?.status ?? 0, error.response?.data);
    }
    throw error;
  }
}

export type ErrorType<Error> = ApiError<Error>;
export type BodyType<BodyData> = BodyData;
