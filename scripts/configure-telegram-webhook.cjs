const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

for (const environmentFile of ['.env', '.env.local']) {
  const environmentPath = resolve(process.cwd(), environmentFile);
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

const action = process.argv[2] ?? 'info';
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const methods = {
  info: { method: 'getWebhookInfo' },
  set: {
    method: 'setWebhook',
    body: {
      url: process.env.TELEGRAM_WEBHOOK_URL,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    },
  },
  delete: {
    method: 'deleteWebhook',
    body: { drop_pending_updates: true },
  },
};

const operation = methods[action];
if (!operation) throw new Error('Action must be info, set, or delete');
if (action === 'set' && (!operation.body.url || !operation.body.secret_token)) {
  throw new Error('TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET are required');
}

async function main() {
  const response = await fetch(`https://api.telegram.org/bot${token}/${operation.method}`, {
    method: operation.body ? 'POST' : 'GET',
    headers: operation.body ? { 'content-type': 'application/json' } : undefined,
    body: operation.body ? JSON.stringify(operation.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram returned HTTP ${response.status}`);
  }
  console.log(JSON.stringify({ ok: true, action, result: payload.result }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Telegram webhook command failed');
  process.exitCode = 1;
});
