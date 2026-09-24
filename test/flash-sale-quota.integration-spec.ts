import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import { FlashSaleService } from '../src/modules/promotion/services/flash-sale.service';
import { SystemParameterService } from '../src/modules/system/parameters/system-parameter.service';

/**
 * Kiểm chứng quota flash sale trên PostgreSQL thật.
 *
 * Unit test chạy trên mock không chứng minh được hai thứ quan trọng nhất:
 * ràng buộc `sold + reserved <= quota` ở tầng database, và hành vi khi hai
 * request thật tranh nhau suất cuối cùng.
 */
describe('Flash sale quota trên PostgreSQL', () => {
  const cleanup = new PrismaClient();
  const marker = `flash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      return undefined;
    }),
    getOrThrow: jest.fn(),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const audit = { write: jest.fn().mockResolvedValue({ id: 'integration', createdAt: '' }) };
  // Dùng SystemParameterService THẬT, không mock: bài test này chạy trên PostgreSQL thật nên
  // tham số cũng phải đi đúng đường đọc của production (bảng `system_parameters`, thiếu bản ghi
  // thì rơi về mặc định trong catalog).
  const parameters = new SystemParameterService(prisma, audit as unknown as AuditWriter);
  const service = new FlashSaleService(prisma, audit as unknown as AuditWriter, parameters);

  const now = new Date();
  const CAMPAIGN_QUOTA = 3;
  const PER_CUSTOMER_LIMIT = 2;

  let branchId = 0n;
  let warehouseId = 0n;
  let productId = 0n;
  let comboVariantId = 0n;
  let componentVariantId = 0n;
  let campaignAId = 0n;
  let campaignBId = 0n;
  let comboItemId = 0n;
  let secondCampaignItemId = 0n;
  const cartIds: bigint[] = [];
  const checkoutIds: bigint[] = [];

  async function createCheckout(index: number): Promise<bigint> {
    const cart = await cleanup.cart.create({
      data: {
        anonymousTokenHash: `${marker}-cart-${index}`.padEnd(64, 'a').slice(0, 64),
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
        idempotencyKey: `${marker}-idem-${index}`,
        requestHash: `${index}`.padEnd(64, 'a'),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    checkoutIds.push(checkout.id);
    return checkout.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const branch = await cleanup.branch.create({
      data: {
        code: `${marker}-b`.toUpperCase().slice(0, 32),
        name: 'Flash quota branch',
        addressJson: { provinceCode: '79' },
      },
    });
    branchId = branch.id;
    const warehouse = await cleanup.warehouse.create({
      data: {
        branchId,
        code: `${marker}-w`.toUpperCase().slice(0, 32),
        name: 'Flash quota warehouse',
      },
    });
    warehouseId = warehouse.id;
    const product = await cleanup.product.create({
      data: {
        productNo: `${marker}-p`.toUpperCase().slice(0, 32),
        name: 'Flash quota product',
        slug: marker,
      },
    });
    productId = product.id;

    const combo = await cleanup.productVariant.create({
      data: { productId, sku: `${marker}-combo`.toUpperCase().slice(0, 64), name: 'Combo' },
    });
    comboVariantId = combo.id;
    const component = await cleanup.productVariant.create({
      data: { productId, sku: `${marker}-part`.toUpperCase().slice(0, 64), name: 'Linh kiện' },
    });
    componentVariantId = component.id;

    const window = { startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 3_600_000) };
    const campaignA = await cleanup.flashSaleCampaign.create({
      data: { code: `${marker}-A`.toUpperCase().slice(0, 32), name: 'A', status: 'ACTIVE', ...window },
    });
    campaignAId = campaignA.id;
    const campaignB = await cleanup.flashSaleCampaign.create({
      data: { code: `${marker}-B`.toUpperCase().slice(0, 32), name: 'B', status: 'ACTIVE', ...window },
    });
    campaignBId = campaignB.id;

    const comboItem = await cleanup.flashSaleItem.create({
      data: {
        campaignId: campaignAId,
        productVariantId: comboVariantId,
        salePrice: new Prisma.Decimal('100000.00'),
        quota: CAMPAIGN_QUOTA,
        perCustomerLimit: PER_CUSTOMER_LIMIT,
        status: 'ACTIVE',
      },
    });
    comboItemId = comboItem.id;

    // Cùng một biến thể nằm ở campaign thứ hai — tình huống sinh ra lỗi trừ quota hai lần.
    const secondItem = await cleanup.flashSaleItem.create({
      data: {
        campaignId: campaignBId,
        productVariantId: comboVariantId,
        salePrice: new Prisma.Decimal('90000.00'),
        quota: CAMPAIGN_QUOTA,
        status: 'ACTIVE',
      },
    });
    secondCampaignItemId = secondItem.id;

    for (let index = 0; index < 4; index += 1) await createCheckout(index);
  });

  afterAll(async () => {
    await cleanup.flashSaleQuotaReservation.deleteMany({
      where: { checkoutSessionId: { in: checkoutIds } },
    });
    await cleanup.checkoutSessionItem.deleteMany({ where: { checkoutSessionId: { in: checkoutIds } } });
    await cleanup.checkoutSession.deleteMany({ where: { id: { in: checkoutIds } } });
    await cleanup.cart.deleteMany({ where: { id: { in: cartIds } } });
    await cleanup.flashSaleItem.deleteMany({ where: { campaignId: { in: [campaignAId, campaignBId] } } });
    await cleanup.flashSaleCampaign.deleteMany({ where: { id: { in: [campaignAId, campaignBId] } } });
    await cleanup.productVariant.deleteMany({ where: { productId } });
    if (productId) await cleanup.product.delete({ where: { id: productId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  beforeEach(async () => {
    await cleanup.flashSaleQuotaReservation.deleteMany({
      where: { checkoutSessionId: { in: checkoutIds } },
    });
    await cleanup.flashSaleItem.updateMany({
      where: { id: { in: [comboItemId, secondCampaignItemId] } },
      data: { soldQuantity: 0, reservedQuantity: 0 },
    });
  });

  it('chỉ trừ quota của suất đã snapshot, không trừ campaign còn lại', async () => {
    await prisma.$transaction((transaction) =>
      service.reserveQuota(
        transaction,
        checkoutIds[0],
        `${marker}-customer-1`,
        [{ productVariantId: comboVariantId, quantity: 1, flashSaleItemId: comboItemId }],
        now,
      ),
    );

    const [claimed, untouched] = await Promise.all([
      cleanup.flashSaleItem.findUniqueOrThrow({ where: { id: comboItemId } }),
      cleanup.flashSaleItem.findUniqueOrThrow({ where: { id: secondCampaignItemId } }),
    ]);
    expect(claimed.reservedQuantity).toBe(1);
    expect(untouched.reservedQuantity).toBe(0);
  });

  it('hai request song song giành suất cuối: chỉ một thắng và quota không bị vượt', async () => {
    await cleanup.flashSaleItem.update({
      where: { id: comboItemId },
      data: { reservedQuantity: CAMPAIGN_QUOTA - 1 },
    });

    const attempt = (checkoutId: bigint, customer: string) =>
      prisma.$transaction((transaction) =>
        service.reserveQuota(
          transaction,
          checkoutId,
          customer,
          [{ productVariantId: comboVariantId, quantity: 1, flashSaleItemId: comboItemId }],
          now,
        ),
      );

    const results = await Promise.allSettled([
      attempt(checkoutIds[0], `${marker}-race-a`),
      attempt(checkoutIds[1], `${marker}-race-b`),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const item = await cleanup.flashSaleItem.findUniqueOrThrow({ where: { id: comboItemId } });
    // Ràng buộc database là lưới an toàn cuối cùng.
    expect(item.soldQuantity + item.reservedQuantity).toBeLessThanOrEqual(item.quota);
    expect(item.reservedQuantity).toBe(CAMPAIGN_QUOTA);
  });

  it('giới hạn mỗi khách cộng dồn qua nhiều checkout', async () => {
    const reserve = (checkoutId: bigint, quantity: number) =>
      prisma.$transaction((transaction) =>
        service.reserveQuota(
          transaction,
          checkoutId,
          `${marker}-same-customer`,
          [{ productVariantId: comboVariantId, quantity, flashSaleItemId: comboItemId }],
          now,
        ),
      );

    await reserve(checkoutIds[0], PER_CUSTOMER_LIMIT);
    // Lần đặt thứ hai của cùng khách phải bị chặn dù quota tổng vẫn còn.
    await expect(reserve(checkoutIds[1], 1)).rejects.toBeInstanceOf(ConflictException);

    const item = await cleanup.flashSaleItem.findUniqueOrThrow({ where: { id: comboItemId } });
    expect(item.reservedQuantity).toBe(PER_CUSTOMER_LIMIT);
  });

  it('dòng mua giá thường không giữ quota', async () => {
    const grants = await prisma.$transaction((transaction) =>
      service.reserveQuota(
        transaction,
        checkoutIds[2],
        `${marker}-regular`,
        [{ productVariantId: componentVariantId, quantity: 1, flashSaleItemId: null }],
        now,
      ),
    );

    expect(grants).toHaveLength(0);
    const item = await cleanup.flashSaleItem.findUniqueOrThrow({ where: { id: comboItemId } });
    expect(item.reservedQuantity).toBe(0);
  });

  it('commit rồi hủy trả suất về pool, tổng không vượt quota ở mọi bước', async () => {
    await prisma.$transaction((transaction) =>
      service.reserveQuota(
        transaction,
        checkoutIds[3],
        `${marker}-lifecycle`,
        [{ productVariantId: comboVariantId, quantity: 2, flashSaleItemId: comboItemId }],
        now,
      ),
    );
    await prisma.$transaction((transaction) => service.commitQuota(transaction, checkoutIds[3], now));

    const afterCommit = await cleanup.flashSaleItem.findUniqueOrThrow({ where: { id: comboItemId } });
    expect(afterCommit.soldQuantity).toBe(2);
    expect(afterCommit.reservedQuantity).toBe(0);

    await prisma.$transaction((transaction) =>
      service.revertCommittedQuota(transaction, checkoutIds[3], 'Khách hủy đơn', now),
    );

    const afterRevert = await cleanup.flashSaleItem.findUniqueOrThrow({ where: { id: comboItemId } });
    expect(afterRevert.soldQuantity).toBe(0);
    expect(afterRevert.reservedQuantity).toBe(0);
  });

  it('database chặn quota bị vượt kể cả khi service bị bỏ qua', async () => {
    await expect(
      cleanup.flashSaleItem.update({
        where: { id: comboItemId },
        data: { reservedQuantity: CAMPAIGN_QUOTA + 1 },
      }),
    ).rejects.toThrow();
  });
});
