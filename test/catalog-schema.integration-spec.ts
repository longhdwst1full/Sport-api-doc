import { PrismaClient } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

describe('Catalog Wave 2 PostgreSQL invariants', () => {
  const prisma = new PrismaClient();
  const suffix = uuidv7();
  let productId: bigint;
  let otherProductId: bigint;
  let bundleVariantId: bigint;
  let componentVariantId: bigint;
  let otherVariantId: bigint;
  let bundleId: bigint;
  let actorId: bigint;
  let invalidCategoryId: bigint | undefined;
  const mediaAssetIds: bigint[] = [];

  beforeAll(async () => {
    const actor = await prisma.user.findFirstOrThrow({
      where: { normalizedEmail: 'bootstrap-admin@example.invalid' },
    });
    actorId = actor.id;
    const product = await prisma.product.create({
      data: {
          productNo: `P-${suffix.slice(-8)}`,
          name: 'Catalog integration product',
          slug: `catalog-${suffix}`,
          productType: 'BUNDLE',
          status: 'DRAFT',
          createdBy: actorId,
          updatedBy: actorId,
      },
    });
    productId = product.id;
    const otherProduct = await prisma.product.create({
      data: {
          productNo: `O-${suffix.slice(-8)}`,
          name: 'Other integration product',
          slug: `other-catalog-${suffix}`,
          status: 'DRAFT',
          createdBy: actorId,
          updatedBy: actorId,
      },
    });
    otherProductId = otherProduct.id;
    bundleVariantId = (await prisma.productVariant.create({
      data: { productId, sku: `BUNDLE-${suffix}`, name: 'Bundle SKU' },
    })).id;
    componentVariantId = (await prisma.productVariant.create({
      data: { productId, sku: `COMPONENT-${suffix}`, name: 'Component SKU' },
    })).id;
    otherVariantId = (await prisma.productVariant.create({
      data: { productId: otherProductId, sku: `OTHER-${suffix}`, name: 'Other SKU' },
    })).id;
    const bundle = await prisma.productBundle.create({
      data: { bundleVariantId, createdBy: actorId, updatedBy: actorId },
    });
    bundleId = bundle.id;
    for (const index of [0, 1]) {
      const asset = await prisma.mediaAsset.create({
        data: {
        provider: 'CLOUDINARY',
        providerAssetId: `integration-${suffix}-${index}`,
        publicId: `sport-sys/sport/integration-${suffix}-${index}`,
        secureUrl: `https://example.invalid/${index}.jpg`,
        },
      });
      mediaAssetIds.push(asset.id);
    }
  });

  afterAll(async () => {
    await prisma.productPrice.deleteMany({ where: { productVariantId: componentVariantId } });
    await prisma.productMedia.deleteMany({ where: { productId: { in: [productId, otherProductId] } } });
    await prisma.bundleItem.deleteMany({ where: { productBundleId: bundleId } });
    await prisma.productBundle.deleteMany({ where: { id: bundleId } });
    await prisma.productVariant.deleteMany({ where: { id: { in: [bundleVariantId, componentVariantId, otherVariantId] } } });
    await prisma.product.deleteMany({ where: { id: { in: [productId, otherProductId] } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaAssetIds } } });
    if (invalidCategoryId) await prisma.category.delete({ where: { id: invalidCategoryId } });
    await prisma.$disconnect();
  });

  it('rejects overlapping effective regular prices', async () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    await prisma.productPrice.create({
      data: {
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
        productId,
        mediaAssetId: mediaAssetIds[0],
        isPrimary: true,
      },
    });
    await expect(
      prisma.productMedia.create({
        data: {
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
          productBundleId: bundleId,
          componentVariantId: bundleVariantId,
          quantity: 1,
        },
      }),
    ).rejects.toThrow('nested bundles are not allowed');
  });

  it('rejects a category that points to itself', async () => {
    const category = await prisma.category.create({
      data: {
        code: `CAT-${suffix.slice(-8)}`,
        name: 'Invalid category',
        slug: `invalid-${suffix}`,
        path: 'PENDING',
      },
    });
    invalidCategoryId = category.id;
    await expect(
      prisma.category.update({
        where: { id: category.id },
        data: {
          parentId: category.id,
          path: category.id.toString(),
        },
      }),
    ).rejects.toThrow();
  });
});
