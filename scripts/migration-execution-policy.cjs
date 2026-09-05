function resolveMigrationExecution(argv, environment) {
  const databaseEnabled = environment.DATABASE_ENABLED === 'true';
  const deployRequested = argv.includes('--deploy');

  if (!databaseEnabled) {
    return { shouldRun: false, mode: deployRequested ? 'deploy' : 'start', reason: 'database-disabled' };
  }

  if (deployRequested) {
    if (environment.VERCEL !== '1') {
      return { shouldRun: false, mode: 'deploy', reason: 'not-vercel' };
    }
    if (environment.VERCEL_ENV !== 'production') {
      return { shouldRun: false, mode: 'deploy', reason: 'not-production' };
    }
    if (environment.DB_MIGRATE_ON_DEPLOY === 'false') {
      return { shouldRun: false, mode: 'deploy', reason: 'deploy-disabled' };
    }
    return { shouldRun: true, mode: 'deploy', reason: 'vercel-production' };
  }

  const migrateOnStart = environment.DB_MIGRATE_ON_START !== 'false';
  const forced = argv.includes('--force') || environment.APP_MODE === 'migrate';
  return {
    shouldRun: migrateOnStart || forced,
    mode: forced ? 'forced' : 'start',
    reason: migrateOnStart || forced ? 'startup-enabled' : 'startup-disabled',
  };
}

module.exports = { resolveMigrationExecution };
