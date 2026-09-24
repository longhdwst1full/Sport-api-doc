import { ConfigService } from '@nestjs/config';
import type { SystemParameterService } from '../../system/parameters/system-parameter.service';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import { PaymentExpiryService } from './payment-expiry.service';

describe('PaymentExpiryService', () => {
  const queryRaw = jest.fn();
  const findOrder = jest.fn();
  const findBalances = jest.fn();
  const updateBalance = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
  const updateReservation = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
  const updatePayment = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
  const createTransaction = jest.fn();
  const updateFulfillment = jest.fn();
  const updateOrder = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
  const auditWrite = jest.fn<Promise<unknown>, [Record<string, unknown>, unknown]>();
  const transaction = {
    $queryRaw: queryRaw,
    order: { findUniqueOrThrow: findOrder, update: updateOrder },
    inventoryBalance: { findMany: findBalances, update: updateBalance },
    inventoryReservation: { update: updateReservation },
    payment: { update: updatePayment },
    paymentTransaction: { create: createTransaction },
    fulfillment: { update: updateFulfillment },
  };
  const runTransaction = jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction));
  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(true),
    getOrThrow: jest.fn().mockReturnValue(50),
  } as unknown as ConfigService;
  /** Worker đọc cờ bật/tắt từ bảng tham số; test chỉ cần nó trả true để chạy tới phần nghiệp vụ. */
  const parameters = {
    getBoolean: jest.fn().mockResolvedValue(true),
  } as unknown as SystemParameterService;
  const service = new PaymentExpiryService(prisma, config, { write: auditWrite } as unknown as AuditWriter, parameters);

  const order = {
    id: 11n,
    status: 'PENDING_CONFIRMATION',
    warehouseId: 3n,
    reservationId: 21n,
    statusHistory: [{ sequenceNo: 1 }],
    payment: { id: 31n, status: 'PENDING', currencyCode: 'VND', evidences: [] },
    reservation: {
      id: 21n,
      items: [{ productVariantId: 41n, quantity: 2 }],
    },
    fulfillment: { id: 51n, status: 'PENDING', history: [{ sequenceNo: 1 }] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.isEnabled as jest.Mock).mockReturnValue(true);
    (config.get as jest.Mock).mockReturnValue(true);
    queryRaw.mockResolvedValueOnce([{ id: 11n }]).mockResolvedValue([]);
    findOrder.mockResolvedValue(order);
    findBalances.mockResolvedValue([{ id: 61n, productVariantId: 41n, reserved: 2 }]);
    updateBalance.mockResolvedValue({ id: 61n });
    updateReservation.mockResolvedValue({ id: 21n });
    updatePayment.mockResolvedValue({ id: 31n });
    createTransaction.mockResolvedValue({ id: 71n });
    updateFulfillment.mockResolvedValue({ id: 51n });
    updateOrder.mockResolvedValue({ id: 11n });
    auditWrite.mockResolvedValue({ id: '1' });
  });

  it('does not access PostgreSQL when payment expiry is disabled', async () => {
    // Cờ bật/tắt nay đọc từ bảng tham số, không còn từ biến môi trường.
    (parameters.getBoolean as jest.Mock).mockResolvedValueOnce(false);

    await expect(service.run('cron-disabled')).resolves.toMatchObject({ enabled: false, expired: 0 });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('cancels an unpaid bank transfer and releases reserved inventory atomically', async () => {
    await expect(service.run('cron-payment')).resolves.toMatchObject({
      enabled: true,
      claimed: 1,
      expired: 1,
      hasMore: false,
    });
    expect(updateBalance).toHaveBeenCalledWith({
      where: { id: 61n },
      data: { reserved: { decrement: 2 }, version: { increment: 1 } },
    });
    expect(updateReservation.mock.calls[0]?.[0]).toMatchObject({
      data: { status: 'RELEASED', releaseReason: 'PAYMENT_TIMEOUT' },
    });
    expect(updatePayment.mock.calls[0]?.[0]).toMatchObject({ data: { status: 'CANCELLED' } });
    expect(updateOrder.mock.calls[0]?.[0]).toMatchObject({
      data: { status: 'CANCELLED', paymentStatus: 'CANCELLED' },
    });
    expect(auditWrite.mock.calls[0]?.[0]).toMatchObject({
      action: 'payment.expire',
      entityId: '31',
    });
    expect(auditWrite.mock.calls[0]?.[1]).toBe(transaction);
  });

  it('reports a claimed row as skipped when evidence appears before mutation', async () => {
    findOrder.mockResolvedValue({ ...order, payment: { ...order.payment, evidences: [{ id: 99n }] } });

    await expect(service.run('cron-race')).resolves.toMatchObject({ claimed: 1, expired: 0 });
    expect(updateBalance).not.toHaveBeenCalled();
  });
});
