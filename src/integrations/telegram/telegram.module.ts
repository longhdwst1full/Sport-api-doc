import { Module } from '@nestjs/common';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramUpdateService } from './telegram-update.service';
import { TelegramWebhookController } from './telegram-webhook.controller';

@Module({
  controllers: [TelegramWebhookController],
  providers: [TelegramBotClient, TelegramUpdateService],
  exports: [TelegramBotClient],
})
export class TelegramModule {}
