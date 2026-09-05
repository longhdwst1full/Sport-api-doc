import { ApiError } from './fetcher';

interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiErrorPayload>;
  return (
    typeof candidate.statusCode === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}

export function getApiErrorPayload(error: unknown): ApiErrorPayload | undefined {
  return error instanceof ApiError && isApiErrorPayload(error.payload) ? error.payload : undefined;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Có lỗi xảy ra. Vui lòng thử lại.',
): string {
  const payload = getApiErrorPayload(error);
  if (!payload) return error instanceof Error && error.message ? error.message : fallback;
  return payload.message;
}

export function getApiFieldErrors(error: unknown): Record<string, string> {
  const details = getApiErrorPayload(error)?.details ?? [];
  return Object.fromEntries(
    details
      .filter((detail): detail is ApiErrorDetail & { field: string } => Boolean(detail.field))
      .map((detail) => [detail.field, detail.message]),
  );
}
