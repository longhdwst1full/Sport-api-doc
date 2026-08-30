import type { AxiosRequestConfig } from 'axios';
import { apiFetcher } from './fetcher';

export function apiFetcherWithOptions<T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> {
  return apiFetcher<T>(config, options);
}
