import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { CarrierStatusSyncService } from '../services/carrier-status-sync.service';
import { GhnWebhookController } from './ghn-webhook.controller';

const SECRET = 'secret-0123456789abcd';

function buildController() {
  const handle = jest.fn().mockResolvedValue({ outcome: 'applied' });
  const sync = {
    // Secret đọc từ bảng tham số hệ thống nên kiểm tra là bất đồng bộ.
    assertSecret: jest.fn((provided: string | undefined) =>
      provided === SECRET
        ? Promise.resolve()
        : Promise.reject(new UnauthorizedException('Invalid GHN webhook secret')),
    ),
    handle,
  } as unknown as CarrierStatusSyncService;
  return { controller: new GhnWebhookController(sync), handle };
}

const request = { header: () => 'req-1' } as unknown as Request;
const payload = { OrderCode: 'LXQ7A9', Status: 'delivered' };

describe('GhnWebhookController', () => {
  it('accepts the secret from the query string, because the carrier portal only stores a URL', async () => {
    const { controller, handle } = buildController();

    await controller.receive(undefined, SECRET, payload, request);

    expect(handle).toHaveBeenCalled();
  });

  it('still accepts the secret from a header', async () => {
    const { controller, handle } = buildController();

    await controller.receive(SECRET, undefined, payload, request);

    expect(handle).toHaveBeenCalled();
  });

  it('rejects a call with neither', async () => {
    const { controller, handle } = buildController();

    await expect(
      controller.receive(undefined, undefined, payload, request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handle).not.toHaveBeenCalled();
  });
});
