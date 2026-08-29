const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError<T = unknown> extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: T,
  ) {
    super(`API request failed with status ${status}`);
  }
}

type ApiRequestConfig = Omit<RequestInit, 'body'> & {
  url: string;
  params?: object;
  data?: unknown;
};

function buildUrl(path: string, params?: object): string {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) search.set(key, String(value));
  });
  const query = search.toString();
  return `${API_URL}${path}${query ? `?${query}` : ''}`;
}

export async function apiFetcher<T>(
  config: ApiRequestConfig,
  options: RequestInit = {},
): Promise<T> {
  const { url, params, data, ...request } = config;
  const response = await fetch(buildUrl(url, params), {
    ...request,
    ...options,
    credentials: 'include',
    headers: { Accept: 'application/json', ...request.headers, ...options.headers },
    body: data === undefined ? options.body : JSON.stringify(data),
  });
  const payload = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

export type ErrorType<Error> = ApiError<Error>;
export type BodyType<BodyData> = BodyData;
