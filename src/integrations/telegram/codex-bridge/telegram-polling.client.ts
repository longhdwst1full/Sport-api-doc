import type { TelegramApiResponse, TelegramUpdate } from '../telegram.types';

interface TelegramBotIdentity {
  id: number;
  username: string;
}

interface TelegramWebhookInfo {
  url: string;
  pending_update_count: number;
}

export class TelegramPollingClient {
  constructor(private readonly token: string) {}

  getMe(): Promise<TelegramBotIdentity> {
    return this.call<TelegramBotIdentity>('getMe');
  }

  getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.call<TelegramWebhookInfo>('getWebhookInfo');
  }

  getUpdates(offset: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message'],
    }, 35_000);
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    const chunks = this.chunkMessage(text);
    for (const chunk of chunks) {
      await this.call<unknown>('sendMessage', { chat_id: chatId, text: chunk });
    }
  }

  private async call<T>(method: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new Error(payload.description ?? `Telegram ${method} returned HTTP ${response.status}`);
    }
    return payload.result;
  }

  private chunkMessage(text: string): string[] {
    const normalized = text.trim() || '(empty message)';
    const chunks: string[] = [];
    for (let offset = 0; offset < normalized.length; offset += 3_800) {
      chunks.push(normalized.slice(offset, offset + 3_800));
    }
    return chunks;
  }
}
