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

const appMode = process.env.APP_MODE ?? 'serve';
if (!['serve', 'migrate'].includes(appMode)) {
  throw new Error(`APP_MODE must be either serve or migrate; received ${appMode}`);
}

const migration = spawnSync(process.execPath, ['scripts/migrate-on-start.cjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
if (migration.status !== 0) process.exit(migration.status ?? 1);

if (appMode === 'migrate') {
  console.log('[database] APP_MODE=migrate completed; application will not start');
  process.exit(0);
}

const application = spawnSync(process.execPath, ['dist/main.js'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
process.exit(application.status ?? 1);
