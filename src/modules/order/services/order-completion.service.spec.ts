import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import { OrderCompletionService } from './order-completion.service';

describe('OrderCompletionService', () => {
  const queryRaw = jest.fn();
  const findOrder = jest.fn();
  const updateOrder = jest.fn<Promise<unknown>, [Record<string, unknown>]>();
  const auditWrite = jest.fn<Promise<unknown>, [Record<string, unknown>, unknown]>();
  const transaction = {
    $queryRaw: queryRaw,
    order: { findUniqueOrThrow: findOrder, update: updateOrder },
  };
  const runTransaction = jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction));
  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(true),
    getOrThrow: jest.fn((key: string) => key.endsWith('batchSize') ? 50 : 72),
  } as unknown as ConfigService;
  const service = new OrderCompletionService(prisma, config, { write: auditWrite } as unknown as AuditWriter);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.isEnabled as jest.Mock).mockReturnValue(true);
    (config.get as jest.Mock).mockReturnValue(true);
    queryRaw.mockResolvedValue([{ id: 9n }]);
    findOrder.mockResolvedValue({ id: 9n, status: 'DELIVERED', statusHistory: [{ sequenceNo: 1 }] });
    updateOrder.mockResolvedValue({ id: 9n });
    auditWrite.mockResolvedValue({ id: '1' });
  });

  it('does not access PostgreSQL when auto completion is disabled', async () => {
    (config.get as jest.Mock).mockReturnValue(false);

    await expect(service.run('cron-disabled')).resolves.toMatchObject({
      enabled: false,
      claimed: 0,
      completed: 0,
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('completes delivered and paid orders with system history and audit', async () => {
    await expect(service.run('cron-complete')).resolves.toMatchObject({
      enabled: true,
      claimed: 1,
      completed: 1,
      hasMore: false,
    });
    expect(updateOrder.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 9n },
      data: {
        status: 'COMPLETED',
        statusHistory: { create: { actorType: 'SYSTEM', requestId: 'cron-complete' } },
      },
    });
    expect(auditWrite.mock.calls[0]?.[0]).toMatchObject({
      action: 'order.complete-automatically',
      entityId: '9',
    });
    expect(auditWrite.mock.calls[0]?.[1]).toBe(transaction);
  });
});
