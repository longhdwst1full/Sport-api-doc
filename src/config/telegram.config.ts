import { registerAs } from '@nestjs/config';

export default registerAs('telegram', () => ({
  enabled: process.env.TELEGRAM_BOT_ENABLED === 'true',
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
}));
