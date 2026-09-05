import { ConfigService } from '@nestjs/config';
import { TelegramBotClient } from './telegram-bot.client';
import { TelegramUpdateService } from './telegram-update.service';

describe('TelegramUpdateService', () => {
  const sendMessage = jest.fn<Promise<void>, [number, string]>().mockResolvedValue(undefined);
  const values: Record<string, unknown> = {
    'telegram.enabled': true,
    'telegram.allowedUserId': '5333290241',
    'telegram.webhookSecret': 'a'.repeat(32),
    'app.environment': 'test',
  };
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  const bot = { sendMessage } as unknown as TelegramBotClient;
  const service = new TelegramUpdateService(config, bot);

  beforeEach(() => sendMessage.mockClear());

  it('accepts only the configured webhook secret', () => {
    expect(service.isWebhookSecretValid('a'.repeat(32))).toBe(true);
    expect(service.isWebhookSecretValid('b'.repeat(32))).toBe(false);
    expect(service.isWebhookSecretValid(undefined)).toBe(false);
  });

  it('answers an allowlisted ping command', async () => {
    await service.handle({
      update_id: 1,
      message: { from: { id: 5333290241 }, chat: { id: 5333290241 }, text: '/ping' },
    });

    expect(sendMessage).toHaveBeenCalledWith(5333290241, 'pong ✅');
  });

  it('silently ignores users outside the allowlist', async () => {
    await service.handle({
      update_id: 2,
      message: { from: { id: 999 }, chat: { id: 999 }, text: '/status' },
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not interpret arbitrary text as a system command', async () => {
    await service.handle({
      update_id: 3,
      message: { from: { id: 5333290241 }, chat: { id: 5333290241 }, text: 'rm -rf project' },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      5333290241,
      expect.stringContaining('Lệnh chưa được hỗ trợ'),
    );
  });
});
