import { resolveMigrationExecution } from '../../scripts/migration-execution-policy.cjs';

describe('migration execution policy', () => {
  it('runs automatically for a Vercel production deployment', () => {
    expect(
      resolveMigrationExecution(['--deploy'], {
        DATABASE_ENABLED: 'true',
        VERCEL: '1',
        VERCEL_ENV: 'production',
      }),
    ).toEqual({ shouldRun: true, mode: 'deploy', reason: 'vercel-production' });
  });

  it('does not mutate the database during a local build', () => {
    expect(resolveMigrationExecution(['--deploy'], { DATABASE_ENABLED: 'true' })).toEqual({
      shouldRun: false,
      mode: 'deploy',
      reason: 'not-vercel',
    });
  });

  it('does not mutate the shared database from a preview deployment', () => {
    expect(
      resolveMigrationExecution(['--deploy'], {
        DATABASE_ENABLED: 'true',
        VERCEL: '1',
        VERCEL_ENV: 'preview',
      }),
    ).toEqual({ shouldRun: false, mode: 'deploy', reason: 'not-production' });
  });

  it('honors the deploy kill switch', () => {
    expect(
      resolveMigrationExecution(['--deploy'], {
        DATABASE_ENABLED: 'true',
        DB_MIGRATE_ON_DEPLOY: 'false',
        VERCEL: '1',
        VERCEL_ENV: 'production',
      }),
    ).toEqual({ shouldRun: false, mode: 'deploy', reason: 'deploy-disabled' });
  });

  it('preserves migrate-on-start and force behavior', () => {
    expect(
      resolveMigrationExecution([], {
        DATABASE_ENABLED: 'true',
        DB_MIGRATE_ON_START: 'false',
      }).shouldRun,
    ).toBe(false);
    expect(
      resolveMigrationExecution(['--force'], {
        DATABASE_ENABLED: 'true',
        DB_MIGRATE_ON_START: 'false',
      }).shouldRun,
    ).toBe(true);
  });
});
