import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import type { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import type { ShippingPartnerClient } from '../../../integrations/shipping-partner/shipping-partner.client';
import type { OutboxWriter } from '../../notification/outbox.writer';
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
    warehouse: {
      name: 'Kho HCM',
      branchId: 2n,
      branch: { addressJson: { districtCode: '1454', wardCode: '21308' } as Record<string, string> },
    },
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
      reservation: {
        items: [
          {
            productVariantId: 7n,
            quantity: 2,
            // Cân nặng và kích thước ĐÃ KHAI ở sản phẩm; vận đơn phải dùng đúng số này.
            productVariant: { weightGrams: 1_200, lengthMm: 300, widthMm: 200, heightMm: 150 },
          },
        ],
      },
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
    { append: jest.fn().mockResolvedValue(undefined) } as unknown as OutboxWriter,
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
      // Điểm lấy hàng lấy từ chi nhánh sở hữu kho xuất, không phải từ biến môi trường.
      pickup: { districtCode: '1454', wardCode: '21308' },
      districtCode: '1489',
      wardCode: '1A0607',
      // COD thu hộ đúng tổng tiền đơn.
      codAmount: 450_000,
      declaredValue: 450_000,
    });
  });

  /**
   * Hồi quy: chỗ tạo vận đơn từng nhân số lượng với hằng số 500g và KHÔNG gửi kích thước, nên hãng
   * báo cước trên một kiện tưởng tượng. Cân nặng và kích thước khai ở sản phẩm phải đi tới hãng.
   */
  it('gửi đúng cân nặng và kích thước đã khai ở sản phẩm', async () => {
    const { service, createShipment } = buildService({});

    await service.ship('5', shipInput, 'idem-key-weight', 'req-w', principal);

    expect(createShipment.mock.calls[0]?.[0]).toMatchObject({
      /**
       * Cân nặng thật 1.200g × 2 món = 2.400g, nhưng kiện 30 × 20 × 30 cm = 18.000 cm³, quy đổi
       * 18.000 ÷ 5000 = 3,6 → 4 kg. Hãng tính tiền theo số LỚN HƠN, nên gửi 4.000g.
       *
       * Đây đúng là nhóm hàng mà cách tính cũ sai nhiều nhất: cồng kềnh nhưng nhẹ cân.
       */
      weightGrams: 4_000,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 30,
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

  it('không đặt vận đơn khi hàng giao ngay tại quầy, nhưng vẫn xuất kho', async () => {
    // Chi nhánh thiếu mã quận/phường: nếu còn gọi hãng thì lệnh này sẽ vỡ 409.
    const counter = buildFulfillment('COD');
    counter.warehouse.branch.addressJson = {};
    const { service, createShipment } = buildService({ fulfillment: counter });

    await expect(
      service.ship('5', shipInput, 'idem-key-counter', 'req-c', principal, { handedOverAtCounter: true }),
    ).resolves.toEqual({ id: '5' });

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

  it('refuses to ship when the branch has no carrier area codes', async () => {
    const branchWithoutCodes = buildFulfillment('COD');
    branchWithoutCodes.warehouse.branch.addressJson = {};
    const { service, createShipment } = buildService({ fulfillment: branchWithoutCodes });

    await expect(
      service.ship('5', shipInput, 'idem-key-0007', 'req-7', principal),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createShipment).not.toHaveBeenCalled();
  });
});
