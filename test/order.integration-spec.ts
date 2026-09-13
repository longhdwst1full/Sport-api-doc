import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import { CartService } from '../src/modules/cart/cart.service';
import { OrderService } from '../src/modules/order/services/order.service';
import { ScopeType } from '../src/modules/iam/iam.types';
import { createApplication } from '../src/platform/app.factory';
import request from 'supertest';

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
  let app: INestApplication;
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
    { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService,
  );

  beforeAll(async () => {
    await prisma.$connect();
    app = await createApplication({ logger: false, swagger: false });
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
        anonymousTokenHash: createHash('sha256').update('guest-token').digest('hex'),
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
    await cleanup.inventoryBalance.create({
      data: {
        warehouseId,
        productVariantId: variantId,
        onHand: 2,
        reserved: 1,
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    // Fulfillment history is append-only in production. Disable its exact row
    // trigger only while removing this isolated integration fixture.
    await cleanup.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE public.fulfillment_status_history DISABLE TRIGGER fulfillment_history_no_update_or_delete',
      );
      await transaction.fulfillmentStatusHistory.deleteMany({
        where: { fulfillment: { order: { checkoutSessionId: checkoutId } } },
      });
      await transaction.$executeRawUnsafe(
        'ALTER TABLE public.fulfillment_status_history ENABLE TRIGGER fulfillment_history_no_update_or_delete',
      );
    });
    await cleanup.fulfillment.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    await cleanup.orderStatusHistory.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    await cleanup.orderAddress.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    await cleanup.orderItemComponent.deleteMany({ where: { orderItem: { order: { checkoutSessionId: checkoutId } } } });
    await cleanup.orderItem.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    // TEST-CLEANUP: production rows are append-only. Disable exactly the row
    // mutation trigger inside one rollback-safe DDL transaction for this fixture.
    await cleanup.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        'ALTER TABLE public.payment_transactions DISABLE TRIGGER payment_transactions_no_update_or_delete',
      );
      await transaction.paymentTransaction.deleteMany({
        where: { payment: { order: { checkoutSessionId: checkoutId } } },
      });
      await transaction.$executeRawUnsafe(
        'ALTER TABLE public.payment_transactions ENABLE TRIGGER payment_transactions_no_update_or_delete',
      );
    });
    await cleanup.paymentEvidence.deleteMany({ where: { payment: { order: { checkoutSessionId: checkoutId } } } });
    await cleanup.payment.deleteMany({ where: { order: { checkoutSessionId: checkoutId } } });
    await cleanup.order.deleteMany({ where: { checkoutSessionId: checkoutId } });
    if (reservationId) await cleanup.inventoryReservationItem.deleteMany({ where: { reservationId } });
    if (reservationId) await cleanup.inventoryReservation.delete({ where: { id: reservationId } });
    if (checkoutId) await cleanup.checkoutSessionItem.deleteMany({ where: { checkoutSessionId: checkoutId } });
    if (checkoutId) await cleanup.checkoutSession.delete({ where: { id: checkoutId } });
    if (cartId) await cleanup.cart.delete({ where: { id: cartId } });
    if (variantId && warehouseId) {
      await cleanup.inventoryBalance.deleteMany({ where: { warehouseId, productVariantId: variantId } });
    }
    if (variantId) await cleanup.productVariant.delete({ where: { id: variantId } });
    if (productId) await cleanup.product.delete({ where: { id: productId } });
    if (customerId) await cleanup.customer.delete({ where: { id: customerId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  const server = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

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
    const payment = await cleanup.payment.findUniqueOrThrow({ where: { orderId: BigInt(first.id) } });
    expect(payment).toMatchObject({ method: 'COD', status: 'PENDING', expiresAt: null });
    expect(payment.expectedAmount.toFixed(2)).toBe('1000000.00');
    expect(payment.receivedAmount.toFixed(2)).toBe('0.00');
    await expect(cleanup.paymentTransaction.count({
      where: { paymentId: payment.id, transactionType: 'CREATED' },
    })).resolves.toBe(1);
    await expect(cleanup.fulfillment.count({ where: { orderId: BigInt(first.id) } })).resolves.toBe(1);
  });

  it('cancels once, releases reserved stock atomically and replays the same command', async () => {
    await service.placeGuest(
      'guest-token',
      `${marker}-checkout`,
      `${marker}-order-idem`,
      `${marker}-cancel-setup`,
    );
    const placed = await cleanup.order.findUniqueOrThrow({
      where: { checkoutSessionId: checkoutId },
    });
    await request(server())
      .get(`/api/v1/orders/guest/${placed.orderNo}`)
      .set('x-cart-token', 'guest-token')
      .expect(200);
    await request(server())
      .get(`/api/v1/orders/guest/${placed.orderNo}`)
      .set('x-cart-token', 'token-khong-thuoc-don')
      .expect(404);
    const missingIdempotency = await request(server())
      .post(`/api/v1/orders/guest/${placed.orderNo}/cancel`)
      .set('x-cart-token', 'guest-token')
      .send({ expectedVersion: Number(placed.version), reason: 'Khách đổi nhu cầu' })
      .expect(400);
    expect(missingIdempotency.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Header Idempotency-Key hợp lệ là bắt buộc',
    });
    const command = { expectedVersion: Number(placed.version), reason: 'Khách đổi nhu cầu trước khi thanh toán' };
    const otherBranchAdmin = {
      userId: '1',
      sessionId: '1',
      displayName: 'Quản lý chi nhánh khác',
      permissionVersion: '1',
      permissions: ['order.manage'],
      scopes: [{ type: ScopeType.BRANCH, branchId: (branchId + 999999n).toString() }],
      mustChangePassword: false,
    };
    await expect(service.cancelAdmin(
      placed.id.toString(),
      command,
      `${marker}-foreign-branch-cancel`,
      `${marker}-foreign-branch-request`,
      otherBranchAdmin,
    )).rejects.toThrow('Không tìm thấy đơn hàng trong phạm vi được phân quyền');
    const first = await service.cancelGuest(
      'guest-token',
      placed.orderNo,
      command,
      `${marker}-cancel-idem`,
      `${marker}-cancel-request-1`,
    );
    const replay = await service.cancelGuest(
      'guest-token',
      placed.orderNo,
      command,
      `${marker}-cancel-idem`,
      `${marker}-cancel-request-2`,
    );

    expect(first.status).toBe('CANCELLED');
    expect(replay.version).toBe(first.version);
    await expect(service.cancelGuest(
      'guest-token',
      placed.orderNo,
      { ...command, expectedVersion: command.expectedVersion + 1 },
      `${marker}-cancel-idem`,
      `${marker}-cancel-request-conflict`,
    )).rejects.toThrow('Idempotency-Key đã được dùng cho thao tác đơn hàng khác');
    await expect(cleanup.inventoryReservation.findUniqueOrThrow({ where: { id: reservationId } }))
      .resolves.toMatchObject({ status: 'RELEASED', releaseReason: command.reason });
    await expect(cleanup.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_productVariantId: { warehouseId, productVariantId: variantId } },
    })).resolves.toMatchObject({ onHand: 2, reserved: 0 });
    await expect(cleanup.orderStatusHistory.count({
      where: { orderId: placed.id, toStatus: 'CANCELLED' },
    })).resolves.toBe(1);
  });

  it('lets a scoped Admin complete a delivered and fully paid order once', async () => {
    await service.placeGuest(
      'guest-token',
      `${marker}-checkout`,
      `${marker}-order-idem`,
      `${marker}-complete-setup`,
    );
    const cancelled = await cleanup.order.findUniqueOrThrow({
      where: { checkoutSessionId: checkoutId },
    });
    const delivered = await cleanup.order.update({
      where: { id: cancelled.id },
      data: {
        // Fulfillment/Payment aggregates are delivered in S4.2/S4.3; this fixture
        // establishes only the preconditions owned by the current manual-complete use case.
        status: 'DELIVERED',
        paymentStatus: 'SUCCESS',
        fulfillmentStatus: 'DELIVERED',
        cancelledAt: null,
        cancelReason: null,
        placedAt: new Date(Date.now() - 7 * 24 * 60 * 60_000),
        version: { increment: 1 },
      },
    });
    const command = {
      expectedVersion: Number(delivered.version),
      reason: 'Đã đối soát đủ tiền và xác nhận khách nhận hàng tại cửa hàng',
    };
    const admin = {
      userId: '1',
      sessionId: '1',
      displayName: 'Integration Owner',
      permissionVersion: '1',
      permissions: ['order.manage'],
      scopes: [{ type: ScopeType.GLOBAL }],
      mustChangePassword: false,
    };

    const first = await service.completeAdmin(
      delivered.id.toString(),
      command,
      `${marker}-complete-idem`,
      `${marker}-complete-request-1`,
      admin,
    );
    const replay = await service.completeAdmin(
      delivered.id.toString(),
      command,
      `${marker}-complete-idem`,
      `${marker}-complete-request-2`,
      admin,
    );

    expect(first.status).toBe('COMPLETED');
    expect(replay.version).toBe(first.version);
    await expect(service.completeAdmin(
      delivered.id.toString(),
      { ...command, expectedVersion: command.expectedVersion + 1 },
      `${marker}-complete-idem`,
      `${marker}-complete-request-conflict`,
      admin,
    )).rejects.toThrow('Idempotency-Key đã được dùng cho thao tác đơn hàng khác');
    const persisted = await cleanup.order.findUniqueOrThrow({ where: { id: delivered.id } });
    expect(persisted.completedAt).toBeInstanceOf(Date);
    await expect(cleanup.orderStatusHistory.count({
      where: { orderId: delivered.id, toStatus: 'COMPLETED' },
    })).resolves.toBe(1);
  });
});
