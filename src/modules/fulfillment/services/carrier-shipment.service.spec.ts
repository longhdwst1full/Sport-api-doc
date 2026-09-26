import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../../database/prisma.service';
import type { ShippingPartnerClient } from '../../../integrations/shipping-partner/shipping-partner.client';
import type { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ScopeType } from '../../iam/iam.types';
import type { SystemParameterService } from '../../system/parameters/system-parameter.service';
import { CarrierShipmentService } from './carrier-shipment.service';
import type { FulfillmentService } from './fulfillment.service';

type UpdateManyCall = [{ where: Record<string, unknown>; data: Record<string, unknown> }];

const principal: AuthPrincipal = {
  userId: '1', sessionId: 's', displayName: 'Owner', permissionVersion: '1',
  permissions: [], scopes: [{ type: ScopeType.GLOBAL }], mustChangePassword: false,
};

function shipmentSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 7n,
    orderId: 3n,
    status: 'PENDING',
    trackingNo: null,
    carrierShipmentStatus: 'CREATING',
    carrierShipmentAttempts: 0,
    warehouse: { branch: { addressJson: { districtCode: '1442', wardCode: '20109' } } },
    order: {
      orderNo: 'ORD-1',
      status: 'PENDING_CONFIRMATION',
      grandTotal: new Prisma.Decimal(500000),
      addresses: [{
        recipientName: 'An', recipientPhone: '0912345678', addressLine: '12 Nguyễn Trãi',
        provinceCode: '201', districtCode: '3303', wardCode: '1B2729',
      }],
      checkoutSession: { paymentMethod: 'VNPAY' },
      reservation: { items: [{ quantity: 1, productVariant: { weightGrams: 800, lengthMm: null, widthMm: null, heightMm: null } }] },
    },
    ...overrides,
  };
}

function createService(options: {
  partnerEnabled?: boolean;
  jobEnabled?: boolean;
  source?: Record<string, unknown> | null;
  createShipment?: jest.Mock;
  claimedIds?: bigint[];
  savedCount?: number;
} = {}) {
  const updateMany = jest.fn<Promise<{ count: number }>, UpdateManyCall>((call) => Promise.resolve({
    count: call.data.carrierShipmentStatus === 'CREATED' && call.data.trackingNo ? (options.savedCount ?? 1) : 1,
  }));
  const fulfillmentUpdate = jest.fn().mockResolvedValue({});
  const transaction = {
    fulfillment: { findUnique: jest.fn(), update: fulfillmentUpdate, updateMany },
    $queryRaw: jest.fn().mockResolvedValue((options.claimedIds ?? [7n]).map((id) => ({ id }))),
  };
  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    fulfillment: {
      findUnique: jest.fn().mockResolvedValue(options.source === undefined ? shipmentSource() : options.source),
      findFirst: jest.fn().mockResolvedValue({ id: 7n, carrierShipmentStatus: 'CREATE_FAILED' }),
      updateMany,
    },
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  const createShipment = options.createShipment ?? jest.fn().mockResolvedValue({ provider: 'GHN', trackingCode: 'GHN123' });
  const cancelShipment = jest.fn().mockResolvedValue(undefined);
  const partner = {
    isEnabled: jest.fn().mockReturnValue(options.partnerEnabled ?? true),
    createShipment,
    cancelShipment,
  } as unknown as ShippingPartnerClient;
  const auditWrite = jest.fn().mockResolvedValue({});
  const getDetail = jest.fn().mockResolvedValue({ id: '7' });
  const service = new CarrierShipmentService(
    prisma,
    partner,
    { write: auditWrite } as unknown as AuditWriter,
    { get: getDetail } as unknown as FulfillmentService,
    { getBoolean: jest.fn().mockResolvedValue(options.jobEnabled ?? true) } as unknown as SystemParameterService,
  );
  return { service, transaction, updateMany, fulfillmentUpdate, createShipment, cancelShipment, auditWrite, getDetail };
}

const lastData = (mock: jest.Mock<Promise<{ count: number }>, UpdateManyCall>) =>
  mock.mock.calls[mock.mock.calls.length - 1][0].data;

describe('CarrierShipmentService.requestForOrder', () => {
  const eligible = {
    id: 7n, status: 'PENDING', trackingNo: null, carrierShipmentStatus: null,
    order: { checkoutSession: { shippingProvider: 'GHN' } },
  };

  it('đặt cờ PENDING cho đơn báo giá qua GHN', async () => {
    const { service, transaction, fulfillmentUpdate } = createService();
    transaction.fulfillment.findUnique.mockResolvedValue(eligible);

    await expect(service.requestForOrder(transaction as never, 3n)).resolves.toBe(true);
    expect(fulfillmentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7n },
      data: expect.objectContaining({ carrierShipmentStatus: 'PENDING', carrierShipmentAttempts: 0 }) as unknown,
    }));
  });

  it.each([
    ['shop tự giao / Nhờ shop gửi', { order: { checkoutSession: { shippingProvider: 'INTERNAL' } } }],
    ['đã có cờ (IPN gửi lại)', { carrierShipmentStatus: 'PENDING' }],
    ['đã có mã vận đơn', { trackingNo: 'X1' }],
    ['đã bàn giao', { status: 'SHIPPED' }],
  ])('bỏ qua khi %s', async (_case, override) => {
    const { service, transaction, fulfillmentUpdate } = createService();
    transaction.fulfillment.findUnique.mockResolvedValue({ ...eligible, ...override });

    await expect(service.requestForOrder(transaction as never, 3n)).resolves.toBe(false);
    expect(fulfillmentUpdate).not.toHaveBeenCalled();
  });

  it('không đặt cờ khi tắt GHN hoặc tắt job, để ship quay về luồng cũ', async () => {
    for (const flags of [{ partnerEnabled: false }, { jobEnabled: false }]) {
      const { service, transaction, fulfillmentUpdate } = createService(flags);
      await expect(service.requestForOrder(transaction as never, 3n)).resolves.toBe(false);
      expect(transaction.fulfillment.findUnique).not.toHaveBeenCalled();
      expect(fulfillmentUpdate).not.toHaveBeenCalled();
    }
  });
});

describe('CarrierShipmentService.run', () => {
  it('tạo vận đơn ngoài transaction và lưu mã khi thành công', async () => {
    const { service, updateMany, createShipment } = createService();

    await expect(service.run()).resolves.toMatchObject({ enabled: true, claimed: 1, created: 1 });
    expect(createShipment).toHaveBeenCalledWith(expect.objectContaining({
      orderNo: 'ORD-1', codAmount: 0, wardCode: '1B2729', pickup: { districtCode: '1442', wardCode: '20109' },
    }));
    expect(lastData(updateMany)).toMatchObject({ carrierShipmentStatus: 'CREATED', carrierCode: 'GHN', trackingNo: 'GHN123' });
  });

  it('lỗi tạm thời thì hẹn thử lại, chưa chuyển CREATE_FAILED', async () => {
    const { service, updateMany } = createService({ createShipment: jest.fn().mockRejectedValue(new Error('GHN timeout')) });

    await expect(service.run()).resolves.toMatchObject({ retried: 1, failed: 0 });
    expect(lastData(updateMany)).toMatchObject({ carrierShipmentStatus: 'PENDING', carrierShipmentAttempts: 1, carrierShipmentError: 'GHN timeout' });
    expect(lastData(updateMany).carrierShipmentNextAttemptAt).toBeInstanceOf(Date);
  });

  it('hết lượt tự thử thì CREATE_FAILED chờ Admin tạo lại', async () => {
    const { service, updateMany } = createService({
      source: shipmentSource({ carrierShipmentAttempts: 2 }),
      createShipment: jest.fn().mockRejectedValue(new Error('GHN 500')),
    });

    await expect(service.run()).resolves.toMatchObject({ failed: 1 });
    expect(lastData(updateMany)).toMatchObject({ carrierShipmentStatus: 'CREATE_FAILED', carrierShipmentAttempts: 3, carrierShipmentNextAttemptAt: null });
  });

  it('thiếu mã địa giới chi nhánh là lỗi dữ liệu: CREATE_FAILED ngay, không gọi hãng', async () => {
    const { service, updateMany, createShipment } = createService({
      source: shipmentSource({ warehouse: { branch: { addressJson: {} } } }),
    });

    await expect(service.run()).resolves.toMatchObject({ failed: 1 });
    expect(createShipment).not.toHaveBeenCalled();
    expect(lastData(updateMany)).toMatchObject({
      carrierShipmentStatus: 'CREATE_FAILED',
      carrierShipmentError: expect.stringContaining('Chi nhánh xuất hàng') as unknown,
    });
  });

  it('huỷ bù vận đơn khi dòng đã bị lượt khác xử lý trong lúc gọi hãng', async () => {
    const { service, cancelShipment } = createService({ savedCount: 0 });

    await expect(service.run()).resolves.toMatchObject({ failed: 1 });
    expect(cancelShipment).toHaveBeenCalledWith('GHN123', expect.any(String));
  });

  it('no-op khi tắt GHN hoặc tắt job', async () => {
    const { service, createShipment } = createService({ jobEnabled: false });

    await expect(service.run()).resolves.toMatchObject({ enabled: false, claimed: 0 });
    expect(createShipment).not.toHaveBeenCalled();
  });
});

describe('CarrierShipmentService.retry', () => {
  it('claim CREATE_FAILED rồi chạy ngay một lượt, ghi audit', async () => {
    const { service, updateMany, auditWrite, getDetail } = createService();

    await expect(service.retry('7', principal, 'request-1')).resolves.toEqual({ id: '7' });
    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 7n, carrierShipmentStatus: 'CREATE_FAILED' },
      data: { carrierShipmentStatus: 'CREATING' },
    });
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({ action: 'fulfillment.carrier_shipment.retry' }));
    expect(getDetail).toHaveBeenCalledWith('7', principal);
  });

  it('lỗi khi tạo lại thì về CREATE_FAILED ngay, không tự thử tiếp', async () => {
    const { service, updateMany } = createService({ createShipment: jest.fn().mockRejectedValue(new Error('GHN timeout')) });

    await service.retry('7', principal, 'request-2');
    expect(lastData(updateMany)).toMatchObject({ carrierShipmentStatus: 'CREATE_FAILED' });
  });

  it('409 khi không ở trạng thái lỗi hoặc bấm trùng', async () => {
    const { service, updateMany, createShipment } = createService();
    updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.retry('7', principal, 'request-3'))
      .rejects.toMatchObject({ response: { code: 'FULFILLMENT_CARRIER_SHIPMENT_NOT_RETRYABLE' } });
    expect(createShipment).not.toHaveBeenCalled();
  });

  it('409 khi chưa cấu hình GHN', async () => {
    const { service } = createService({ partnerEnabled: false });

    await expect(service.retry('7', principal, 'request-4'))
      .rejects.toMatchObject({ response: { code: 'FULFILLMENT_CARRIER_PARTNER_DISABLED' } });
  });
});
