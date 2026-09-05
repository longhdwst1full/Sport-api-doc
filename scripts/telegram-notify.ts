import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TelegramPollingClient } from '../src/integrations/telegram/codex-bridge/telegram-polling.client';

for (const environmentFile of ['.env', '.env.local']) {
  const environmentPath = resolve(process.cwd(), environmentFile);
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = Number(process.env.TELEGRAM_ALLOWED_USER_ID);
  const message = process.argv.slice(2).join(' ').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!Number.isSafeInteger(chatId) || chatId <= 0) {
    throw new Error('TELEGRAM_ALLOWED_USER_ID must be a positive integer');
  }
  if (!message) throw new Error('Usage: yarn telegram:notify -- <message>');

  await new TelegramPollingClient(token).sendMessage(chatId, message);
  console.log('Telegram notification delivered.');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Telegram notification failed');
  process.exitCode = 1;
});
