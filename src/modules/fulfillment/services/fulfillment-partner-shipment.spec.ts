import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import type { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import type { ShippingPartnerClient } from '../../../integrations/shipping-partner/shipping-partner.client';
import { ScopeType } from '../../iam/iam.types';
import { FulfillmentService } from './fulfillment.service';

const principal: AuthPrincipal = {
  userId: '1',
  sessionId: '1',
  displayName: 'Admin',
  permissionVersion: '1',
  permissions: ['fulfillment.ship'],
  scopes: [{ type: ScopeType.GLOBAL }],
  mustChangePassword: false,
};

function buildFulfillment(paymentMethod: 'COD' | 'BANK_TRANSFER') {
  return {
    id: 5n,
    orderId: 9n,
    warehouseId: 3n,
    status: 'PACKED',
    version: 1n,
    history: [] as { idempotencyKey: string; requestHash: string }[],
    order: {
      orderNo: 'DH-0009',
      grandTotal: '450000',
      checkoutSession: { paymentMethod },
      addresses: [
        {
          recipientName: 'Nguyễn Văn A',
          recipientPhone: '0912345678',
          addressLine: '12 Nguyễn Trãi',
          provinceCode: '201',
          districtCode: '1489',
          wardCode: '1A0607',
        },
      ],
      reservation: { items: [{ productVariantId: 7n, quantity: 2 }] },
    },
  };
}

function buildService(overrides: {
  fulfillment?: unknown;
  partnerEnabled?: boolean;
  transactionFails?: boolean;
}) {
  const createShipment = jest.fn(
    (input: Record<string, unknown>): Promise<unknown> => {
      void input;
      return Promise.resolve({ provider: 'GHN', trackingCode: 'LXQ7A9' });
    },
  );
  const cancelShipment = jest.fn().mockResolvedValue(undefined);
  const partner = {
    isEnabled: () => overrides.partnerEnabled ?? true,
    createShipment,
    cancelShipment,
    createLabelUrl: jest.fn(),
  } as unknown as ShippingPartnerClient;

  const prisma = {
    isEnabled: () => true,
    fulfillment: {
      findFirst: jest.fn().mockResolvedValue(overrides.fulfillment ?? buildFulfillment('COD')),
    },
    $transaction: jest.fn().mockImplementation(() => {
      if (overrides.transactionFails) return Promise.reject(new ConflictException('Tồn kho vừa thay đổi'));
      return Promise.resolve({ id: '5' });
    }),
  } as unknown as PrismaService;

  const service = new FulfillmentService(
    prisma,
    { write: jest.fn() } as unknown as AuditWriter,
    partner,
  );
  return { service, createShipment, cancelShipment };
}

const shipInput = { expectedVersion: '1' } as never;

describe('FulfillmentService partner shipment', () => {
  it('creates a GHN shipment and passes its tracking code into the transaction', async () => {
    const { service, createShipment } = buildService({});

    await service.ship('5', shipInput, 'idem-key-0001', 'req-1', principal);

    expect(createShipment).toHaveBeenCalledTimes(1);
    expect(createShipment.mock.calls[0]?.[0]).toMatchObject({
      orderNo: 'DH-0009',
      districtCode: '1489',
      wardCode: '1A0607',
      // COD thu hộ đúng tổng tiền đơn.
      codAmount: 450_000,
      declaredValue: 450_000,
    });
  });

  it('does not ask the carrier to collect money for a prepaid order', async () => {
    const { service, createShipment } = buildService({ fulfillment: buildFulfillment('BANK_TRANSFER') });

    await service.ship('5', shipInput, 'idem-key-0002', 'req-2', principal);

    expect(createShipment.mock.calls[0]?.[0]).toMatchObject({ codAmount: 0 });
  });

  it('skips the carrier when the operator typed a tracking number', async () => {
    const { service, createShipment } = buildService({});

    await service.ship(
      '5',
      { expectedVersion: '1', trackingNo: 'TU-NHAP-01' } as never,
      'idem-key-0003',
      'req-3',
      principal,
    );

    expect(createShipment).not.toHaveBeenCalled();
  });

  it('skips the carrier when the integration is disabled', async () => {
    const { service, createShipment } = buildService({ partnerEnabled: false });

    await service.ship('5', shipInput, 'idem-key-0004', 'req-4', principal);

    expect(createShipment).not.toHaveBeenCalled();
  });

  it('does not create a second shipment when the command is replayed', async () => {
    const replayed = buildFulfillment('COD');
    replayed.history = [{ idempotencyKey: 'idem-key-0005', requestHash: 'any' }];
    const { service, createShipment } = buildService({ fulfillment: replayed });

    await service.ship('5', shipInput, 'idem-key-0005', 'req-5', principal).catch(() => undefined);

    expect(createShipment).not.toHaveBeenCalled();
  });

  it('cancels the shipment when the transaction fails, so no orphan parcel is left', async () => {
    const { service, cancelShipment } = buildService({ transactionFails: true });

    await expect(
      service.ship('5', shipInput, 'idem-key-0006', 'req-6', principal),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(cancelShipment).toHaveBeenCalledWith('LXQ7A9', 'Xuất kho thất bại');
  });
});
