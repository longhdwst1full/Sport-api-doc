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
  checkout: {
    reservationTtlMinutes: Number(process.env.CHECKOUT_RESERVATION_TTL_MINUTES ?? 30),
  },
  cart: {
    guestTtlDays: Number(process.env.GUEST_CART_TTL_DAYS ?? 30),
  },
  shipping: {
    freeRadiusKm: Number(process.env.SHIPPING_FREE_RADIUS_KM ?? 10),
    providerTimeoutMs: Number(process.env.SHIPPING_PROVIDER_TIMEOUT_MS ?? 5_000),
    defaultRates: {
      smallMaxWeightGrams: Number(process.env.SHIPPING_SMALL_MAX_WEIGHT_GRAMS ?? 5_000),
      mediumMaxWeightGrams: Number(process.env.SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS ?? 20_000),
      smallFeeVnd: Number(process.env.SHIPPING_SMALL_FEE_VND ?? 50_000),
      mediumFeeVnd: Number(process.env.SHIPPING_MEDIUM_FEE_VND ?? 100_000),
      largeFeeVnd: Number(process.env.SHIPPING_LARGE_FEE_VND ?? 200_000),
    },
    ghn: {
      enabled: process.env.GHN_ENABLED === 'true',
      apiUrl:
        process.env.GHN_API_URL ??
        'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
      token: process.env.GHN_TOKEN,
      shopId: process.env.GHN_SHOP_ID,
    },
    ghtk: {
      enabled: process.env.GHTK_ENABLED === 'true',
      apiUrl:
        process.env.GHTK_API_URL ??
        'https://services.giaohangtietkiem.vn/services/shipment/fee',
      token: process.env.GHTK_TOKEN,
    },
  },
}));
