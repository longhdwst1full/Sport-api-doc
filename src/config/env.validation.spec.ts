import 'reflect-metadata';
import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('applies safe defaults with database connectivity disabled', () => {
    const environment = validateEnvironment({});

    expect(environment.PORT).toBe(4000);
    expect(environment.DATABASE_ENABLED).toBe(false);
    expect(environment.AUTH_BYPASS).toBe(false);
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
