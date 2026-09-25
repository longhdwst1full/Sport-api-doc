import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { PrismaService } from '../src/database/prisma.service';
import { CART_STATUS } from '../src/modules/cart/cart.constants';
import { CartService } from '../src/modules/cart/cart.service';

/**
 * Gộp giỏ khách vãng lai chạy song song trên PostgreSQL thật: hai tab cùng đăng nhập hoặc client
 * retry sau timeout. Khoá hai giỏ (`FOR UPDATE`) phải bảo đảm giỏ khách chỉ được cộng đúng một lần.
 */
describe('Cart guest merge concurrency (PostgreSQL)', () => {
  const cleanup = new PrismaClient();
  const suffix = uuidv7().replaceAll('-', '').slice(-12);
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      return undefined;
    }),
    getOrThrow: jest.fn().mockReturnValue(30),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const service = new CartService(prisma, config);

  let userId = 0n;
  let productId = 0n;
  const variantIds: bigint[] = [];
  const cartIds: bigint[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const user = await cleanup.user.create({
      data: {
        userType: 'CUSTOMER',
        email: `cart-merge-${suffix}@example.invalid`,
        normalizedEmail: `cart-merge-${suffix}@example.invalid`,
        displayName: 'Cart merge integration',
        status: 'ACTIVE',
      },
    });
    userId = user.id;
    const product = await cleanup.product.create({
      data: { productNo: `PM-${suffix}`, name: 'Cart merge product', slug: `cart-merge-${suffix}` },
    });
    productId = product.id;
    for (const label of ['SHARED', 'GUEST']) {
      const variant = await cleanup.productVariant.create({
        data: { productId, sku: `CM-${label}-${suffix}`, name: `Cart merge ${label}` },
      });
      variantIds.push(variant.id);
    }
  });

  afterAll(async () => {
    if (cartIds.length > 0) {
      await cleanup.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      await cleanup.cart.deleteMany({ where: { id: { in: cartIds } } });
    }
    await cleanup.cartItem.deleteMany({ where: { cart: { userId } } });
    await cleanup.cart.deleteMany({ where: { userId } });
    await cleanup.productVariant.deleteMany({ where: { productId } });
    await cleanup.product.deleteMany({ where: { id: productId } });
    await cleanup.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  it('adds the guest cart exactly once when two merges race', async () => {
    const [sharedVariantId, guestOnlyVariantId] = variantIds;
    const guest = await service.createGuest();
    const guestToken = guest.cartToken ?? '';
    expect(guestToken).not.toBe('');
    const guestCartId = BigInt(guest.id);
    const accountCartId = await service.resolveAccountCartId(userId.toString());
    cartIds.push(guestCartId, accountCartId);
    // Ghi thẳng dòng hàng: bài test nhắm vào lần gộp, không vào điều kiện "biến thể còn bán được".
    await cleanup.cartItem.createMany({
      data: [
        { cartId: guestCartId, productVariantId: sharedVariantId, quantity: 2, priceSeenAt: new Date(), unitPricePreview: '100000.00' },
        { cartId: guestCartId, productVariantId: guestOnlyVariantId, quantity: 1, priceSeenAt: new Date(), unitPricePreview: '50000.00' },
        { cartId: accountCartId, productVariantId: sharedVariantId, quantity: 3, priceSeenAt: new Date(), unitPricePreview: '100000.00' },
      ],
    });

    const results = await Promise.allSettled([
      service.mergeGuestCartIntoAccount(guestToken, userId.toString()),
      service.mergeGuestCartIntoAccount(guestToken, userId.toString()),
      service.mergeGuestCartIntoAccount(guestToken, userId.toString()),
    ]);

    expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    const items = await cleanup.cartItem.findMany({
      where: { cartId: accountCartId },
      orderBy: { productVariantId: 'asc' },
      select: { productVariantId: true, quantity: true },
    });
    expect(items).toEqual([
      { productVariantId: sharedVariantId, quantity: 5 },
      { productVariantId: guestOnlyVariantId, quantity: 1 },
    ]);
    const guestCart = await cleanup.cart.findUniqueOrThrow({ where: { id: guestCartId } });
    expect(guestCart.status).toBe(CART_STATUS.CONVERTED);
  });
});
