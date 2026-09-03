import type { TokenPairDto } from '@/generated/api/auth/models';

const STORAGE_KEY = 'dctd.admin.auth.v1';
const cookieTransport = import.meta.env.VITE_AUTH_TOKEN_TRANSPORT === 'COOKIE';
let memoryTokens: TokenPairDto | undefined;
const listeners = new Set<() => void>();

function getStorage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.sessionStorage;
}

export function readAuthTokens(): TokenPairDto | undefined {
  if (memoryTokens) return memoryTokens;
  if (cookieTransport) return undefined;
  const raw = getStorage()?.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  try {
    memoryTokens = JSON.parse(raw) as TokenPairDto;
    return memoryTokens;
  } catch {
    getStorage()?.removeItem(STORAGE_KEY);
    return undefined;
  }
}

export function saveAuthTokens(tokens: TokenPairDto): void {
  memoryTokens = tokens;
  if (!cookieTransport) getStorage()?.setItem(STORAGE_KEY, JSON.stringify(tokens));
  listeners.forEach((listener) => listener());
}

export function usesAuthCookieTransport(): boolean {
  return cookieTransport;
}

export function clearAuthTokens(): void {
  memoryTokens = undefined;
  getStorage()?.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

export function getAccessToken(): string | undefined {
  return readAuthTokens()?.accessToken;
}

export function subscribeAuthTokens(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
