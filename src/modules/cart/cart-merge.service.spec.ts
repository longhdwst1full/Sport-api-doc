import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CART_STATUS } from './cart.constants';
import { CartService } from './cart.service';

const FIXTURE = {
  GUEST_TOKEN: 'guest-token-abc',
  USER_ID: '5',
  GUEST_CART_ID: 11n,
  ACCOUNT_CART_ID: 22n,
  SHARED_VARIANT_ID: 60n,
  GUEST_ONLY_VARIANT_ID: 61n,
  ACCOUNT_ITEM_ID: 901n,
  GUEST_QUANTITY: 2,
  ACCOUNT_QUANTITY: 3,
} as const;

interface CartItemRow {
  id?: bigint;
  productVariantId: bigint;
  quantity: number;
  unitPricePreview: Prisma.Decimal;
}

function buildHarness({
  guestItems,
  accountItems,
  guestFound = true,
}: {
  guestItems: CartItemRow[];
  accountItems: CartItemRow[];
  guestFound?: boolean;
}) {
  const emptyCart = { id: FIXTURE.ACCOUNT_CART_ID, currencyCode: 'VND', version: 0, items: [] };

  const itemUpdate = jest
    .fn<Promise<unknown>, [{ where: { id: bigint }; data: { quantity: number } }]>()
    .mockResolvedValue({});
  const itemCreate = jest
    .fn<Promise<unknown>, [{ data: { productVariantId: bigint; quantity: number } }]>()
    .mockResolvedValue({});
  const cartUpdate = jest
    .fn<Promise<unknown>, [{ where: { id: bigint }; data: { status?: string } }]>()
    .mockResolvedValue({});

  const lockCarts = jest.fn().mockResolvedValue([]);
  const transaction = {
    $queryRaw: lockCarts,
    cart: {
      findFirst: jest.fn().mockResolvedValue(
        guestFound
          ? { id: FIXTURE.GUEST_CART_ID, status: CART_STATUS.ACTIVE, items: guestItems }
          : null,
      ),
      update: cartUpdate,
      findUniqueOrThrow: jest.fn().mockResolvedValue(emptyCart),
    },
    cartItem: {
      findMany: jest.fn().mockResolvedValue(accountItems),
      update: itemUpdate,
      create: itemCreate,
    },
  };

  const prisma = {
    isEnabled: () => true,
    user: { findFirst: jest.fn().mockResolvedValue({ id: 5n }) },
    cart: {
      findFirst: jest.fn().mockResolvedValue(emptyCart),
      findFirstOrThrow: jest.fn().mockResolvedValue(emptyCart),
    },
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;

  const config = { getOrThrow: jest.fn().mockReturnValue(30) } as unknown as ConfigService;
  return { service: new CartService(prisma, config), itemUpdate, itemCreate, cartUpdate, lockCarts, transaction };
}

describe('CartService.mergeGuestCartIntoAccount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cộng dồn số lượng khi cùng một biến thể có ở cả hai giỏ', async () => {
    const harness = buildHarness({
      guestItems: [
        {
          productVariantId: FIXTURE.SHARED_VARIANT_ID,
          quantity: FIXTURE.GUEST_QUANTITY,
          unitPricePreview: new Prisma.Decimal('100000.00'),
        },
      ],
      accountItems: [
        {
          id: FIXTURE.ACCOUNT_ITEM_ID,
          productVariantId: FIXTURE.SHARED_VARIANT_ID,
          quantity: FIXTURE.ACCOUNT_QUANTITY,
          unitPricePreview: new Prisma.Decimal('100000.00'),
        },
      ],
    });

    await harness.service.mergeGuestCartIntoAccount(FIXTURE.GUEST_TOKEN, FIXTURE.USER_ID);

    // Cộng dồn chứ không ghi đè: khách đã chủ động chọn ở cả hai phiên.
    expect(harness.itemUpdate.mock.calls[0][0].data.quantity).toBe(
      FIXTURE.GUEST_QUANTITY + FIXTURE.ACCOUNT_QUANTITY,
    );
    expect(harness.itemCreate).not.toHaveBeenCalled();
  });

  it('tạo dòng mới cho biến thể chỉ có ở giỏ khách vãng lai', async () => {
    const harness = buildHarness({
      guestItems: [
        {
          productVariantId: FIXTURE.GUEST_ONLY_VARIANT_ID,
          quantity: FIXTURE.GUEST_QUANTITY,
          unitPricePreview: new Prisma.Decimal('250000.00'),
        },
      ],
      accountItems: [],
    });

    await harness.service.mergeGuestCartIntoAccount(FIXTURE.GUEST_TOKEN, FIXTURE.USER_ID);

    expect(harness.itemCreate.mock.calls[0][0].data.productVariantId).toBe(
      FIXTURE.GUEST_ONLY_VARIANT_ID,
    );
    expect(harness.itemUpdate).not.toHaveBeenCalled();
  });

  it('đóng giỏ khách vãng lai sau khi gộp để gọi lại không cộng thêm lần nữa', async () => {
    const harness = buildHarness({
      guestItems: [
        {
          productVariantId: FIXTURE.GUEST_ONLY_VARIANT_ID,
          quantity: 1,
          unitPricePreview: new Prisma.Decimal('99000.00'),
        },
      ],
      accountItems: [],
    });

    await harness.service.mergeGuestCartIntoAccount(FIXTURE.GUEST_TOKEN, FIXTURE.USER_ID);

    const converted = harness.cartUpdate.mock.calls.find(
      ([call]) => call.where.id === FIXTURE.GUEST_CART_ID,
    );
    expect(converted?.[0].data.status).toBe(CART_STATUS.CONVERTED);
  });

  it('không lỗi khi token sai hoặc giỏ đã gộp rồi', async () => {
    const harness = buildHarness({ guestItems: [], accountItems: [], guestFound: false });

    await expect(
      harness.service.mergeGuestCartIntoAccount(FIXTURE.GUEST_TOKEN, FIXTURE.USER_ID),
    ).resolves.toBeDefined();
    expect(harness.itemCreate).not.toHaveBeenCalled();
    expect(harness.itemUpdate).not.toHaveBeenCalled();
  });

  it('không có token thì trả giỏ tài khoản, không mở transaction', async () => {
    const harness = buildHarness({ guestItems: [], accountItems: [] });

    await expect(
      harness.service.mergeGuestCartIntoAccount('   ', FIXTURE.USER_ID),
    ).resolves.toBeDefined();
    expect(harness.itemCreate).not.toHaveBeenCalled();
  });

  it('khoá cả hai giỏ trước khi đọc dòng hàng', async () => {
    const harness = buildHarness({
      guestItems: [
        { productVariantId: FIXTURE.GUEST_ONLY_VARIANT_ID, quantity: 1, unitPricePreview: new Prisma.Decimal('1.00') },
      ],
      accountItems: [],
    });

    await harness.service.mergeGuestCartIntoAccount(FIXTURE.GUEST_TOKEN, FIXTURE.USER_ID);

    expect(harness.lockCarts).toHaveBeenCalledTimes(1);
    const lockOrder = harness.lockCarts.mock.invocationCallOrder[0];
    const itemsReadOrder = harness.transaction.cartItem.findMany.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(itemsReadOrder);
  });

  it('là no-op khi request khác đã gộp xong trong lúc chờ khoá', async () => {
    const harness = buildHarness({
      guestItems: [
        { productVariantId: FIXTURE.GUEST_ONLY_VARIANT_ID, quantity: 1, unitPricePreview: new Prisma.Decimal('1.00') },
      ],
      accountItems: [],
    });
    // Lần đọc đầu thấy ACTIVE; sau khi giữ khoá thì giỏ đã CONVERTED nên không còn khớp.
    harness.transaction.cart.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: FIXTURE.GUEST_CART_ID })
      .mockResolvedValueOnce(null);

    await harness.service.mergeGuestCartIntoAccount(FIXTURE.GUEST_TOKEN, FIXTURE.USER_ID);

    expect(harness.itemCreate).not.toHaveBeenCalled();
    expect(harness.itemUpdate).not.toHaveBeenCalled();
    expect(harness.cartUpdate).not.toHaveBeenCalled();
  });
});
