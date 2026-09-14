import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import { FLASH_SALE_ITEM_STATUS } from '../promotion.constants';
import { FlashSaleService } from './flash-sale.service';

/**
 * Fixture dùng chung cho cả file: mỗi giá trị có tên nói rõ vai trò thay vì
 * rải literal trong từng case. Đổi một con số chỉ phải sửa ở đây.
 */
const FIXTURE = {
  ITEM_ID: 7n,
  SECOND_ITEM_ID: 8n,
  CAMPAIGN_ID: 1n,
  VARIANT_ID: 42n,
  CHECKOUT_SESSION_ID: 99n,
  RESERVATION_ID: 3n,
  ITEM_VERSION: 5n,
  CUSTOMER_KEY: 'guest:abc',
  QUOTA: 10,
  SOLD: 2,
  RESERVED: 3,
  REQUESTED_QUANTITY: 4,
  SALE_PRICE: '1990000.00',
  LOWER_SALE_PRICE: '1500000.00',
  /** Giới hạn mỗi khách dùng cho case vượt hạn mức. */
  PER_CUSTOMER_LIMIT: 2,
  /** Lớn hơn PER_CUSTOMER_LIMIT để chạm nhánh từ chối. */
  OVER_LIMIT_QUANTITY: 3,
} as const;

/** Suất đã bán hết chỗ: sold + reserved = quota. */
const SOLD_OUT_ITEM = { quota: 5, soldQuantity: 3, reservedQuantity: 2 } as const;

const RELEASE_REASON = {
  ORDER_CANCELLED: 'Khách hủy đơn',
  CHECKOUT_CANCELLED: 'Khách hủy checkout',
} as const;

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
    id: FIXTURE.ITEM_ID,
    campaignId: FIXTURE.CAMPAIGN_ID,
    productVariantId: FIXTURE.VARIANT_ID,
    salePrice: new Prisma.Decimal(FIXTURE.SALE_PRICE),
    quota: FIXTURE.QUOTA,
    soldQuantity: FIXTURE.SOLD,
    reservedQuantity: FIXTURE.RESERVED,
    perCustomerLimit: null,
    status: FLASH_SALE_ITEM_STATUS.ACTIVE,
    version: FIXTURE.ITEM_VERSION,
    ...overrides,
  };
}

interface ReservationRow {
  id: bigint;
  flashSaleItemId: bigint;
  quantity: number;
}

const COMMITTED_RESERVATION: ReservationRow = {
  id: FIXTURE.RESERVATION_ID,
  flashSaleItemId: FIXTURE.ITEM_ID,
  quantity: FIXTURE.REQUESTED_QUANTITY,
};

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
      FIXTURE.CHECKOUT_SESSION_ID,
      FIXTURE.CUSTOMER_KEY,
      [{ productVariantId: FIXTURE.VARIANT_ID, quantity: FIXTURE.REQUESTED_QUANTITY }],
      now,
    );

    expect(grants).toHaveLength(1);
    expect(grants[0].quantity).toBe(FIXTURE.REQUESTED_QUANTITY);
    // Điều kiện phải gồm version đã đọc và quota còn đủ cho đúng số lượng này.
    const where = harness.itemUpdateMany.mock.calls[0][0].where;
    expect(where.version).toBe(FIXTURE.ITEM_VERSION);
    expect(where.quota.gte).toBe(FIXTURE.SOLD + FIXTURE.RESERVED + FIXTURE.REQUESTED_QUANTITY);
  });

  it('từ chối khi request song song thắng trước (updateMany không khớp hàng nào)', async () => {
    const harness = buildHarness([buildItem()], 0);

    await expect(
      service.reserveQuota(
        harness.transaction,
        FIXTURE.CHECKOUT_SESSION_ID,
        FIXTURE.CUSTOMER_KEY,
        [{ productVariantId: FIXTURE.VARIANT_ID, quantity: FIXTURE.REQUESTED_QUANTITY }],
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.reservationCreate).not.toHaveBeenCalled();
  });

  it('chặn vượt giới hạn mỗi khách trước khi chạm quota', async () => {
    const harness = buildHarness([buildItem({ perCustomerLimit: FIXTURE.PER_CUSTOMER_LIMIT })]);

    await expect(
      service.reserveQuota(
        harness.transaction,
        FIXTURE.CHECKOUT_SESSION_ID,
        FIXTURE.CUSTOMER_KEY,
        [{ productVariantId: FIXTURE.VARIANT_ID, quantity: FIXTURE.OVER_LIMIT_QUANTITY }],
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.itemUpdateMany).not.toHaveBeenCalled();
  });

  it('bỏ qua biến thể không thuộc campaign đang chạy', async () => {
    const harness = buildHarness([]);

    const grants = await service.reserveQuota(
      harness.transaction,
      FIXTURE.CHECKOUT_SESSION_ID,
      FIXTURE.CUSTOMER_KEY,
      [{ productVariantId: FIXTURE.VARIANT_ID, quantity: 1 }],
      now,
    );

    expect(grants).toEqual([]);
    expect(harness.itemUpdateMany).not.toHaveBeenCalled();
  });

  it('commit chuyển reserved sang sold, tổng sold+reserved không đổi', async () => {
    const harness = buildHarness([], 1, [COMMITTED_RESERVATION]);

    const committed = await service.commitQuota(harness.transaction, FIXTURE.CHECKOUT_SESSION_ID, now);

    expect(committed).toBe(1);
    const data = harness.itemUpdate.mock.calls[0][0].data;
    expect(data.reservedQuantity?.decrement).toBe(FIXTURE.REQUESTED_QUANTITY);
    expect(data.soldQuantity?.increment).toBe(FIXTURE.REQUESTED_QUANTITY);
  });

  it('revert trả suất đã chốt về pool khi đơn bị hủy', async () => {
    const harness = buildHarness([], 1, [COMMITTED_RESERVATION]);

    const reverted = await service.revertCommittedQuota(
      harness.transaction,
      FIXTURE.CHECKOUT_SESSION_ID,
      RELEASE_REASON.ORDER_CANCELLED,
      now,
    );

    expect(reverted).toBe(1);
    // Trả về pool nghĩa là giảm sold, không phải tăng reserved.
    const data = harness.itemUpdate.mock.calls[0][0].data;
    expect(data.soldQuantity?.decrement).toBe(FIXTURE.REQUESTED_QUANTITY);
    expect(data.reservedQuantity).toBeUndefined();
  });

  it('release trả lại quota và ghi lý do', async () => {
    const harness = buildHarness([], 1, [COMMITTED_RESERVATION]);

    const released = await service.releaseQuota(
      harness.transaction,
      FIXTURE.CHECKOUT_SESSION_ID,
      RELEASE_REASON.CHECKOUT_CANCELLED,
      now,
    );

    expect(released).toBe(1);
    expect(harness.itemUpdate.mock.calls[0][0].data.reservedQuantity?.decrement).toBe(FIXTURE.REQUESTED_QUANTITY);
    expect(harness.reservationUpdate.mock.calls[0][0].data.releaseReason).toBe(RELEASE_REASON.CHECKOUT_CANCELLED);
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
    const client = clientWith([buildItem(SOLD_OUT_ITEM)]);

    const deals = await service.resolveActiveDeals(client, [FIXTURE.VARIANT_ID], now);

    expect(deals.size).toBe(0);
  });

  it('chọn giá thấp nhất khi một SKU nằm trong nhiều campaign', async () => {
    const client = clientWith([
      buildItem({ id: FIXTURE.ITEM_ID, salePrice: new Prisma.Decimal(FIXTURE.LOWER_SALE_PRICE) }),
      buildItem({ id: FIXTURE.SECOND_ITEM_ID, salePrice: new Prisma.Decimal(FIXTURE.SALE_PRICE) }),
    ]);

    const deals = await service.resolveActiveDeals(client, [FIXTURE.VARIANT_ID], now);

    expect(deals.get(FIXTURE.VARIANT_ID)?.salePrice.toFixed(2)).toBe(FIXTURE.LOWER_SALE_PRICE);
  });

  it('trả availableQuantity = quota - sold - reserved', async () => {
    const client = clientWith([buildItem()]);

    const deals = await service.resolveActiveDeals(client, [FIXTURE.VARIANT_ID], now);

    expect(deals.get(FIXTURE.VARIANT_ID)?.availableQuantity).toBe(
      FIXTURE.QUOTA - FIXTURE.SOLD - FIXTURE.RESERVED,
    );
  });
});
