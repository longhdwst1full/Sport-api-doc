const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

for (const environmentFile of ['.env', '.env.local']) {
  const environmentPath = resolve(process.cwd(), environmentFile);
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const commands = [
  { command: 'task', description: 'Tạo task Codex chờ xác nhận' },
  { command: 'confirm', description: 'Xác nhận chạy task' },
  { command: 'cancel', description: 'Hủy task' },
  { command: 'status', description: 'Xem trạng thái task' },
  { command: 'tasks', description: 'Danh sách task gần nhất' },
  { command: 'help', description: 'Hướng dẫn sử dụng' },
];

async function main() {
  const response = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commands }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram returned HTTP ${response.status}`);
  }
  console.log(JSON.stringify({ ok: true, commandCount: commands.length }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Telegram command setup failed');
  process.exitCode = 1;
});
