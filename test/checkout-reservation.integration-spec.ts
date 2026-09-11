import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import { InventoryReservationService } from '../src/modules/checkout/inventory-reservation.service';

describe('Checkout reservation concurrency and idempotency', () => {
  const cleanup = new PrismaClient();
  const marker = `reserve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      return undefined;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'app.checkout.reservationTtlMinutes') return 30;
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const auditWrite = jest.fn().mockResolvedValue({
    id: 'integration',
    createdAt: new Date().toISOString(),
  });
  const service = new InventoryReservationService(
    prisma,
    config,
    { write: auditWrite } as unknown as AuditWriter,
  );

  let branchId = 0n;
  let warehouseId = 0n;
  let productId = 0n;
  let variantId = 0n;
  let balanceId = 0n;
  const cartIds: bigint[] = [];
  const checkoutIds: bigint[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const branch = await cleanup.branch.create({
      data: {
        code: marker.toUpperCase().slice(0, 32),
        name: 'Reservation integration branch',
        addressJson: { provinceCode: '79' },
      },
    });
    branchId = branch.id;
    const warehouse = await cleanup.warehouse.create({
      data: {
        branchId,
        code: `${marker}-wh`.toUpperCase().slice(0, 32),
        name: 'Reservation integration warehouse',
      },
    });
    warehouseId = warehouse.id;
    const product = await cleanup.product.create({
      data: {
        productNo: `${marker}-p`.toUpperCase().slice(0, 32),
        name: 'Reservation integration product',
        slug: marker,
      },
    });
    productId = product.id;
    const variant = await cleanup.productVariant.create({
      data: {
        productId,
        sku: `${marker}-sku`.toUpperCase().slice(0, 64),
        name: 'SKU cuối cùng',
      },
    });
    variantId = variant.id;
    const balance = await cleanup.inventoryBalance.create({
      data: { warehouseId, productVariantId: variantId, onHand: 1, reserved: 0 },
    });
    balanceId = balance.id;

    for (let index = 0; index < 2; index += 1) {
      const cart = await cleanup.cart.create({
        data: {
          anonymousTokenHash: `${index}`.padEnd(64, marker[index] ?? 'a').slice(0, 64),
          branchId,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      cartIds.push(cart.id);
      const checkout = await cleanup.checkoutSession.create({
        data: {
          checkoutToken: `${marker}-checkout-${index}`,
          cartId: cart.id,
          branchId,
          warehouseId,
          status: 'QUOTED',
          paymentMethod: 'COD',
          shippingMethod: 'BRANCH_FREE',
          currencyCode: 'VND',
          itemSubtotal: '100000',
          shippingTotal: '0',
          grandTotal: '100000',
          etaMinDays: 0,
          etaMaxDays: 1,
          recipientSnapshot: { recipient: 'Khách kiểm thử', phone: '+84900000000' },
          shippingRuleSnapshot: { source: 'INTEGRATION_TEST' },
          idempotencyKey: `${marker}-checkout-idem-${index}`,
          requestHash: `${index}`.padEnd(64, 'a'),
          expiresAt: new Date(Date.now() + 30 * 60_000),
          items: {
            create: {
              itemType: 'STANDARD',
              productVariantId: variantId,
              skuSnapshot: variant.sku,
              nameSnapshot: variant.name,
              quantity: 1,
              unitPrice: '100000',
              lineTotal: '100000',
            },
          },
        },
      });
      checkoutIds.push(checkout.id);
    }

    const sameOwnerCheckout = await cleanup.checkoutSession.create({
      data: {
        checkoutToken: `${marker}-checkout-same-owner`,
        cartId: cartIds[0],
        branchId,
        warehouseId,
        status: 'QUOTED',
        paymentMethod: 'COD',
        shippingMethod: 'BRANCH_FREE',
        currencyCode: 'VND',
        itemSubtotal: '100000',
        shippingTotal: '0',
        grandTotal: '100000',
        etaMinDays: 0,
        etaMaxDays: 1,
        recipientSnapshot: { recipient: 'Khách kiểm thử', phone: '+84900000000' },
        shippingRuleSnapshot: { source: 'INTEGRATION_TEST' },
        idempotencyKey: `${marker}-checkout-idem-same-owner`,
        requestHash: 'same-owner'.padEnd(64, 'a'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        items: {
          create: {
            itemType: 'STANDARD',
            productVariantId: variantId,
            skuSnapshot: variant.sku,
            nameSnapshot: variant.name,
            quantity: 1,
            unitPrice: '100000',
            lineTotal: '100000',
          },
        },
      },
    });
    checkoutIds.push(sameOwnerCheckout.id);
  });

  afterAll(async () => {
    await cleanup.inventoryReservationItem.deleteMany({
      where: { reservation: { checkoutSessionId: { in: checkoutIds } } },
    });
    await cleanup.inventoryReservation.deleteMany({
      where: { checkoutSessionId: { in: checkoutIds } },
    });
    await cleanup.checkoutSessionItem.deleteMany({
      where: { checkoutSessionId: { in: checkoutIds } },
    });
    await cleanup.checkoutSession.deleteMany({ where: { id: { in: checkoutIds } } });
    await cleanup.cart.deleteMany({ where: { id: { in: cartIds } } });
    if (balanceId) await cleanup.inventoryBalance.delete({ where: { id: balanceId } });
    if (variantId) await cleanup.productVariant.delete({ where: { id: variantId } });
    if (productId) await cleanup.product.delete({ where: { id: productId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  beforeEach(async () => {
    await cleanup.inventoryReservationItem.deleteMany({
      where: { reservation: { checkoutSessionId: { in: checkoutIds } } },
    });
    await cleanup.inventoryReservation.deleteMany({
      where: { checkoutSessionId: { in: checkoutIds } },
    });
    await cleanup.checkoutSession.updateMany({
      where: { id: { in: checkoutIds } },
      data: { status: 'QUOTED', confirmedAt: null, version: 0 },
    });
    await cleanup.inventoryBalance.update({
      where: { id: balanceId },
      data: { reserved: 0, version: 0 },
    });
    auditWrite.mockClear();
  });

  it('does not oversell when two checkouts compete for the final SKU', async () => {
    const attempts = await Promise.allSettled([
      service.confirm(
        `${marker}-checkout-0`,
        `${marker}-reservation-idem-0`,
        `${marker}-request-0`,
        { actorType: 'GUEST', cartId: cartIds[0] },
      ),
      service.confirm(
        `${marker}-checkout-1`,
        `${marker}-reservation-idem-1`,
        `${marker}-request-1`,
        { actorType: 'GUEST', cartId: cartIds[1] },
      ),
    ]);

    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.find(({ status }) => status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (!rejected || rejected.status !== 'rejected') {
      throw new Error('Expected exactly one checkout reservation conflict');
    }
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    await expect(cleanup.inventoryBalance.findUniqueOrThrow({ where: { id: balanceId } }))
      .resolves.toMatchObject({ onHand: 1, reserved: 1 });
    await expect(cleanup.inventoryReservation.count({
      where: { checkoutSessionId: { in: checkoutIds }, status: 'ACTIVE' },
    })).resolves.toBe(1);
  });

  it('replays the winning idempotency key without reserving stock twice', async () => {
    const created = await service.confirm(
      `${marker}-checkout-0`,
      `${marker}-replay-idem`,
      `${marker}-create-replay-request`,
      { actorType: 'GUEST', cartId: cartIds[0] },
    );
    const replay = await service.confirm(
      `${marker}-checkout-0`,
      `${marker}-replay-idem`,
      `${marker}-replay-request`,
      { actorType: 'GUEST', cartId: cartIds[0] },
    );

    expect(replay.id).toBe(created.id);
    await expect(cleanup.inventoryBalance.findUniqueOrThrow({ where: { id: balanceId } }))
      .resolves.toMatchObject({ onHand: 1, reserved: 1 });
  });

  it('rejects reusing an idempotency key for a different checkout payload', async () => {
    await service.confirm(
      `${marker}-checkout-0`,
      `${marker}-conflict-idem`,
      `${marker}-create-conflict-request`,
      { actorType: 'GUEST', cartId: cartIds[0] },
    );

    await expect(service.confirm(
      `${marker}-checkout-same-owner`,
      `${marker}-conflict-idem`,
      `${marker}-conflict-request`,
      { actorType: 'GUEST', cartId: cartIds[0] },
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not replay a reservation to another cart', async () => {
    await service.confirm(
      `${marker}-checkout-0`,
      `${marker}-ownership-idem`,
      `${marker}-ownership-create-request`,
      { actorType: 'GUEST', cartId: cartIds[0] },
    );

    await expect(service.confirm(
      `${marker}-checkout-0`,
      `${marker}-ownership-idem`,
      `${marker}-ownership-replay-request`,
      { actorType: 'GUEST', cartId: cartIds[1] },
    )).rejects.toBeInstanceOf(NotFoundException);
  });
});
