import axios, { type AxiosRequestConfig } from 'axios';

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

export async function apiFetcher<T>(
  config: AxiosRequestConfig,
  options: AxiosRequestConfig = {},
): Promise<T> {
  try {
    const response = await apiClient.request<T>({
      ...config,
      ...options,
      headers: { ...config.headers, ...options.headers },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ApiError(error.response?.status ?? 0, error.response?.data);
    }
    throw error;
  }
}

export type ErrorType<Error> = ApiError<Error>;
export type BodyType<BodyData> = BodyData;
