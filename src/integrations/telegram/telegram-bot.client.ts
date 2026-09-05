import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramApiResponse } from './telegram.types';

@Injectable()
export class TelegramBotClient {
  constructor(private readonly config: ConfigService) {}

  async sendMessage(chatId: number, text: string): Promise<void> {
    const token = this.config.get<string>('telegram.botToken');
    if (!token) throw new ServiceUnavailableException('Telegram bot is not configured');

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json()) as TelegramApiResponse<unknown>;
    if (!response.ok || !payload.ok) {
      throw new ServiceUnavailableException('Telegram could not deliver the bot response');
    }
  }
}
