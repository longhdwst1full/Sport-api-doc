// Lịch chạy worker gửi thông báo.
//
// Mỗi phút một lượt, khác các job khác chạy 5 phút: email chậm 5 phút là khách đã kịp mở hộp thư
// mà chưa thấy xác nhận đơn, rồi gọi lên hỏi. Một lượt chỉ xử lý tối đa `OUTBOX_BATCH_SIZE` sự
// kiện nên tần suất cao không kéo dài lượt chạy.
const { PrismaClient } = require('@prisma/client');
const { printCronStatus } = require('./lib/cron-http-status.cjs');

const action = process.argv[2] ?? 'status';
const jobName = 'dctd-notification-dispatch';
const urlSecretName = 'dctd_notification_dispatch_job_url';
const authSecretName = 'dctd_notification_dispatch_cron_secret';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('NOTIFICATION_DISPATCH_JOB_URL must use HTTPS outside localhost');
  }
  if (!url.pathname.endsWith('/api/v1/internal/jobs/notifications/dispatch')) {
    throw new Error('NOTIFICATION_DISPATCH_JOB_URL must target the notification dispatch endpoint');
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
  const endpoint = validateUrl(required('NOTIFICATION_DISPATCH_JOB_URL'));
  const cronSecret = required('CRON_SECRET');
  if (cronSecret.length < 32) throw new Error('CRON_SECRET must contain at least 32 characters');
  const schedule = process.env.NOTIFICATION_DISPATCH_CRON_SCHEDULE?.trim() || '* * * * *';

  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault');
  await upsertVaultSecret(prisma, urlSecretName, endpoint, 'DCTD notification dispatch internal endpoint');
  await upsertVaultSecret(prisma, authSecretName, cronSecret, 'DCTD notification dispatch bearer secret');
  await prisma.$queryRawUnsafe('SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1', jobName);
  const command = `
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${urlSecretName}' LIMIT 1),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${authSecretName}' LIMIT 1)
      ),
      -- 30s, không phải 10s: bản deploy serverless có cold start, và net._http_response cho
      -- thấy lượt gọi bị timeout ở mốc 10s trong khi cron.job_run_details vẫn báo succeeded,
      -- tức là lượt đó bị bỏ lặng lẽ. Không dùng dấu backtick trong chuỗi template của JS.
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
    throw new Error('Usage: configure-notification-dispatch-cron.cjs [set|status|remove]');
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
