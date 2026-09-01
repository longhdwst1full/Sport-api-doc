import type { TokenPairDto } from '@/generated/api/auth/models';

const STORAGE_KEY = 'dctd.storefront.auth.v1';
let memoryTokens: TokenPairDto | undefined;

function storage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.sessionStorage;
}

export function saveCustomerAuthTokens(tokens: TokenPairDto): void {
  memoryTokens = tokens;
  storage()?.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function readCustomerAuthTokens(): TokenPairDto | undefined {
  if (memoryTokens) return memoryTokens;
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  try {
    memoryTokens = JSON.parse(raw) as TokenPairDto;
    return memoryTokens;
  } catch {
    storage()?.removeItem(STORAGE_KEY);
    return undefined;
  }
}

export function clearCustomerAuthTokens(): void {
  memoryTokens = undefined;
  storage()?.removeItem(STORAGE_KEY);
}
