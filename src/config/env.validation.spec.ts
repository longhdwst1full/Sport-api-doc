import 'reflect-metadata';
import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('applies deny-by-default development defaults with database connectivity disabled', () => {
    const environment = validateEnvironment({});

    expect(environment.PORT).toBe(4000);
    expect(environment.DATABASE_ENABLED).toBe(false);
    expect(environment.DB_MIGRATE_ON_START).toBe(true);
    expect(environment.DB_MIGRATE_ON_DEPLOY).toBe(true);
    expect(environment.APP_MODE).toBe('serve');
    expect(environment.CORS_ORIGINS).toBe('*');
    expect(environment.AUTH_BYPASS).toBe(false);
    expect(environment.TELEGRAM_BOT_ENABLED).toBe(false);
    expect(environment.CHECKOUT_RESERVATION_TTL_MINUTES).toBe(30);
    expect(environment.RESERVATION_EXPIRY_JOB_ENABLED).toBe(false);
    expect(environment.RESERVATION_EXPIRY_JOB_BATCH_SIZE).toBe(50);
    expect(environment.GUEST_CART_TTL_DAYS).toBe(30);
    expect(environment.SHIPPING_FREE_RADIUS_KM).toBe(10);
    expect(environment.SHIPPING_SMALL_MAX_WEIGHT_GRAMS).toBe(5000);
    expect(environment.SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS).toBe(20000);
    expect(environment.SHIPPING_SMALL_FEE_VND).toBe(50000);
    expect(environment.SHIPPING_MEDIUM_FEE_VND).toBe(100000);
    expect(environment.SHIPPING_LARGE_FEE_VND).toBe(200000);
    expect(environment.GHN_ENABLED).toBe(false);
    expect(environment.GHTK_ENABLED).toBe(false);
  });

  it('allows development to opt in to permission bypass explicitly', () => {
    const environment = validateEnvironment({ AUTH_BYPASS: 'true' });

    expect(environment.AUTH_BYPASS).toBe(true);
  });

  it('keeps production permission checks enabled when AUTH_BYPASS is omitted', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://admin.example.com',
      AUTH_TOKEN_TRANSPORT: 'COOKIE',
    });

    expect(environment.AUTH_BYPASS).toBe(false);
  });

  it('parses the deploy migration switch centrally', () => {
    const environment = validateEnvironment({ DB_MIGRATE_ON_DEPLOY: 'false' });

    expect(environment.DB_MIGRATE_ON_DEPLOY).toBe(false);
  });

  it('accepts a reservation TTL between 5 minutes and 24 hours', () => {
    expect(
      validateEnvironment({ CHECKOUT_RESERVATION_TTL_MINUTES: '45' })
        .CHECKOUT_RESERVATION_TTL_MINUTES,
    ).toBe(45);
  });

  it.each(['4', '1441', '30.5'])('rejects invalid reservation TTL %s', (value) => {
    expect(() =>
      validateEnvironment({ CHECKOUT_RESERVATION_TTL_MINUTES: value }),
    ).toThrow('CHECKOUT_RESERVATION_TTL_MINUTES');
  });

  it('requires an independent cron secret only when reservation expiry is enabled', () => {
    expect(() => validateEnvironment({ RESERVATION_EXPIRY_JOB_ENABLED: 'true' }))
      .toThrow('CRON_SECRET');
    expect(validateEnvironment({
      RESERVATION_EXPIRY_JOB_ENABLED: 'true',
      CRON_SECRET: 'a'.repeat(32),
    }).RESERVATION_EXPIRY_JOB_ENABLED).toBe(true);
  });

  it.each(['0', '366', '1.5'])('rejects invalid guest cart TTL %s', (value) => {
    expect(() => validateEnvironment({ GUEST_CART_TTL_DAYS: value })).toThrow(
      'GUEST_CART_TTL_DAYS',
    );
  });

  it('requires carrier credentials only when that carrier is enabled', () => {
    expect(() => validateEnvironment({ GHN_ENABLED: 'true' })).toThrow('GHN_API_URL');
    expect(() => validateEnvironment({ GHTK_ENABLED: 'true' })).toThrow('GHTK_API_URL');
  });

  it('rejects overlapping default shipping weight tiers', () => {
    expect(() => validateEnvironment({
      SHIPPING_SMALL_MAX_WEIGHT_GRAMS: '20000',
      SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS: '5000',
    })).toThrow('SHIPPING_SMALL_MAX_WEIGHT_GRAMS must be less');
  });

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      validateEnvironment({ NODE_ENV: 'production', AUTH_BYPASS: 'false', CORS_ORIGINS: '*' }),
    ).toThrow('CORS_ORIGINS cannot contain * in production');
  });

  it('rejects authorization bypass in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        AUTH_BYPASS: 'true',
        CORS_ORIGINS: 'https://admin.example.com',
      }),
    ).toThrow('AUTH_BYPASS must be false in production');
  });

  it('requires a PostgreSQL URL when database connectivity is enabled', () => {
    expect(() => validateEnvironment({ DATABASE_ENABLED: 'true' })).toThrow(
      'DATABASE_URL must be a PostgreSQL URL',
    );
  });

  it('requires a direct migration URL independently from the pooled runtime URL', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_ENABLED: 'true',
        DATABASE_URL: 'postgresql://runtime-pool/postgres',
      }),
    ).toThrow('DIRECT_URL must be a PostgreSQL URL');
  });

  it('requires all Telegram secrets when the command bot is enabled', () => {
    expect(() => validateEnvironment({ TELEGRAM_BOT_ENABLED: 'true' })).toThrow(
      'TELEGRAM_BOT_TOKEN is invalid',
    );
  });

  it('accepts a complete Telegram webhook configuration', () => {
    const environment = validateEnvironment({
      TELEGRAM_BOT_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: '123456789:test_token',
      TELEGRAM_ALLOWED_USER_ID: '5333290241',
      TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
    });

    expect(environment.TELEGRAM_BOT_ENABLED).toBe(true);
    expect(environment.TELEGRAM_ALLOWED_USER_ID).toBe('5333290241');
  });
});
