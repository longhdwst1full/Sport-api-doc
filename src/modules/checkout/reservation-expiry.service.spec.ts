import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import { ReservationExpiryService } from './reservation-expiry.service';

describe('ReservationExpiryService', () => {
  const queryRaw = jest.fn();
  const findReservations = jest.fn();
  const findBalances = jest.fn();
  const updateBalance = jest.fn();
  const updateReservations = jest.fn<Promise<{ count: number }>, [Record<string, unknown>]>();
  const updateCheckouts = jest.fn();
  const auditWrite = jest.fn();
  const transaction = {
    $queryRaw: queryRaw,
    inventoryReservation: {
      findMany: findReservations,
      updateMany: updateReservations,
    },
    inventoryBalance: {
      findMany: findBalances,
      updateMany: updateBalance,
    },
    checkoutSession: { updateMany: updateCheckouts },
  };
  const runTransaction = jest.fn(
    (callback: (client: typeof transaction) => unknown) => callback(transaction),
  );
  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(true),
    getOrThrow: jest.fn().mockReturnValue(50),
  } as unknown as ConfigService;
  const service = new ReservationExpiryService(
    prisma,
    config,
    { write: auditWrite } as unknown as AuditWriter,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.isEnabled as jest.Mock).mockReturnValue(true);
    (config.get as jest.Mock).mockReturnValue(true);
    queryRaw.mockResolvedValueOnce([{ id: 10n }]).mockResolvedValueOnce([]);
    findReservations.mockResolvedValue([{
      id: 10n,
      checkoutSessionId: 20n,
      warehouseId: 30n,
      expiresAt: new Date('2026-09-08T00:00:00Z'),
      items: [{ productVariantId: 40n, quantity: 2 }],
    }]);
    findBalances.mockResolvedValue([{
      id: 50n,
      warehouseId: 30n,
      productVariantId: 40n,
      reserved: 3,
      version: 4n,
    }]);
    updateBalance.mockResolvedValue({ count: 1 });
    updateReservations.mockResolvedValue({ count: 1 });
    updateCheckouts.mockResolvedValue({ count: 1 });
    auditWrite.mockResolvedValue({ id: '1', createdAt: new Date().toISOString() });
  });

  it('returns without touching PostgreSQL when the job is disabled', async () => {
    (config.get as jest.Mock).mockReturnValue(false);

    await expect(service.run('cron-disabled')).resolves.toMatchObject({
      enabled: false,
      claimed: 0,
      expired: 0,
      hasMore: false,
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('claims expired reservations and releases reserved counters atomically', async () => {
    await expect(service.run('cron-1')).resolves.toMatchObject({
      enabled: true,
      claimed: 1,
      expired: 1,
      hasMore: false,
    });
    expect(updateBalance).toHaveBeenCalledWith({
      where: { id: 50n, version: 4n },
      data: { reserved: { decrement: 2 }, version: { increment: 1 } },
    });
    expect(updateReservations.mock.calls[0]?.[0]).toMatchObject({
      data: {
        status: 'EXPIRED',
        releaseReason: 'RESERVATION_TTL_EXPIRED',
      },
    });
    expect(updateCheckouts).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [20n] }, status: 'CONFIRMED' },
    }));
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'cron-1',
      actorType: 'SYSTEM',
      action: 'checkout.reservation.expire',
      entityId: '10',
    }), transaction);
  });

  it('fails the batch when reserved counters are inconsistent', async () => {
    findBalances.mockResolvedValue([{
      id: 50n,
      warehouseId: 30n,
      productVariantId: 40n,
      reserved: 1,
      version: 4n,
    }]);

    await expect(service.run('cron-2')).rejects.toThrow('Reserved inventory counter is inconsistent');
    expect(updateReservations).not.toHaveBeenCalled();
  });
});
