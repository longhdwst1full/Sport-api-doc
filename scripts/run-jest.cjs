const { spawnSync } = require('node:child_process');

const result = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    AUTH_BYPASS: 'false',
  },
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
