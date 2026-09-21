import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import type { IntegrationConfigService } from '../../system/parameters/integration-config.service';
import { CarrierStatusSyncService } from './carrier-status-sync.service';
import type { FulfillmentService } from './fulfillment.service';

function buildService(overrides: { fulfillment?: unknown; secret?: string; actorUserId?: string } = {}) {
  // Secret và tài khoản dịch vụ của webhook đọc từ bảng tham số hệ thống, không phải biến môi trường.
  const integrations = {
    ghn: jest.fn().mockResolvedValue({
      enabled: true,
      baseUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
      token: 'ghn-token',
      shopId: '1',
      serviceTypeId: 2,
      webhookSecret: overrides.secret ?? 'secret-0123456789abcd',
      webhookActorUserId: overrides.actorUserId ?? '42',
    }),
  } as unknown as IntegrationConfigService;
  const prisma = {
    fulfillment: {
      findFirst: jest.fn().mockResolvedValue(
        overrides.fulfillment === undefined
          ? { id: 5n, status: 'SHIPPED', version: 3n }
          : overrides.fulfillment,
      ),
    },
  } as unknown as PrismaService;
  const deliver = jest.fn().mockResolvedValue({});
  const failDelivery = jest.fn((id: string, input: Record<string, unknown>): Promise<unknown> => {
    void id;
    void input;
    return Promise.resolve({});
  });
  const service = new CarrierStatusSyncService(integrations, prisma, {
    deliver,
    failDelivery,
  } as unknown as FulfillmentService);
  return { service, deliver, failDelivery };
}

describe('CarrierStatusSyncService', () => {
  it('marks the fulfillment delivered when GHN reports delivery', async () => {
    const { service, deliver } = buildService();

    const result = await service.handle({ OrderCode: 'LXQ7A9', Status: 'delivered' }, 'req-1');

    expect(result.outcome).toBe('applied');
    expect(deliver).toHaveBeenCalledWith(
      '5',
      expect.objectContaining({ expectedVersion: '3' }),
      // Khoá idempotency phải ổn định theo mã vận đơn + trạng thái để GHN gửi lại không đổi hai lần.
      'ghn-webhook:LXQ7A9:delivered',
      'req-1',
      expect.objectContaining({ userId: '42' }),
    );
  });

  it('records a failed delivery with a stable reason code', async () => {
    const { service, failDelivery } = buildService();

    await service.handle(
      { OrderCode: 'LXQ7A9', Status: 'delivery_fail', Description: 'Khách không nghe máy' },
      'req-2',
    );

    expect(failDelivery.mock.calls[0]?.[1]).toMatchObject({
      reasonCode: 'CARRIER_DELIVERY_FAILED',
      reason: 'Khách không nghe máy',
    });
  });

  it('ignores carrier statuses that do not change the internal state machine', async () => {
    const { service, deliver, failDelivery } = buildService();

    const result = await service.handle({ OrderCode: 'LXQ7A9', Status: 'transporting' }, 'req-3');

    expect(result.outcome).toBe('ignored');
    expect(deliver).not.toHaveBeenCalled();
    expect(failDelivery).not.toHaveBeenCalled();
  });

  it('treats an already-delivered fulfillment as replay instead of transitioning again', async () => {
    const { service, deliver } = buildService({ fulfillment: { id: 5n, status: 'DELIVERED', version: 4n } });

    const result = await service.handle({ OrderCode: 'LXQ7A9', Status: 'delivered' }, 'req-4');

    expect(result.outcome).toBe('replayed');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('reports an unknown tracking code without failing the webhook', async () => {
    const { service } = buildService({ fulfillment: null });

    const result = await service.handle({ OrderCode: 'KHONG-CO', Status: 'delivered' }, 'req-5');

    expect(result.outcome).toBe('unknown_tracking');
  });

  it('swallows a conflict from a concurrent manual update', async () => {
    const { service, deliver } = buildService();
    deliver.mockRejectedValue(new ConflictException('Đã đổi trạng thái'));

    const result = await service.handle({ OrderCode: 'LXQ7A9', Status: 'delivered' }, 'req-6');

    expect(result.outcome).toBe('replayed');
  });

  it('rejects a wrong secret', async () => {
    const { service } = buildService();

    await expect(service.assertSecret('sai-secret')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.assertSecret(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects every call when no secret is configured', async () => {
    const { service } = buildService({ secret: '' });

    await expect(service.assertSecret('bat-ky')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses to invent an actor when the service account is missing', async () => {
    const { service } = buildService({ actorUserId: '' });

    await expect(
      service.handle({ OrderCode: 'LXQ7A9', Status: 'delivered' }, 'req-7'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
