import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramBotClient } from './telegram-bot.client';
import type { TelegramUpdate } from './telegram.types';

const HELP_TEXT = [
  'Sport Codex Bot — bộ lệnh an toàn:',
  '/help — xem danh sách lệnh',
  '/ping — kiểm tra bot đang phản hồi',
  '/health — kiểm tra tiến trình API',
  '/status — xem môi trường và uptime',
  '/whoami — xem Telegram User ID',
  '',
  'Bot chưa cho phép chạy shell, deploy hoặc sửa source trực tiếp.',
].join('\n');

@Injectable()
export class TelegramUpdateService {
  constructor(
    private readonly config: ConfigService,
    private readonly bot: TelegramBotClient,
  ) {}

  isWebhookSecretValid(receivedSecret: string | undefined): boolean {
    const expectedSecret = this.config.get<string>('telegram.webhookSecret');
    if (!expectedSecret || !receivedSecret) return false;
    const expected = Buffer.from(expectedSecret);
    const received = Buffer.from(receivedSecret);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  async handle(update: TelegramUpdate): Promise<void> {
    if (this.config.get<boolean>('telegram.enabled') !== true) return;
    const message = update.message;
    if (!message?.from || typeof message.text !== 'string') return;

    const allowedUserId = this.config.get<string>('telegram.allowedUserId');
    if (String(message.from.id) !== allowedUserId) return;

    const command = message.text.trim().split(/\s+/, 1)[0]?.toLowerCase().split('@', 1)[0];
    let response: string;
    switch (command) {
      case '/start':
      case '/help':
        response = HELP_TEXT;
        break;
      case '/ping':
        response = 'pong ✅';
        break;
      case '/health':
        response = 'API process: UP ✅';
        break;
      case '/status':
        response = [
          'Sport API status',
          `Environment: ${this.config.get<string>('app.environment') ?? 'unknown'}`,
          `Uptime: ${Math.floor(process.uptime())} seconds`,
          'Command mode: safe/read-only',
        ].join('\n');
        break;
      case '/whoami':
        response = `Telegram User ID: ${message.from.id}`;
        break;
      default:
        response = `Lệnh chưa được hỗ trợ.\n\n${HELP_TEXT}`;
    }

    await this.bot.sendMessage(message.chat.id, response);
  }
}
