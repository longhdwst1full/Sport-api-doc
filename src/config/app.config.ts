import { registerAs } from '@nestjs/config';

function splitCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default registerAs('app', () => ({
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: splitCsv(process.env.CORS_ORIGINS, [
    'http://localhost:3000',
    'http://localhost:5173',
  ]),
  authBypass: process.env.AUTH_BYPASS === 'true',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  rateLimit: {
    ttlMs: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
  },
}));
