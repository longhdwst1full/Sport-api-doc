import { registerAs } from '@nestjs/config';

export default registerAs('telegram', () => ({
  enabled: process.env.TELEGRAM_BOT_ENABLED === 'true',
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
  // Nơi nhận cảnh báo job cron; bỏ trống thì gửi cho chính tài khoản được phép dùng bot.
  alertChatId: process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_ALLOWED_USER_ID,
}));
