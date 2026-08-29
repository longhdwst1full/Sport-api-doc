const { spawnSync } = require('node:child_process');

const command = process.argv[2];
if (!['generate', 'validate'].includes(command)) {
  throw new Error(`Unsupported Prisma command: ${command ?? '<missing>'}`);
}

const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), command], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://dctd:dctd_local@localhost:5432/dctd_utc',
    DIRECT_URL:
      process.env.DIRECT_URL ?? 'postgresql://dctd:dctd_local@localhost:5432/dctd_utc',
  },
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
