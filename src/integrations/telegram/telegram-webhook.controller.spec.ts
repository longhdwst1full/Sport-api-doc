import { UnauthorizedException } from '@nestjs/common';
import { TelegramUpdateService } from './telegram-update.service';
import { TelegramWebhookController } from './telegram-webhook.controller';

describe('TelegramWebhookController', () => {
  const handle = jest.fn().mockResolvedValue(undefined);
  const updates = {
    isWebhookSecretValid: jest.fn(),
    handle,
  } as unknown as TelegramUpdateService;
  const controller = new TelegramWebhookController(updates);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a request without the Telegram webhook secret', async () => {
    jest.spyOn(updates, 'isWebhookSecretValid').mockReturnValue(false);

    await expect(controller.receive(undefined, { update_id: 1 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('dispatches a verified Telegram update', async () => {
    const update = { update_id: 2 };
    jest.spyOn(updates, 'isWebhookSecretValid').mockReturnValue(true);

    await controller.receive('valid-secret', update);

    expect(handle).toHaveBeenCalledWith(update);
  });
});
