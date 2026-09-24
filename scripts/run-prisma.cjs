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

// `validate`/`generate` chỉ đọc schema, không mở kết nối, nhưng schema khai `env("DATABASE_URL")` nên
// Prisma vẫn đòi biến tồn tại. Build Preview của Vercel (mỗi nhánh được push) không có secret database,
// nên dùng URL giả cho hai lệnh này. Production vẫn bắt buộc biến thật: thiếu thì dừng build ngay thay
// vì deploy một API không nối được database. `migrate-*` luôn cần database thật.
const offlineCommand = command === 'generate' || command === 'validate';
const isProductionBuild = process.env.VERCEL_ENV === 'production';
if (offlineCommand && !isProductionBuild && (!process.env.DATABASE_URL || !process.env.DIRECT_URL)) {
  const placeholder = 'postgresql://offline:offline@localhost:5432/offline';
  process.env.DATABASE_URL ??= placeholder;
  process.env.DIRECT_URL ??= placeholder;
  console.warn(`[prisma] ${command}: DATABASE_URL/DIRECT_URL chưa khai, dùng URL giả (không kết nối database).`);
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
