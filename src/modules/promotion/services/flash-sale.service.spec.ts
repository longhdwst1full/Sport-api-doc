import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import { FlashSaleService } from './flash-sale.service';

interface ItemRow {
  id: bigint;
  campaignId: bigint;
  productVariantId: bigint;
  salePrice: Prisma.Decimal;
  quota: number;
  soldQuantity: number;
  reservedQuantity: number;
  perCustomerLimit: number | null;
  status: string;
  version: bigint;
}

function buildItem(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: 7n,
    campaignId: 1n,
    productVariantId: 42n,
    salePrice: new Prisma.Decimal('1990000.00'),
    quota: 10,
    soldQuantity: 2,
    reservedQuantity: 3,
    perCustomerLimit: null,
    status: 'ACTIVE',
    version: 5n,
    ...overrides,
  };
}

interface ReservationRow {
  id: bigint;
  flashSaleItemId: bigint;
  quantity: number;
}

function buildHarness(items: ItemRow[], updateManyCount = 1, reservations: ReservationRow[] = []) {
  const itemFindMany = jest.fn<Promise<ItemRow[]>, [unknown]>().mockResolvedValue(items);
  const itemUpdateMany = jest
    .fn<Promise<{ count: number }>, [{ where: { version: bigint; quota: { gte: number } } }]>()
    .mockResolvedValue({ count: updateManyCount });
  const itemUpdate = jest
    .fn<
      Promise<unknown>,
      [
        {
          data: {
            reservedQuantity?: { decrement?: number };
            soldQuantity?: { increment?: number; decrement?: number };
          };
        },
      ]
    >()
    .mockResolvedValue({});
  const reservationCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({});
  const reservationFindMany = jest
    .fn<Promise<ReservationRow[]>, [unknown]>()
    .mockResolvedValue(reservations);
  const reservationUpdate = jest
    .fn<Promise<unknown>, [{ data: { releaseReason?: string } }]>()
    .mockResolvedValue({});

  const transaction = {
    flashSaleItem: { findMany: itemFindMany, updateMany: itemUpdateMany, update: itemUpdate },
    flashSaleQuotaReservation: {
      create: reservationCreate,
      findMany: reservationFindMany,
      update: reservationUpdate,
    },
  } as unknown as Prisma.TransactionClient;

  return { transaction, itemUpdateMany, itemUpdate, reservationCreate, reservationUpdate };
}

describe('FlashSaleService quota', () => {
  const prisma = { isEnabled: () => true } as unknown as PrismaService;
  const audit = { write: jest.fn() } as unknown as AuditWriter;
  const service = new FlashSaleService(prisma, audit);
  const now = new Date('2026-09-13T10:00:00.000Z');

  beforeEach(() => jest.clearAllMocks());

  it('giữ quota bằng compare-and-set trên đúng version đã đọc', async () => {
    const harness = buildHarness([buildItem()]);

    const grants = await service.reserveQuota(
      harness.transaction,
      99n,
      'guest:abc',
      [{ productVariantId: 42n, quantity: 4 }],
      now,
    );

    expect(grants).toHaveLength(1);
    expect(grants[0].quantity).toBe(4);
    // Điều kiện phải gồm version đã đọc và quota còn đủ cho đúng số lượng này.
    const where = harness.itemUpdateMany.mock.calls[0][0].where;
    expect(where.version).toBe(5n);
    expect(where.quota.gte).toBe(2 + 3 + 4);
  });

  it('từ chối khi request song song thắng trước (updateMany không khớp hàng nào)', async () => {
    const harness = buildHarness([buildItem()], 0);

    await expect(
      service.reserveQuota(harness.transaction, 99n, 'guest:abc', [{ productVariantId: 42n, quantity: 4 }], now),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.reservationCreate).not.toHaveBeenCalled();
  });

  it('chặn vượt giới hạn mỗi khách trước khi chạm quota', async () => {
    const harness = buildHarness([buildItem({ perCustomerLimit: 2 })]);

    await expect(
      service.reserveQuota(harness.transaction, 99n, 'guest:abc', [{ productVariantId: 42n, quantity: 3 }], now),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.itemUpdateMany).not.toHaveBeenCalled();
  });

  it('bỏ qua biến thể không thuộc campaign đang chạy', async () => {
    const harness = buildHarness([]);

    const grants = await service.reserveQuota(
      harness.transaction,
      99n,
      'guest:abc',
      [{ productVariantId: 42n, quantity: 1 }],
      now,
    );

    expect(grants).toEqual([]);
    expect(harness.itemUpdateMany).not.toHaveBeenCalled();
  });

  it('commit chuyển reserved sang sold, tổng sold+reserved không đổi', async () => {
    const harness = buildHarness([], 1, [{ id: 3n, flashSaleItemId: 7n, quantity: 4 }]);

    const committed = await service.commitQuota(harness.transaction, 99n, now);

    expect(committed).toBe(1);
    const data = harness.itemUpdate.mock.calls[0][0].data;
    expect(data.reservedQuantity?.decrement).toBe(4);
    expect(data.soldQuantity?.increment).toBe(4);
  });

  it('revert trả suất đã chốt về pool khi đơn bị hủy', async () => {
    const harness = buildHarness([], 1, [{ id: 3n, flashSaleItemId: 7n, quantity: 4 }]);

    const reverted = await service.revertCommittedQuota(
      harness.transaction,
      99n,
      'Khách hủy đơn',
      now,
    );

    expect(reverted).toBe(1);
    // Trả về pool nghĩa là giảm sold, không phải tăng reserved.
    const data = harness.itemUpdate.mock.calls[0][0].data;
    expect(data.soldQuantity?.decrement).toBe(4);
    expect(data.reservedQuantity).toBeUndefined();
  });

  it('release trả lại quota và ghi lý do', async () => {
    const harness = buildHarness([], 1, [{ id: 3n, flashSaleItemId: 7n, quantity: 4 }]);

    const released = await service.releaseQuota(harness.transaction, 99n, 'Khách hủy checkout', now);

    expect(released).toBe(1);
    expect(harness.itemUpdate.mock.calls[0][0].data.reservedQuantity?.decrement).toBe(4);
    expect(harness.reservationUpdate.mock.calls[0][0].data.releaseReason).toBe('Khách hủy checkout');
  });
});

describe('FlashSaleService resolveActiveDeals', () => {
  const prisma = { isEnabled: () => true } as unknown as PrismaService;
  const audit = { write: jest.fn() } as unknown as AuditWriter;
  const service = new FlashSaleService(prisma, audit);
  const now = new Date('2026-09-13T10:00:00.000Z');

  function clientWith(items: ItemRow[]) {
    return {
      flashSaleItem: { findMany: jest.fn<Promise<ItemRow[]>, [unknown]>().mockResolvedValue(items) },
    } as unknown as Prisma.TransactionClient;
  }

  it('bỏ qua suất đã hết chỗ', async () => {
    const client = clientWith([buildItem({ quota: 5, soldQuantity: 3, reservedQuantity: 2 })]);

    const deals = await service.resolveActiveDeals(client, [42n], now);

    expect(deals.size).toBe(0);
  });

  it('chọn giá thấp nhất khi một SKU nằm trong nhiều campaign', async () => {
    const client = clientWith([
      buildItem({ id: 7n, salePrice: new Prisma.Decimal('1500000.00') }),
      buildItem({ id: 8n, salePrice: new Prisma.Decimal('1990000.00') }),
    ]);

    const deals = await service.resolveActiveDeals(client, [42n], now);

    expect(deals.get(42n)?.salePrice.toFixed(2)).toBe('1500000.00');
  });

  it('trả availableQuantity = quota - sold - reserved', async () => {
    const client = clientWith([buildItem({ quota: 10, soldQuantity: 2, reservedQuantity: 3 })]);

    const deals = await service.resolveActiveDeals(client, [42n], now);

    expect(deals.get(42n)?.availableQuantity).toBe(5);
  });
});
