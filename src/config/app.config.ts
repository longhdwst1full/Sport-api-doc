import { registerAs } from '@nestjs/config';
import { AUTH_TOKEN_TRANSPORT } from '../modules/auth/auth.constants';

function splitCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default registerAs('app', () => ({
  environment: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: splitCsv(process.env.CORS_ORIGINS, ['*']),
  authBypass:
    (process.env.NODE_ENV ?? 'development') === 'development' &&
    (process.env.AUTH_BYPASS ?? 'false') === 'true',
  authTokenTransport:
    process.env.AUTH_TOKEN_TRANSPORT ?? AUTH_TOKEN_TRANSPORT.BODY,
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? 'development-only-change-this-jwt-secret',
    accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
    refreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2_592_000),
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
  rateLimit: {
    ttlMs: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
  },
}));
