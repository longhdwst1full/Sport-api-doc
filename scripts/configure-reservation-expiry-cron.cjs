const { PrismaClient } = require('@prisma/client');

const action = process.argv[2] ?? 'status';
const jobName = 'dctd-reservation-expiry';
const urlSecretName = 'dctd_reservation_expiry_job_url';
const authSecretName = 'dctd_reservation_expiry_cron_secret';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('RESERVATION_EXPIRY_JOB_URL must use HTTPS outside localhost');
  }
  if (!url.pathname.endsWith('/api/v1/internal/jobs/reservations/expire')) {
    throw new Error('RESERVATION_EXPIRY_JOB_URL must target the reservation expiry endpoint');
  }
  return url.toString();
}

async function upsertVaultSecret(prisma, name, value, description) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id::text AS id FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1',
    name,
  );
  if (rows[0]?.id) {
    await prisma.$queryRawUnsafe(
      'SELECT vault.update_secret($1::uuid, $2, $3, $4)',
      rows[0].id,
      value,
      name,
      description,
    );
    return;
  }
  await prisma.$queryRawUnsafe(
    'SELECT vault.create_secret($1, $2, $3)',
    value,
    name,
    description,
  );
}

async function status(prisma) {
  const relations = await prisma.$queryRawUnsafe(
    "SELECT to_regclass('cron.job')::text AS job_table",
  );
  if (!relations[0]?.job_table) {
    console.log(JSON.stringify({ configured: false, reason: 'pg_cron extension is not enabled' }, null, 2));
    return;
  }
  const jobs = await prisma.$queryRawUnsafe(
    `SELECT jobid, jobname, schedule, active
       FROM cron.job
      WHERE jobname = $1`,
    jobName,
  );
  const runs = jobs[0]
    ? await prisma.$queryRawUnsafe(
        `SELECT status, start_time, end_time, return_message
           FROM cron.job_run_details
          WHERE jobid = $1
          ORDER BY start_time DESC
          LIMIT 10`,
        jobs[0].jobid,
      )
    : [];
  console.log(JSON.stringify(
    { job: jobs[0] ?? null, recentRuns: runs },
    (_, value) => typeof value === 'bigint' ? value.toString() : value,
    2,
  ));
}

async function set(prisma) {
  const endpoint = validateUrl(required('RESERVATION_EXPIRY_JOB_URL'));
  const cronSecret = required('CRON_SECRET');
  if (cronSecret.length < 32) throw new Error('CRON_SECRET must contain at least 32 characters');
  const schedule = process.env.RESERVATION_EXPIRY_CRON_SCHEDULE?.trim() || '*/5 * * * *';

  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions');
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault');
  await upsertVaultSecret(
    prisma,
    urlSecretName,
    endpoint,
    'DCTD reservation expiry internal endpoint',
  );
  await upsertVaultSecret(
    prisma,
    authSecretName,
    cronSecret,
    'DCTD reservation expiry bearer secret',
  );
  await prisma.$queryRawUnsafe(
    'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1',
    jobName,
  );
  const command = `
    SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${urlSecretName}' LIMIT 1),
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = '${authSecretName}' LIMIT 1)
      ),
      timeout_milliseconds := 10000
    ) AS request_id;
  `;
  await prisma.$queryRawUnsafe('SELECT cron.schedule($1, $2, $3)', jobName, schedule, command);
  console.log(`Configured ${jobName} with schedule ${schedule}. Secrets were stored in Supabase Vault.`);
  await status(prisma);
}

async function remove(prisma) {
  await prisma.$queryRawUnsafe(
    'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1',
    jobName,
  );
  console.log(`Removed cron job ${jobName}. Vault secrets were retained for recovery.`);
}

async function main() {
  if (!['set', 'status', 'remove'].includes(action)) {
    throw new Error('Usage: configure-reservation-expiry-cron.cjs [set|status|remove]');
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
