import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { FlashSaleQuotaExpiryService } from './flash-sale-quota-expiry.service';

const FIXTURE = {
  BATCH_SIZE: 50,
  ITEM_ID: 7n,
  SECOND_ITEM_ID: 8n,
  FIRST_RESERVATION_ID: 3n,
  SECOND_RESERVATION_ID: 4n,
  QUANTITY: 2,
  SECOND_QUANTITY: 5,
} as const;

interface ReservationRow {
  id: bigint;
  flashSaleItemId: bigint;
  quantity: number;
}

function buildService(
  lockedIds: bigint[],
  reservations: ReservationRow[],
  updatedCount = reservations.length,
  { enabled = true, prismaEnabled = true } = {},
) {
  const queryRaw = jest.fn().mockResolvedValue(lockedIds.map((id) => ({ id })));
  const findMany = jest.fn().mockResolvedValue(reservations);
  const updateMany = jest.fn().mockResolvedValue({ count: updatedCount });
  const itemUpdate = jest
    .fn<Promise<unknown>, [{ where: { id: bigint }; data: { reservedQuantity: { decrement: number } } }]>()
    .mockResolvedValue({});

  const transaction = {
    $queryRaw: queryRaw,
    flashSaleQuotaReservation: { findMany, updateMany },
    flashSaleItem: { update: itemUpdate },
  };
  const prisma = {
    isEnabled: () => prismaEnabled,
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  const config = {
    get: jest.fn().mockReturnValue(enabled),
    getOrThrow: jest.fn().mockReturnValue(FIXTURE.BATCH_SIZE),
  } as unknown as ConfigService;

  return { service: new FlashSaleQuotaExpiryService(prisma, config), itemUpdate, updateMany };
}

describe('FlashSaleQuotaExpiryService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('không chạm database khi job bị tắt', async () => {
    const { service, updateMany } = buildService([], [], 0, { enabled: false });

    const result = await service.run();

    expect(result.enabled).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('trả suất về pool cho reservation quá hạn', async () => {
    const { service, itemUpdate } = buildService(
      [FIXTURE.FIRST_RESERVATION_ID],
      [
        {
          id: FIXTURE.FIRST_RESERVATION_ID,
          flashSaleItemId: FIXTURE.ITEM_ID,
          quantity: FIXTURE.QUANTITY,
        },
      ],
    );

    const result = await service.run();

    expect(result.expired).toBe(1);
    // Hết hạn nghĩa là chưa bán được: chỉ giảm reserved, không đụng sold.
    const call = itemUpdate.mock.calls[0][0];
    expect(call.where.id).toBe(FIXTURE.ITEM_ID);
    expect(call.data.reservedQuantity.decrement).toBe(FIXTURE.QUANTITY);
  });

  it('gộp nhiều reservation cùng một suất thành một lần trừ', async () => {
    const { service, itemUpdate } = buildService(
      [FIXTURE.FIRST_RESERVATION_ID, FIXTURE.SECOND_RESERVATION_ID],
      [
        { id: FIXTURE.FIRST_RESERVATION_ID, flashSaleItemId: FIXTURE.ITEM_ID, quantity: FIXTURE.QUANTITY },
        { id: FIXTURE.SECOND_RESERVATION_ID, flashSaleItemId: FIXTURE.ITEM_ID, quantity: FIXTURE.SECOND_QUANTITY },
      ],
    );

    await service.run();

    expect(itemUpdate).toHaveBeenCalledTimes(1);
    expect(itemUpdate.mock.calls[0][0].data.reservedQuantity.decrement).toBe(
      FIXTURE.QUANTITY + FIXTURE.SECOND_QUANTITY,
    );
  });

  it('rollback khi bản ghi đổi trạng thái giữa lúc lock và lúc ghi', async () => {
    // updateMany khớp ít hơn số đã claim: có reservation vừa được commit ở luồng khác.
    const { service, itemUpdate } = buildService(
      [FIXTURE.FIRST_RESERVATION_ID],
      [{ id: FIXTURE.FIRST_RESERVATION_ID, flashSaleItemId: FIXTURE.ITEM_ID, quantity: FIXTURE.QUANTITY }],
      0,
    );

    await expect(service.run()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it('báo hasMore khi batch đầy để scheduler gọi lại', async () => {
    const ids = Array.from({ length: FIXTURE.BATCH_SIZE }, (_, index) => BigInt(index + 1));
    const { service } = buildService(
      ids,
      ids.map((id) => ({ id, flashSaleItemId: FIXTURE.ITEM_ID, quantity: 1 })),
    );

    const result = await service.run();

    expect(result.hasMore).toBe(true);
  });
});
