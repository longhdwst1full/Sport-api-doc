import { ApiError } from '@/lib/api/fetcher';

interface ErrorPayload {
  message?: string;
  details?: Array<{ message?: string }>;
}

export function getCustomerAuthError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const payload = error.payload as ErrorPayload | undefined;
  return payload?.details?.[0]?.message ?? payload?.message ?? fallback;
}
