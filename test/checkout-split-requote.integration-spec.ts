import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import type { AuthPrincipal } from '../src/modules/auth/auth.types';
import { CartService } from '../src/modules/cart/cart.service';
import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { InventoryReservationService } from '../src/modules/checkout/inventory-reservation.service';
import { ScopeType } from '../src/modules/iam/iam.types';
import { FlashSaleService } from '../src/modules/promotion/services/flash-sale.service';
import { ShippingQuoteService } from '../src/modules/shipping/shipping-quote.service';

/**
 * Chốt phí cho checkout tách kho phải đọc lại tồn của TOÀN BỘ giỏ trên PostgreSQL thật, không chỉ
 * phần `stockShortages` ghi lúc báo giá: dòng vốn đủ có thể đã bị đơn khác giữ trong lúc chờ chuyển kho.
 */
describe('Checkout split-stock manual quote re-checks the whole cart', () => {
  const cleanup = new PrismaClient();
  const marker = `split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const audit = { write: jest.fn().mockResolvedValue({ id: 'integration', createdAt: new Date().toISOString() }) } as unknown as AuditWriter;
  const service = new CheckoutService(
    prisma,
    {} as CartService,
    {} as ShippingQuoteService,
    config,
    audit,
    {} as FlashSaleService,
    // buildPhysicalDemand không chạm DB; phụ thuộc còn lại không dùng trong updateManualShipping.
    new InventoryReservationService(prisma, config, audit, {} as FlashSaleService),
  );
  const principal: AuthPrincipal = {
    userId: '1', sessionId: 'integration', displayName: 'Integration', permissionVersion: '1',
    permissions: [], scopes: [{ type: ScopeType.GLOBAL }], mustChangePassword: false,
  } as AuthPrincipal;

  let branchId = 0n;
  let warehouseId = 0n;
  let productId = 0n;
  let cartId = 0n;
  let checkoutId = 0n;
  const variantIds: bigint[] = [];
  const balanceIds: bigint[] = [];
  const token = `${marker}-checkout`;

  beforeAll(async () => {
    await prisma.$connect();
    branchId = (await cleanup.branch.create({
      data: { code: marker.toUpperCase().slice(0, 32), name: 'Split re-quote branch', addressJson: { provinceCode: '79' } },
    })).id;
    warehouseId = (await cleanup.warehouse.create({
      data: { branchId, code: `${marker}-wh`.toUpperCase().slice(0, 32), name: 'Split re-quote warehouse' },
    })).id;
    productId = (await cleanup.product.create({
      data: { productNo: `${marker}-p`.toUpperCase().slice(0, 32), name: 'Split re-quote product', slug: marker },
    })).id;
    const variants = [];
    for (const suffix of ['transferred', 'held']) {
      const variant = await cleanup.productVariant.create({
        data: { productId, sku: `${marker}-${suffix}`.toUpperCase().slice(0, 64), name: suffix },
      });
      variants.push(variant);
      variantIds.push(variant.id);
    }
    // `transferred`: phần thiếu lúc báo giá, nay đã chuyển đủ 3. `held`: lúc báo giá đủ 2, nay đơn khác giữ 1.
    balanceIds.push((await cleanup.inventoryBalance.create({
      data: { warehouseId, productVariantId: variantIds[0], onHand: 3, reserved: 0 },
    })).id);
    balanceIds.push((await cleanup.inventoryBalance.create({
      data: { warehouseId, productVariantId: variantIds[1], onHand: 2, reserved: 1 },
    })).id);

    cartId = (await cleanup.cart.create({
      data: { anonymousTokenHash: marker.padEnd(64, 'a').slice(0, 64), branchId, expiresAt: new Date(Date.now() + 3_600_000) },
    })).id;
    checkoutId = (await cleanup.checkoutSession.create({
      data: {
        checkoutToken: token,
        cartId,
        branchId,
        warehouseId,
        status: 'AWAITING_SHIPPING_CONSULTATION',
        paymentMethod: 'COD',
        shippingMethod: 'MANUAL_EXTERNAL',
        currencyCode: 'VND',
        itemSubtotal: '500000',
        shippingTotal: '0',
        grandTotal: '500000',
        etaMinDays: 0,
        etaMaxDays: 0,
        recipientSnapshot: { recipient: 'Khách kiểm thử', phone: '+84900000000' },
        shippingRuleSnapshot: {
          consultationReason: 'STOCK_SPLIT_ACROSS_BRANCHES',
          stockShortages: [{ productVariantId: String(variantIds[0]), sku: variants[0].sku, name: 'transferred', requested: 3, availableAtBranch: 1 }],
        },
        idempotencyKey: `${marker}-idem`,
        requestHash: '0'.padEnd(64, 'a'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        items: {
          create: variants.map((variant, index) => ({
            itemType: 'STANDARD',
            productVariantId: variant.id,
            skuSnapshot: variant.sku,
            nameSnapshot: variant.name,
            quantity: index === 0 ? 3 : 2,
            unitPrice: '100000',
            lineTotal: index === 0 ? '300000' : '200000',
          })),
        },
      },
    })).id;
  });

  afterAll(async () => {
    if (checkoutId) {
      await cleanup.checkoutSessionItem.deleteMany({ where: { checkoutSessionId: checkoutId } });
      await cleanup.checkoutSession.delete({ where: { id: checkoutId } });
    }
    if (cartId) await cleanup.cart.delete({ where: { id: cartId } });
    await cleanup.inventoryBalance.deleteMany({ where: { id: { in: balanceIds } } });
    await cleanup.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    if (productId) await cleanup.product.delete({ where: { id: productId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  const manualQuote = { shippingFee: '30000', etaMinDays: 1, etaMaxDays: 2, agreementNote: 'Gọi khách chốt phí', expectedVersion: 0 };

  it('rejects when a line that was covered at quote time is now held by another order', async () => {
    await expect(service.updateManualShipping(token, manualQuote, principal, `${marker}-r1`)).rejects.toMatchObject({
      response: { code: 'CHECKOUT_STOCK_NOT_TRANSFERRED' },
    });
    const unchanged = await cleanup.checkoutSession.findUniqueOrThrow({ where: { id: checkoutId } });
    expect(unchanged.status).toBe('AWAITING_SHIPPING_CONSULTATION');
    expect(Number(unchanged.version)).toBe(0);
  });

  it('quotes once every line is covered at the branch warehouse', async () => {
    await cleanup.inventoryBalance.update({ where: { id: balanceIds[1] }, data: { reserved: 0 } });

    await expect(service.updateManualShipping(token, manualQuote, principal, `${marker}-r2`)).resolves.toMatchObject({ status: 'QUOTED' });
    const quoted = await cleanup.checkoutSession.findUniqueOrThrow({ where: { id: checkoutId } });
    expect(quoted.status).toBe('QUOTED');
    expect(quoted.shippingTotal.toFixed(2)).toBe('30000.00');
  });
});
