import 'reflect-metadata';
import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('applies development defaults with database connectivity disabled', () => {
    const environment = validateEnvironment({});

    expect(environment.PORT).toBe(4000);
    expect(environment.DATABASE_ENABLED).toBe(false);
    expect(environment.DB_MIGRATE_ON_START).toBe(true);
    expect(environment.APP_MODE).toBe('serve');
    expect(environment.CORS_ORIGINS).toBe('*');
    expect(environment.AUTH_BYPASS).toBe(true);
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
});
