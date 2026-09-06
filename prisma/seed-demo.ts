import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const bootstrapAdminEmail = 'bootstrap-admin@example.invalid';

const branches = [
  {
    code: 'CN-HCM-01',
    name: 'Chi nhánh Hồ Chí Minh',
    warehouseCode: 'KHO-HCM-01',
    warehouseName: 'Kho bán hàng Hồ Chí Minh',
    address: { addressLine: '123 Nguyễn Văn Linh', district: 'Quận 7', province: 'TP. Hồ Chí Minh' },
  },
  {
    code: 'CN-HN-01',
    name: 'Chi nhánh Hà Nội',
    warehouseCode: 'KHO-HN-01',
    warehouseName: 'Kho bán hàng Hà Nội',
    address: { addressLine: '88 Duy Tân', district: 'Cầu Giấy', province: 'Hà Nội' },
  },
  {
    code: 'CN-DN-01',
    name: 'Chi nhánh Đà Nẵng',
    warehouseCode: 'KHO-DN-01',
    warehouseName: 'Kho bán hàng Đà Nẵng',
    address: { addressLine: '12 Bạch Đằng', district: 'Hải Châu', province: 'Đà Nẵng' },
  },
] as const;

const brands = [
  { code: 'FITGEAR', name: 'FitGear', slug: 'fitgear' },
  { code: 'NIKE', name: 'Nike', slug: 'nike' },
  { code: 'ADIDAS', name: 'Adidas', slug: 'adidas' },
] as const;

const categories = [
  { code: 'GYM', name: 'Tập gym', slug: 'tap-gym', sortOrder: 10 },
  { code: 'RUNNING', name: 'Chạy bộ', slug: 'chay-bo', sortOrder: 20 },
  { code: 'ACCESSORY', name: 'Phụ kiện thể thao', slug: 'phu-kien-the-thao', sortOrder: 30 },
] as const;

const products = [
  {
    productNo: 'SP-TA-TAY-01',
    name: 'Tạ tay cao su 5 kg',
    slug: 'ta-tay-cao-su-5kg',
    brandCode: 'FITGEAR',
    categoryCode: 'GYM',
    sku: 'TA-CAO-SU-5KG',
    amount: '450000.00',
    initialOnHand: 24,
    reorderPoint: 5,
    productType: 'STANDARD',
    components: [],
  },
  {
    productNo: 'SP-GIAY-CHAY-01',
    name: 'Giày chạy bộ Air Zoom',
    slug: 'giay-chay-bo-air-zoom',
    brandCode: 'NIKE',
    categoryCode: 'RUNNING',
    sku: 'AIR-ZOOM-42',
    amount: '2890000.00',
    initialOnHand: 12,
    reorderPoint: 3,
    productType: 'STANDARD',
    components: [],
  },
  {
    productNo: 'SP-THAM-YOGA-01',
    name: 'Thảm tập yoga chống trượt',
    slug: 'tham-tap-yoga-chong-truot',
    brandCode: 'ADIDAS',
    categoryCode: 'ACCESSORY',
    sku: 'THAM-YOGA-BLUE',
    amount: '690000.00',
    initialOnHand: 18,
    reorderPoint: 4,
    productType: 'STANDARD',
    components: [],
  },
  {
    productNo: 'SP-COMBO-GYM-01',
    name: 'Combo tập gym tại nhà 5 kg',
    slug: 'combo-tap-gym-tai-nha-5kg',
    brandCode: 'FITGEAR',
    categoryCode: 'GYM',
    sku: 'COMBO-GYM-5KG',
    amount: '1490000.00',
    initialOnHand: 0,
    reorderPoint: 0,
    productType: 'BUNDLE',
    components: [
      { sku: 'TA-CAO-SU-5KG', quantity: 2 },
      { sku: 'THAM-YOGA-BLUE', quantity: 1 },
    ],
  },
] as const;

async function importDemoData(transaction: Prisma.TransactionClient): Promise<void> {
  const bootstrapUser = await transaction.user.findFirst({
    where: { normalizedEmail: bootstrapAdminEmail },
  });
  if (!bootstrapUser) {
    throw new Error('Foundation seed is required. Run prisma:seed before prisma:seed:demo.');
  }

  const warehouseIdsByCode = new Map<string, bigint>();
  for (const item of branches) {
    const branch = await transaction.branch.upsert({
      where: { code: item.code },
      update: { name: item.name, addressJson: item.address, status: 'ACTIVE' },
      create: {
        code: item.code,
        name: item.name,
        status: 'ACTIVE',
        addressJson: item.address,
        createdBy: bootstrapUser.id,
        updatedBy: bootstrapUser.id,
      },
    });
    const warehouse = await transaction.warehouse.upsert({
      where: { code: item.warehouseCode },
      update: { branchId: branch.id, name: item.warehouseName, status: 'ACTIVE', isPrimary: true },
      create: {
        branchId: branch.id,
        code: item.warehouseCode,
        name: item.warehouseName,
        status: 'ACTIVE',
        isPrimary: true,
        createdBy: bootstrapUser.id,
        updatedBy: bootstrapUser.id,
      },
    });
    warehouseIdsByCode.set(item.warehouseCode, warehouse.id);
  }

  for (const item of brands) {
    await transaction.brand.upsert({
      where: { code: item.code },
      update: { name: item.name, slug: item.slug, status: 'ACTIVE' },
      create: {
        code: item.code,
        name: item.name,
        slug: item.slug,
        status: 'ACTIVE',
        description: `Dữ liệu demo cho ${item.name}`,
      },
    });
  }

  for (const item of categories) {
    const category = await transaction.category.upsert({
      where: { code: item.code },
      update: { name: item.name, slug: item.slug, sortOrder: item.sortOrder, status: 'ACTIVE' },
      create: {
        code: item.code,
        name: item.name,
        slug: item.slug,
        sortOrder: item.sortOrder,
        path: 'PENDING',
        depth: 0,
        status: 'ACTIVE',
        description: `Danh mục demo ${item.name}`,
      },
    });
    if (category.path !== category.id.toString()) {
      await transaction.category.update({
        where: { id: category.id },
        data: { path: category.id.toString() },
      });
    }
  }

  const publishedAt = new Date('2026-01-01T00:00:00.000Z');
  for (const item of products) {
    const [brand, category] = await Promise.all([
      transaction.brand.findUniqueOrThrow({ where: { code: item.brandCode } }),
      transaction.category.findUniqueOrThrow({ where: { code: item.categoryCode } }),
    ]);
    const product = await transaction.product.upsert({
      where: { productNo: item.productNo },
      update: {
        brandId: brand.id,
        productType: item.productType,
        name: item.name,
        slug: item.slug,
        status: 'PUBLISHED',
        publishedAt,
        updatedBy: bootstrapUser.id,
      },
      create: {
        brandId: brand.id,
        productType: item.productType,
        productNo: item.productNo,
        name: item.name,
        slug: item.slug,
        shortDescription: 'Sản phẩm demo phục vụ kiểm thử giao diện V1.',
        status: 'PUBLISHED',
        publishedAt,
        createdBy: bootstrapUser.id,
        updatedBy: bootstrapUser.id,
      },
    });
    await transaction.productCategory.upsert({
      where: { productId_categoryId: { productId: product.id, categoryId: category.id } },
      update: { isPrimary: true, sortOrder: 0 },
      create: { productId: product.id, categoryId: category.id, isPrimary: true, sortOrder: 0 },
    });
    const variant = await transaction.productVariant.upsert({
      where: { sku: item.sku },
      update: { productId: product.id, name: item.name, status: 'ACTIVE' },
      create: {
        productId: product.id,
        sku: item.sku,
        name: item.name,
        status: 'ACTIVE',
      },
    });
    if (item.productType === 'STANDARD') {
      const warehouseId = warehouseIdsByCode.get('KHO-HCM-01')!;
      const existingBalance = await transaction.inventoryBalance.findUnique({
        where: { warehouseId_productVariantId: { warehouseId, productVariantId: variant.id } },
      });
      if (existingBalance) {
        await transaction.inventoryBalance.update({
          where: { id: existingBalance.id },
          data: { reorderPoint: item.reorderPoint },
        });
      } else {
        const balance = await transaction.inventoryBalance.create({
          data: {
            warehouseId,
            productVariantId: variant.id,
            onHand: item.initialOnHand,
            reorderPoint: item.reorderPoint,
          },
        });
        if (item.initialOnHand > 0) {
          await transaction.inventoryMovement.create({
            data: {
              warehouseId,
              productVariantId: variant.id,
              movementType: 'RECEIVE',
              quantityDelta: item.initialOnHand,
              balanceAfter: item.initialOnHand,
              referenceType: 'DEMO_SEED_OPENING',
              referenceId: balance.id.toString(),
              idempotencyKey: `demo-seed-opening:${warehouseId}:${variant.id}`,
              reason: 'Tồn đầu kỳ từ dữ liệu demo',
              occurredAt: new Date(),
              createdBy: bootstrapUser.id,
            },
          });
        }
      }
    }
    const currentPrice = await transaction.productPrice.findFirst({
      where: { productVariantId: variant.id, endsAt: null },
      orderBy: { startsAt: 'desc' },
    });
    if (currentPrice) {
      await transaction.productPrice.update({
        where: { id: currentPrice.id },
        data: {
        productVariantId: variant.id,
        amount: item.amount,
        startsAt: publishedAt,
        status: 'ACTIVE',
        updatedBy: bootstrapUser.id,
        },
      });
    } else {
      await transaction.productPrice.create({
        data: {
          productVariantId: variant.id,
          amount: item.amount,
          startsAt: publishedAt,
          status: 'ACTIVE',
          createdBy: bootstrapUser.id,
          updatedBy: bootstrapUser.id,
        },
      });
    }
    if (item.productType === 'BUNDLE') {
      const componentVariants = await transaction.productVariant.findMany({
        where: { sku: { in: item.components.map(({ sku }) => sku) } },
        select: { id: true, sku: true },
      });
      if (componentVariants.length !== item.components.length) {
        throw new Error(`Missing demo component for ${item.sku}`);
      }
      const bundle = await transaction.productBundle.upsert({
        where: { bundleVariantId: variant.id },
        update: { status: 'ACTIVE', updatedBy: bootstrapUser.id },
        create: {
          bundleVariantId: variant.id,
          status: 'ACTIVE',
          createdBy: bootstrapUser.id,
          updatedBy: bootstrapUser.id,
        },
      });
      await transaction.bundleItem.deleteMany({ where: { productBundleId: bundle.id } });
      await transaction.bundleItem.createMany({
        data: item.components.map((component, sortOrder) => ({
          productBundleId: bundle.id,
          componentVariantId: componentVariants.find(({ sku }) => sku === component.sku)!.id,
          quantity: component.quantity,
          sortOrder,
        })),
      });
    }
  }
}

async function main(): Promise<void> {
  await prisma.$transaction(importDemoData, { maxWait: 10_000, timeout: 120_000 });
  console.log('Demo data imported: 3 branches/warehouses, 3 brands, 3 categories, 4 products (including 1 combo).');
}

void main().finally(async () => prisma.$disconnect());
