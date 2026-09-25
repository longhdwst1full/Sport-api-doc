const { PrismaClient } = require('@prisma/client');
const { printCronStatus } = require('./lib/cron-http-status.cjs');

const action = process.argv[2] ?? 'status';
const jobName = 'dctd-order-maintenance';
const urlSecretName = 'dctd_order_maintenance_job_url';
const authSecretName = 'dctd_order_maintenance_cron_secret';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('ORDER_MAINTENANCE_JOB_URL must use HTTPS outside localhost');
  }
  if (!url.pathname.endsWith('/api/v1/internal/jobs/orders/maintenance')) {
    throw new Error('ORDER_MAINTENANCE_JOB_URL must target the order maintenance endpoint');
  }
  return url.toString();
}

/**
 * Ghi secret vào Supabase Vault.
 *
 * `vault.update_secret` và `vault.create_secret` trả về void, nên phải dùng `$executeRawUnsafe`:
 * `$queryRawUnsafe` cố deserialize cột void rồi ném lỗi. Lần chạy ĐẦU đi nhánh create nên không lộ
 * ra; chỉ tới lần chạy lại — đúng lúc cần đổi cấu hình — mới hỏng.
 */
async function upsertVaultSecret(prisma, name, value, description) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id::text AS id FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1',
    name,
  );
  if (rows[0]?.id) {
    await prisma.$executeRawUnsafe('SELECT vault.update_secret($1::uuid, $2, $3, $4)', rows[0].id, value, name, description);
    return;
  }
  await prisma.$executeRawUnsafe('SELECT vault.create_secret($1, $2, $3)', value, name, description);
}

async function status(prisma) {
  const relations = await prisma.$queryRawUnsafe("SELECT to_regclass('cron.job')::text AS job_table");
  if (!relations[0]?.job_table) {
    console.log(JSON.stringify({ configured: false, reason: 'pg_cron extension is not enabled' }, null, 2));
    return;
  }
  const jobs = await prisma.$queryRawUnsafe(
    'SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = $1',
    jobName,
  );
  const runs = jobs[0]
    ? await prisma.$queryRawUnsafe(
      'SELECT status, start_time, end_time, return_message FROM cron.job_run_details WHERE jobid = $1 ORDER BY start_time DESC LIMIT 10',
      jobs[0].jobid,
    )
    : [];
  await printCronStatus(prisma, { jobName, job: jobs[0], runs });
}

async function set(prisma) {
  const endpoint = validateUrl(required('ORDER_MAINTENANCE_JOB_URL'));
  const cronSecret = required('CRON_SECRET');
  if (cronSecret.length < 32) throw new Error('CRON_SECRET must contain at least 32 characters');
  const schedule = process.env.ORDER_MAINTENANCE_CRON_SCHEDULE?.trim() || '2-59/5 * * * *'; // Lech phut voi reservation-expiry (*/5) de khong ban cung giay: 4 job cung luc tung lam pg_net ket DNS/timeout 30s.

  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault');
  await upsertVaultSecret(prisma, urlSecretName, endpoint, 'DCTD order maintenance internal endpoint');
  await upsertVaultSecret(prisma, authSecretName, cronSecret, 'DCTD order maintenance bearer secret');
  await prisma.$queryRawUnsafe('SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1', jobName);
  const command = `
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${urlSecretName}' LIMIT 1),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${authSecretName}' LIMIT 1)
      ),
      -- 30s, khong phai 10s: ban deploy serverless co cold start, va net._http_response cho thay
      -- 3/20 luot goi bi timeout o moc 10s trong khi cron.job_run_details van bao succeeded --
      -- luot do bi bo lang le. Comment nay nam trong template string JS nen khong duoc chua backtick.
      timeout_milliseconds := 30000
    ) AS request_id;
  `;
  await prisma.$queryRawUnsafe('SELECT cron.schedule($1, $2, $3)', jobName, schedule, command);
  console.log(`Configured ${jobName} with schedule ${schedule}. Secrets were stored in Supabase Vault.`);
  await status(prisma);
}

async function remove(prisma) {
  await prisma.$queryRawUnsafe('SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1', jobName);
  console.log(`Removed cron job ${jobName}. Vault secrets were retained for recovery.`);
}

async function main() {
  if (!['set', 'status', 'remove'].includes(action)) {
    throw new Error('Usage: configure-order-maintenance-cron.cjs [set|status|remove]');
  }
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  required('DATABASE_URL');
  const prisma = new PrismaClient();
  try {
    if (action === 'set') await set(prisma);
    else if (action === 'remove') await remove(prisma);
    else await status(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
