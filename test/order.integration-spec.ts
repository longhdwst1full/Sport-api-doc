import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import { CartService } from '../src/modules/cart/cart.service';
import { OrderService } from '../src/modules/order/services/order.service';

describe('Order placement persistence and idempotency', () => {
  const cleanup = new PrismaClient();
  const marker = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      return undefined;
    }),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  let branchId = 0n;
  let warehouseId = 0n;
  let customerId = 0n;
  let productId = 0n;
  let variantId = 0n;
  let cartId = 0n;
  let checkoutId = 0n;
  let reservationId = 0n;
  const cartService = {
    resolveGuestCartIdForOrder: jest.fn(() => Promise.resolve(cartId)),
  } as unknown as CartService;
  const service = new OrderService(
    prisma,
    cartService,
    { write: jest.fn().mockResolvedValue({ id: 'test', createdAt: new Date().toISOString() }) } as unknown as AuditWriter,
  );

  beforeAll(async () => {
    await prisma.$connect();
    const branch = await cleanup.branch.create({
      data: {
        code: marker.toUpperCase().slice(0, 32),
        name: 'Order integration branch',
        addressJson: { provinceCode: '79' },
      },
    });
    branchId = branch.id;
    const warehouse = await cleanup.warehouse.create({
      data: { branchId, code: `${marker}-wh`.toUpperCase().slice(0, 32), name: 'Order integration warehouse' },
    });
    warehouseId = warehouse.id;
    const customer = await cleanup.customer.create({
      data: {
        customerNo: `${marker}-cus`.toUpperCase().slice(0, 32),
        name: 'Khách tích hợp',
        phone: '+84901111111',
        normalizedPhone: '+84901111111',
      },
    });
    customerId = customer.id;
    const product = await cleanup.product.create({
      data: { productNo: `${marker}-p`.toUpperCase().slice(0, 32), name: 'Sản phẩm kiểm thử Order', slug: marker },
    });
    productId = product.id;
    const variant = await cleanup.productVariant.create({
      data: { productId, sku: `${marker}-sku`.toUpperCase().slice(0, 64), name: 'Phiên bản tiêu chuẩn' },
    });
    variantId = variant.id;
    const cart = await cleanup.cart.create({
      data: {
        anonymousTokenHash: marker.padEnd(64, 'x').slice(0, 64),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    cartId = cart.id;
    const checkout = await cleanup.checkoutSession.create({
      data: {
        checkoutToken: `${marker}-checkout`,
        cartId,
        customerId,
        branchId,
        warehouseId,
        status: 'CONFIRMED',
        paymentMethod: 'COD',
        shippingMethod: 'BRANCH_FREE',
        currencyCode: 'VND',
        itemSubtotal: '1000000',
        shippingTotal: '0',
        grandTotal: '1000000',
        etaMinDays: 0,
        etaMaxDays: 1,
        recipientSnapshot: {
          recipient: 'Nguyễn Văn Test',
          phone: '+84901111111',
          email: 'test@example.com',
          addressLine: '1 Nguyễn Trãi',
          ward: 'Bến Thành',
          district: 'Quận 1',
          province: 'TP. Hồ Chí Minh',
          provinceCode: '79',
        },
        shippingRuleSnapshot: { source: 'INTEGRATION_TEST' },
        idempotencyKey: `${marker}-checkout-idem`,
        requestHash: marker.padEnd(64, 'a').slice(0, 64),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        confirmedAt: new Date(),
        items: {
          create: {
            productVariantId: variantId,
            skuSnapshot: variant.sku,
            nameSnapshot: variant.name,
            quantity: 1,
            unitPrice: '1000000',
            lineTotal: '1000000',
          },
        },
      },
    });
    checkoutId = checkout.id;
    const reservation = await cleanup.inventoryReservation.create({
      data: {
        checkoutSessionId: checkoutId,
        warehouseId,
        reservationToken: `${marker}-reservation`,
        idempotencyKey: `${marker}-reservation-idem`,
        requestHash: marker.padEnd(64, 'b').slice(0, 64),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        items: { create: { productVariantId: variantId, quantity: 1 } },
      },
    });
    reservationId = reservation.id;
  });

  afterAll(async () => {
    await cleanup.orderStatusHistory.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    await cleanup.orderAddress.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    await cleanup.orderItemComponent.deleteMany({ where: { orderItem: { order: { checkoutSessionId: checkoutId } } } });
    await cleanup.orderItem.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    await cleanup.order.deleteMany({ where: { checkoutSessionId: checkoutId } });
    if (reservationId) await cleanup.inventoryReservationItem.deleteMany({ where: { reservationId } });
    if (reservationId) await cleanup.inventoryReservation.delete({ where: { id: reservationId } });
    if (checkoutId) await cleanup.checkoutSessionItem.deleteMany({ where: { checkoutSessionId: checkoutId } });
    if (checkoutId) await cleanup.checkoutSession.delete({ where: { id: checkoutId } });
    if (cartId) await cleanup.cart.delete({ where: { id: cartId } });
    if (variantId) await cleanup.productVariant.delete({ where: { id: variantId } });
    if (productId) await cleanup.product.delete({ where: { id: productId } });
    if (customerId) await cleanup.customer.delete({ where: { id: customerId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  it('creates exactly one immutable order snapshot when the same command is retried', async () => {
    const first = await service.placeGuest(
      'guest-token',
      `${marker}-checkout`,
      `${marker}-order-idem`,
      `${marker}-request-1`,
    );
    const replay = await service.placeGuest(
      'guest-token',
      `${marker}-checkout`,
      `${marker}-order-idem`,
      `${marker}-request-2`,
    );

    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({
      status: 'PENDING_CONFIRMATION',
      paymentStatus: 'PENDING',
      fulfillmentStatus: 'PENDING',
      recipient: { email: 'test@example.com' },
    });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.sku).toContain('ORDER-');
    expect(first.items[0]?.quantity).toBe(1);
    await expect(cleanup.order.count({ where: { checkoutSessionId: checkoutId } })).resolves.toBe(1);
    await expect(cleanup.checkoutSession.findUniqueOrThrow({ where: { id: checkoutId } }))
      .resolves.toMatchObject({ status: 'COMPLETED' });
    await expect(cleanup.cart.findUniqueOrThrow({ where: { id: cartId } }))
      .resolves.toMatchObject({ status: 'CONVERTED' });
    await expect(cleanup.inventoryReservation.findUniqueOrThrow({ where: { id: reservationId } }))
      .resolves.toMatchObject({ status: 'ACTIVE' });
  });
});
