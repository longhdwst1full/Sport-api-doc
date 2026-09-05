const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { resolveMigrationExecution } = require('./migration-execution-policy.cjs');

for (const environmentFile of ['.env.local', '.env']) {
  const environmentPath = resolve(process.cwd(), environmentFile);
  if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
    break;
  }
}

const decision = resolveMigrationExecution(process.argv.slice(2), process.env);

if (!decision.shouldRun) {
  console.log(
    `[database] migration skipped (mode=${decision.mode}, reason=${decision.reason})`,
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error(
    'DATABASE_URL and DIRECT_URL are required before automatic database migration.',
  );
}

console.log(`[database] applying pending Prisma migrations (mode=${decision.mode})`);
const result = spawnSync(
  process.execPath,
  [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
  { cwd: process.cwd(), env: process.env, stdio: 'inherit' },
);

if (result.status !== 0) {
  throw new Error(`Automatic database migration failed with exit code ${result.status ?? 1}`);
}

console.log('[database] schema is ready');
