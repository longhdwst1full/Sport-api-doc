import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

describe('Catalog Wave 2 PostgreSQL invariants', () => {
  const prisma = new PrismaClient();
  const productId = uuidv7();
  const otherProductId = uuidv7();
  const bundleVariantId = uuidv7();
  const componentVariantId = uuidv7();
  const otherVariantId = uuidv7();
  const bundleId = uuidv7();
  const mediaAssetIds = [uuidv7(), uuidv7()];
  const actorId = '00000000-0000-7000-8000-000000000010';

  beforeAll(async () => {
    await prisma.product.createMany({
      data: [
        {
          id: productId,
          productNo: `P-${productId.slice(-8)}`,
          name: 'Catalog integration product',
          slug: `catalog-${productId}`,
          productType: 'BUNDLE',
          status: 'DRAFT',
          createdBy: actorId,
          updatedBy: actorId,
        },
        {
          id: otherProductId,
          productNo: `P-${otherProductId.slice(-8)}`,
          name: 'Other integration product',
          slug: `catalog-${otherProductId}`,
          status: 'DRAFT',
          createdBy: actorId,
          updatedBy: actorId,
        },
      ],
    });
    await prisma.productVariant.createMany({
      data: [
        { id: bundleVariantId, productId, sku: `SKU-${bundleVariantId}`, name: 'Bundle SKU' },
        { id: componentVariantId, productId, sku: `SKU-${componentVariantId}`, name: 'Component SKU' },
        { id: otherVariantId, productId: otherProductId, sku: `SKU-${otherVariantId}`, name: 'Other SKU' },
      ],
    });
    await prisma.productBundle.create({
      data: {
        id: bundleId,
        bundleVariantId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await prisma.mediaAsset.createMany({
      data: mediaAssetIds.map((id, index) => ({
        id,
        provider: 'CLOUDINARY',
        providerAssetId: `integration-${id}`,
        publicId: `sport-sys/sport/integration-${id}`,
        secureUrl: `https://example.invalid/${index}.jpg`,
      })),
    });
  });

  afterAll(async () => {
    await prisma.productPrice.deleteMany({ where: { productVariantId: componentVariantId } });
    await prisma.productMedia.deleteMany({ where: { productId: { in: [productId, otherProductId] } } });
    await prisma.bundleItem.deleteMany({ where: { productBundleId: bundleId } });
    await prisma.productBundle.deleteMany({ where: { id: bundleId } });
    await prisma.productVariant.deleteMany({ where: { id: { in: [bundleVariantId, componentVariantId, otherVariantId] } } });
    await prisma.product.deleteMany({ where: { id: { in: [productId, otherProductId] } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaAssetIds } } });
    await prisma.$disconnect();
  });

  it('rejects overlapping effective regular prices', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    await prisma.productPrice.create({
      data: {
        id: uuidv7(),
        productVariantId: componentVariantId,
        amount: '100000.00',
        startsAt: start,
        endsAt: new Date('2026-12-31T00:00:00.000Z'),
        status: 'ACTIVE',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await expect(
      prisma.productPrice.create({
        data: {
          id: uuidv7(),
          productVariantId: componentVariantId,
          amount: '120000.00',
          startsAt: new Date('2026-06-01T00:00:00.000Z'),
          status: 'SCHEDULED',
          createdBy: actorId,
          updatedBy: actorId,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a zero regular price at the database boundary', async () => {
    await expect(
      prisma.productPrice.create({
        data: {
          id: uuidv7(),
          productVariantId: otherVariantId,
          amount: '0.00',
          startsAt: new Date('2026-01-01T00:00:00.000Z'),
          status: 'ACTIVE',
          createdBy: actorId,
          updatedBy: actorId,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an unknown product type at the database boundary', async () => {
    await expect(
      prisma.product.update({
        where: { id: otherProductId },
        data: { productType: 'MIXED' },
      }),
    ).rejects.toThrow();
  });

  it('allows only one active primary image at each product level', async () => {
    await prisma.productMedia.create({
      data: {
        id: uuidv7(),
        productId,
        mediaAssetId: mediaAssetIds[0],
        isPrimary: true,
      },
    });
    await expect(
      prisma.productMedia.create({
        data: {
          id: uuidv7(),
          productId,
          mediaAssetId: mediaAssetIds[1],
          isPrimary: true,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects media linked to a variant from another product', async () => {
    await expect(
      prisma.productMedia.create({
        data: {
          id: uuidv7(),
          productId,
          variantId: otherVariantId,
          mediaAssetId: mediaAssetIds[1],
        },
      }),
    ).rejects.toThrow('media variant must belong to product');
  });

  it('rejects a bundle variant used as a nested component', async () => {
    await expect(
      prisma.bundleItem.create({
        data: {
          id: uuidv7(),
          productBundleId: bundleId,
          componentVariantId: bundleVariantId,
          quantity: 1,
        },
      }),
    ).rejects.toThrow('nested bundles are not allowed');
  });

  it('rejects a category that points to itself', async () => {
    const categoryId = uuidv7();
    await expect(
      prisma.category.create({
        data: {
          id: categoryId,
          parentId: categoryId,
          code: `CAT-${categoryId.slice(-8)}`,
          name: 'Invalid category',
          slug: `invalid-${categoryId}`,
          path: categoryId,
        },
      }),
    ).rejects.toThrow();
  });
});
