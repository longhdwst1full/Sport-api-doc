import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import type { AuthPrincipal } from '../src/modules/auth/auth.types';
import { FulfillmentService } from '../src/modules/fulfillment/services/fulfillment.service';
import { ScopeType } from '../src/modules/iam/iam.types';

jest.setTimeout(120_000);

describe('Fulfillment stock commit and delivery return', () => {
  const cleanup = new PrismaClient();
  const marker = `ful-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      return undefined;
    }),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const service = new FulfillmentService(
    prisma,
    { write: jest.fn().mockResolvedValue({ id: '1', createdAt: new Date().toISOString() }) } as unknown as AuditWriter,
  );
  let branchId = 0n;
  let warehouseId = 0n;
  let customerId = 0n;
  let adminId = 0n;
  let productId = 0n;
  let variantId = 0n;
  const orderIds: bigint[] = [];
  const fulfillmentIds: bigint[] = [];
  const checkoutIds: bigint[] = [];
  const reservationIds: bigint[] = [];
  const cartIds: bigint[] = [];

  const principal = (): AuthPrincipal => ({
    userId: adminId.toString(),
    sessionId: '1',
    displayName: 'Fulfillment integration owner',
    permissionVersion: '1',
    permissions: ['fulfillment.view', 'fulfillment.pick', 'fulfillment.pack', 'fulfillment.ship', 'fulfillment.delivery_update'],
    scopes: [{ type: ScopeType.GLOBAL }],
    mustChangePassword: false,
  });

  async function createFulfillment(sequence: number) {
    const cart = await cleanup.cart.create({
      data: {
        anonymousTokenHash: createHash('sha256').update(`${marker}-cart-${sequence}`).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    cartIds.push(cart.id);
    const checkout = await cleanup.checkoutSession.create({
      data: {
        checkoutToken: `${marker}-checkout-${sequence}`,
        cartId: cart.id,
        customerId,
        branchId,
        warehouseId,
        status: 'COMPLETED',
        paymentMethod: 'COD',
        shippingMethod: 'STANDARD_DELIVERY',
        itemSubtotal: '500000',
        shippingTotal: '50000',
        grandTotal: '550000',
        etaMinDays: 1,
        etaMaxDays: 2,
        recipientSnapshot: { recipient: 'Khách kiểm thử giao vận' },
        shippingRuleSnapshot: { source: 'INTEGRATION_TEST' },
        idempotencyKey: `${marker}-checkout-${sequence}`,
        requestHash: createHash('sha256').update(`${marker}-checkout-${sequence}`).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        confirmedAt: new Date(),
      },
    });
    checkoutIds.push(checkout.id);
    const reservation = await cleanup.inventoryReservation.create({
      data: {
        checkoutSessionId: checkout.id,
        warehouseId,
        reservationToken: `${marker}-reservation-${sequence}`,
        idempotencyKey: `${marker}-reservation-${sequence}`,
        requestHash: createHash('sha256').update(`${marker}-reservation-${sequence}`).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        items: { create: { productVariantId: variantId, quantity: 1 } },
      },
    });
    reservationIds.push(reservation.id);
    const order = await cleanup.order.create({
      data: {
        orderNo: `FTEST-${Date.now()}-${sequence}`,
        idempotencyKey: `${marker}-order-${sequence}`,
        requestHash: createHash('sha256').update(`${marker}-order-${sequence}`).digest('hex'),
        checkoutSessionId: checkout.id,
        reservationId: reservation.id,
        customerId,
        branchId,
        warehouseId,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'PENDING',
        subtotal: '500000',
        shippingTotal: '50000',
        grandTotal: '550000',
        addresses: {
          create: {
            recipientName: 'Khách kiểm thử giao vận',
            recipientPhone: '+84901234567',
            addressLine: '1 Nguyễn Trãi',
            provinceCode: '79',
            provinceName: 'TP. Hồ Chí Minh',
          },
        },
        statusHistory: { create: { sequenceNo: 1, toStatus: 'CONFIRMED', actorType: 'USER', actorId: adminId, requestId: marker } },
        payment: {
          create: {
            paymentRef: `${marker}-payment-${sequence}`.toUpperCase(),
            method: 'COD',
            status: 'PENDING',
            expectedAmount: '550000',
          },
        },
        fulfillment: {
          create: {
            warehouseId,
            fulfillmentNo: `${marker}-shipment-${sequence}`.toUpperCase(),
            history: { create: { sequenceNo: 1, toStatus: 'PENDING', requestId: marker } },
          },
        },
      },
      include: { fulfillment: true },
    });
    orderIds.push(order.id);
    fulfillmentIds.push(order.fulfillment!.id);
    return order.fulfillment!;
  }

  beforeAll(async () => {
    await prisma.$connect();
    branchId = (await cleanup.branch.create({
      data: { code: marker.toUpperCase().slice(0, 32), name: 'Fulfillment test branch', addressJson: {} },
    })).id;
    warehouseId = (await cleanup.warehouse.create({
      data: { branchId, code: `${marker}-wh`.toUpperCase().slice(0, 32), name: 'Fulfillment test warehouse' },
    })).id;
    customerId = (await cleanup.customer.create({
      data: {
        customerNo: `${marker}-cus`.toUpperCase().slice(0, 32),
        name: 'Fulfillment test customer',
        phone: `+849${Date.now().toString().slice(-8)}`,
        normalizedPhone: `+849${Date.now().toString().slice(-8)}`,
      },
    })).id;
    adminId = (await cleanup.user.create({
      data: {
        userType: 'STAFF',
        email: `${marker}@example.invalid`,
        normalizedEmail: `${marker}@example.invalid`,
        displayName: 'Fulfillment test owner',
      },
    })).id;
    productId = (await cleanup.product.create({
      data: { productNo: `${marker}-p`.toUpperCase().slice(0, 32), name: 'Sản phẩm giao vận', slug: marker },
    })).id;
    variantId = (await cleanup.productVariant.create({
      data: { productId, sku: `${marker}-sku`.toUpperCase().slice(0, 64), name: 'Mặc định' },
    })).id;
    await cleanup.inventoryBalance.create({
      data: { warehouseId, productVariantId: variantId, onHand: 4, reserved: 2 },
    });
  });

  afterAll(async () => {
    await cleanup.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('ALTER TABLE public.inventory_movements DISABLE TRIGGER inventory_movements_no_update_or_delete');
      await transaction.inventoryMovement.deleteMany({ where: { referenceType: 'FULFILLMENT', referenceId: { in: fulfillmentIds.map(String) } } });
      await transaction.$executeRawUnsafe('ALTER TABLE public.inventory_movements ENABLE TRIGGER inventory_movements_no_update_or_delete');
    });
    await cleanup.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('ALTER TABLE public.fulfillment_status_history DISABLE TRIGGER fulfillment_history_no_update_or_delete');
      await transaction.fulfillmentStatusHistory.deleteMany({ where: { fulfillment: { orderId: { in: orderIds } } } });
      await transaction.$executeRawUnsafe('ALTER TABLE public.fulfillment_status_history ENABLE TRIGGER fulfillment_history_no_update_or_delete');
    });
    await cleanup.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
    await cleanup.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await cleanup.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await cleanup.orderAddress.deleteMany({ where: { orderId: { in: orderIds } } });
    await cleanup.order.deleteMany({ where: { id: { in: orderIds } } });
    await cleanup.inventoryReservationItem.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await cleanup.inventoryReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await cleanup.checkoutSession.deleteMany({ where: { id: { in: checkoutIds } } });
    await cleanup.cart.deleteMany({ where: { id: { in: cartIds } } });
    await cleanup.inventoryBalance.deleteMany({ where: { warehouseId, productVariantId: variantId } });
    if (variantId) await cleanup.productVariant.delete({ where: { id: variantId } });
    if (productId) await cleanup.product.delete({ where: { id: productId } });
    if (customerId) await cleanup.customer.delete({ where: { id: customerId } });
    if (adminId) await cleanup.user.delete({ where: { id: adminId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  it('commits stock once at ship and supports a successful delivery', async () => {
    const fulfillment = await createFulfillment(1);
    const picked = await service.pick(fulfillment.id.toString(), { expectedVersion: '0' }, `${marker}-pick-1`, `${marker}-request-pick`, principal());
    const packed = await service.pack(fulfillment.id.toString(), { expectedVersion: picked.version }, `${marker}-pack-1`, `${marker}-request-pack`, principal());
    const shipped = await service.ship(fulfillment.id.toString(), { expectedVersion: packed.version, carrierCode: 'MANUAL', trackingNo: 'TEST-001' }, `${marker}-ship-1`, `${marker}-request-ship`, principal());
    const shipCommand = { expectedVersion: packed.version, carrierCode: 'MANUAL', trackingNo: 'TEST-001' };
    const replay = await service.ship(fulfillment.id.toString(), shipCommand, `${marker}-ship-1`, `${marker}-request-ship-replay`, principal());
    const delivered = await service.deliver(fulfillment.id.toString(), { expectedVersion: shipped.version, note: 'Khách đã nhận đủ hàng' }, `${marker}-deliver-1`, `${marker}-request-deliver`, principal());

    expect(replay.version).toBe(shipped.version);
    expect(delivered).toMatchObject({ status: 'DELIVERED', orderStatus: 'DELIVERED', paymentStatus: 'PENDING' });
    await expect(cleanup.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_productVariantId: { warehouseId, productVariantId: variantId } },
    })).resolves.toMatchObject({ onHand: 3, reserved: 1 });
    await expect(cleanup.inventoryReservation.findUniqueOrThrow({
      where: { id: reservationIds[0] },
    })).resolves.toMatchObject({ status: 'COMMITTED' });
    await expect(cleanup.inventoryMovement.count({
      where: { referenceId: fulfillment.id.toString(), movementType: 'SALE_SHIP' },
    })).resolves.toBe(1);
  });

  it('returns a failed delivery to the same warehouse and restocks only SELLABLE goods', async () => {
    const fulfillment = await createFulfillment(2);
    const picked = await service.pick(fulfillment.id.toString(), { expectedVersion: '0' }, `${marker}-pick-2`, `${marker}-request-pick-2`, principal());
    const packed = await service.pack(fulfillment.id.toString(), { expectedVersion: picked.version }, `${marker}-pack-2`, `${marker}-request-pack-2`, principal());
    const shipped = await service.ship(fulfillment.id.toString(), { expectedVersion: packed.version }, `${marker}-ship-2`, `${marker}-request-ship-2`, principal());
    const failed = await service.failDelivery(fulfillment.id.toString(), {
      expectedVersion: shipped.version,
      reasonCode: 'CUSTOMER_UNAVAILABLE',
      reason: 'Không liên hệ được khách nhận hàng sau nhiều lần gọi',
    }, `${marker}-fail-2`, `${marker}-request-fail-2`, principal());
    const returned = await service.receiveReturn(fulfillment.id.toString(), {
      expectedVersion: failed.version,
      condition: 'SELLABLE',
      reason: 'Kho đã kiểm tra, sản phẩm nguyên vẹn và đủ điều kiện bán lại',
    }, `${marker}-return-2`, `${marker}-request-return-2`, principal());

    expect(failed.status).toBe('RETURNING_TO_WAREHOUSE');
    expect(returned).toMatchObject({
      status: 'RETURNED_TO_WAREHOUSE',
      returnCondition: 'SELLABLE',
      warehouseId: warehouseId.toString(),
    });
    await expect(cleanup.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_productVariantId: { warehouseId, productVariantId: variantId } },
    })).resolves.toMatchObject({ onHand: 3, reserved: 0 });
    await expect(cleanup.inventoryMovement.count({
      where: { referenceId: fulfillment.id.toString(), movementType: 'DELIVERY_RETURN_RESTOCK' },
    })).resolves.toBe(1);
  });
});
