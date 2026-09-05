const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

for (const environmentFile of ['.env.local', '.env']) {
  const environmentPath = resolve(process.cwd(), environmentFile);
  if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
    break;
  }
}

const databaseEnabled = process.env.DATABASE_ENABLED === 'true';
const migrateOnStart = process.env.DB_MIGRATE_ON_START !== 'false';
const forceMigration = process.argv.includes('--force') || process.env.APP_MODE === 'migrate';

if (!databaseEnabled || (!migrateOnStart && !forceMigration)) {
  console.log(
    `[database] migration skipped (DATABASE_ENABLED=${databaseEnabled}, DB_MIGRATE_ON_START=${migrateOnStart}, forced=${forceMigration})`,
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error(
    'DATABASE_URL and DIRECT_URL are required before automatic database migration.',
  );
}

console.log('[database] applying pending Prisma migrations before application startup');
const result = spawnSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
  { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
);

if (result.status !== 0) {
  throw new Error(`Automatic database migration failed with exit code ${result.status ?? 1}`);
}

console.log('[database] schema is ready');
