import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import { ReservationExpiryService } from '../src/modules/checkout/reservation-expiry.service';

describe('Reservation expiry worker concurrency', () => {
  const cleanup = new PrismaClient();
  const marker = `expiry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestIds = [`${marker}-worker-1`, `${marker}-worker-2`, `${marker}-worker-empty`];
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      if (key === 'app.jobs.reservationExpiry.enabled') return true;
      return undefined;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'app.jobs.reservationExpiry.batchSize') return 1;
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const auditWrite = jest.fn().mockResolvedValue({ id: 'integration', createdAt: new Date().toISOString() });
  const service = new ReservationExpiryService(
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
  const reservationIds: bigint[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const branch = await cleanup.branch.create({
      data: {
        code: marker.toUpperCase().slice(0, 32),
        name: 'Expiry worker integration branch',
        addressJson: { provinceCode: '79' },
      },
    });
    branchId = branch.id;
    const warehouse = await cleanup.warehouse.create({
      data: {
        branchId,
        code: `${marker}-wh`.toUpperCase().slice(0, 32),
        name: 'Expiry worker integration warehouse',
      },
    });
    warehouseId = warehouse.id;
    const product = await cleanup.product.create({
      data: {
        productNo: `${marker}-p`.toUpperCase().slice(0, 32),
        name: 'Expiry worker integration product',
        slug: marker,
      },
    });
    productId = product.id;
    const variant = await cleanup.productVariant.create({
      data: {
        productId,
        sku: `${marker}-sku`.toUpperCase().slice(0, 64),
        name: 'Expiry worker integration SKU',
      },
    });
    variantId = variant.id;
    const balance = await cleanup.inventoryBalance.create({
      data: { warehouseId, productVariantId: variantId, onHand: 10, reserved: 2 },
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
          status: 'CONFIRMED',
          paymentMethod: 'COD',
          shippingMethod: 'STANDARD_DELIVERY',
          currencyCode: 'VND',
          itemSubtotal: '100000',
          shippingTotal: '50000',
          grandTotal: '150000',
          etaMinDays: 1,
          etaMaxDays: 3,
          recipientSnapshot: { recipient: 'Integration customer', phone: '+84900000000' },
          shippingRuleSnapshot: { source: 'INTEGRATION_TEST' },
          idempotencyKey: `${marker}-checkout-idem-${index}`,
          requestHash: `${index}`.padEnd(64, 'a'),
          expiresAt: new Date(Date.now() - 60_000),
          confirmedAt: new Date(Date.now() - 120_000),
          items: {
            create: {
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
      const reservation = await cleanup.inventoryReservation.create({
        data: {
          checkoutSessionId: checkout.id,
          warehouseId,
          reservationToken: `${marker}-reservation-${index}`,
          idempotencyKey: `${marker}-reservation-idem-${index}`,
          requestHash: `${index}`.padEnd(64, 'b'),
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() - 60_000),
          items: { create: { productVariantId: variantId, quantity: 1 } },
        },
      });
      reservationIds.push(reservation.id);
    }
  });

  afterAll(async () => {
    await cleanup.inventoryReservationItem.deleteMany({ where: { reservationId: { in: reservationIds } } });
    await cleanup.inventoryReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await cleanup.checkoutSessionItem.deleteMany({ where: { checkoutSessionId: { in: checkoutIds } } });
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

  it('lets concurrent workers claim each expired reservation exactly once', async () => {
    const results = await Promise.all([
      service.run(requestIds[0]),
      service.run(requestIds[1]),
    ]);
    const emptyRun = await service.run(requestIds[2]);

    expect(results.reduce((sum, result) => sum + result.expired, 0)).toBe(2);
    expect(emptyRun.expired).toBe(0);
    await expect(cleanup.inventoryBalance.findUniqueOrThrow({ where: { id: balanceId } }))
      .resolves.toMatchObject({ reserved: 0 });
    const reservations = await cleanup.inventoryReservation.findMany({
      where: { id: { in: reservationIds } },
    });
    expect(reservations).toHaveLength(2);
    expect(reservations.every(({ status }) => status === 'EXPIRED')).toBe(true);
    const checkouts = await cleanup.checkoutSession.findMany({ where: { id: { in: checkoutIds } } });
    expect(checkouts.every(({ status }) => status === 'EXPIRED')).toBe(true);
    expect(auditWrite).toHaveBeenCalledTimes(2);
  });
});
