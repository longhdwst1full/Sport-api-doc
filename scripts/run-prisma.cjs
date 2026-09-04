const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const command = process.argv[2];
const prismaArguments = {
  generate: ['generate'],
  validate: ['validate'],
  'migrate-deploy': ['migrate', 'deploy'],
  'migrate-status': ['migrate', 'status'],
}[command];

if (!prismaArguments) {
  throw new Error(`Unsupported Prisma command: ${command ?? '<missing>'}`);
}

for (const environmentFile of ['.env.local', '.env']) {
  const environmentPath = resolve(process.cwd(), environmentFile);
  if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
    break;
  }
}

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error(
    'DATABASE_URL and DIRECT_URL are required. Configure api/.env.local with the Supabase pooler URLs.',
  );
}

const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...prismaArguments], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
