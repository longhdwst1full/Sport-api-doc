import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const bootstrapUserId = '00000000-0000-7000-8000-000000000010';

const branches = [
  {
    id: '10000000-0000-7000-8000-000000000001',
    code: 'CN-HCM-01',
    name: 'Chi nhánh Hồ Chí Minh',
    warehouseId: '10000000-0000-7000-8000-000000000011',
    warehouseCode: 'KHO-HCM-01',
    warehouseName: 'Kho bán hàng Hồ Chí Minh',
    address: { addressLine: '123 Nguyễn Văn Linh', district: 'Quận 7', province: 'TP. Hồ Chí Minh' },
  },
  {
    id: '10000000-0000-7000-8000-000000000002',
    code: 'CN-HN-01',
    name: 'Chi nhánh Hà Nội',
    warehouseId: '10000000-0000-7000-8000-000000000012',
    warehouseCode: 'KHO-HN-01',
    warehouseName: 'Kho bán hàng Hà Nội',
    address: { addressLine: '88 Duy Tân', district: 'Cầu Giấy', province: 'Hà Nội' },
  },
  {
    id: '10000000-0000-7000-8000-000000000003',
    code: 'CN-DN-01',
    name: 'Chi nhánh Đà Nẵng',
    warehouseId: '10000000-0000-7000-8000-000000000013',
    warehouseCode: 'KHO-DN-01',
    warehouseName: 'Kho bán hàng Đà Nẵng',
    address: { addressLine: '12 Bạch Đằng', district: 'Hải Châu', province: 'Đà Nẵng' },
  },
] as const;

const brands = [
  { id: '20000000-0000-7000-8000-000000000001', code: 'FITGEAR', name: 'FitGear', slug: 'fitgear' },
  { id: '20000000-0000-7000-8000-000000000002', code: 'NIKE', name: 'Nike', slug: 'nike' },
  { id: '20000000-0000-7000-8000-000000000003', code: 'ADIDAS', name: 'Adidas', slug: 'adidas' },
] as const;

const categories = [
  { id: '30000000-0000-7000-8000-000000000001', code: 'GYM', name: 'Tập gym', slug: 'tap-gym', sortOrder: 10 },
  { id: '30000000-0000-7000-8000-000000000002', code: 'RUNNING', name: 'Chạy bộ', slug: 'chay-bo', sortOrder: 20 },
  { id: '30000000-0000-7000-8000-000000000003', code: 'ACCESSORY', name: 'Phụ kiện thể thao', slug: 'phu-kien-the-thao', sortOrder: 30 },
] as const;

const products = [
  {
    id: '40000000-0000-7000-8000-000000000001',
    productNo: 'SP-TA-TAY-01',
    name: 'Tạ tay cao su 5 kg',
    slug: 'ta-tay-cao-su-5kg',
    brandCode: 'FITGEAR',
    categoryCode: 'GYM',
    variantId: '41000000-0000-7000-8000-000000000001',
    sku: 'TA-CAO-SU-5KG',
    amount: '450000.00',
    productType: 'STANDARD',
    components: [],
  },
  {
    id: '40000000-0000-7000-8000-000000000002',
    productNo: 'SP-GIAY-CHAY-01',
    name: 'Giày chạy bộ Air Zoom',
    slug: 'giay-chay-bo-air-zoom',
    brandCode: 'NIKE',
    categoryCode: 'RUNNING',
    variantId: '41000000-0000-7000-8000-000000000002',
    sku: 'AIR-ZOOM-42',
    amount: '2890000.00',
    productType: 'STANDARD',
    components: [],
  },
  {
    id: '40000000-0000-7000-8000-000000000003',
    productNo: 'SP-THAM-YOGA-01',
    name: 'Thảm tập yoga chống trượt',
    slug: 'tham-tap-yoga-chong-truot',
    brandCode: 'ADIDAS',
    categoryCode: 'ACCESSORY',
    variantId: '41000000-0000-7000-8000-000000000003',
    sku: 'THAM-YOGA-BLUE',
    amount: '690000.00',
    productType: 'STANDARD',
    components: [],
  },
  {
    id: '40000000-0000-7000-8000-000000000004',
    productNo: 'SP-COMBO-GYM-01',
    name: 'Combo tập gym tại nhà 5 kg',
    slug: 'combo-tap-gym-tai-nha-5kg',
    brandCode: 'FITGEAR',
    categoryCode: 'GYM',
    variantId: '41000000-0000-7000-8000-000000000004',
    sku: 'COMBO-GYM-5KG',
    amount: '1490000.00',
    productType: 'BUNDLE',
    components: [
      { sku: 'TA-CAO-SU-5KG', quantity: 2 },
      { sku: 'THAM-YOGA-BLUE', quantity: 1 },
    ],
  },
] as const;

async function importDemoData(transaction: Prisma.TransactionClient): Promise<void> {
  const bootstrapUser = await transaction.user.findUnique({ where: { id: bootstrapUserId } });
  if (!bootstrapUser) {
    throw new Error('Foundation seed is required. Run prisma:seed before prisma:seed:demo.');
  }

  for (const item of branches) {
    const branch = await transaction.branch.upsert({
      where: { code: item.code },
      update: { name: item.name, addressJson: item.address, status: 'ACTIVE' },
      create: {
        id: item.id,
        code: item.code,
        name: item.name,
        status: 'ACTIVE',
        addressJson: item.address,
        createdBy: bootstrapUserId,
        updatedBy: bootstrapUserId,
      },
    });
    await transaction.warehouse.upsert({
      where: { code: item.warehouseCode },
      update: { branchId: branch.id, name: item.warehouseName, status: 'ACTIVE', isPrimary: true },
      create: {
        id: item.warehouseId,
        branchId: branch.id,
        code: item.warehouseCode,
        name: item.warehouseName,
        status: 'ACTIVE',
        isPrimary: true,
        createdBy: bootstrapUserId,
        updatedBy: bootstrapUserId,
      },
    });
  }

  for (const item of brands) {
    await transaction.brand.upsert({
      where: { code: item.code },
      update: { name: item.name, slug: item.slug, status: 'ACTIVE' },
      create: { ...item, status: 'ACTIVE', description: `Dữ liệu demo cho ${item.name}` },
    });
  }

  for (const item of categories) {
    await transaction.category.upsert({
      where: { code: item.code },
      update: { name: item.name, slug: item.slug, sortOrder: item.sortOrder, status: 'ACTIVE' },
      create: {
        ...item,
        path: item.id,
        depth: 0,
        status: 'ACTIVE',
        description: `Danh mục demo ${item.name}`,
      },
    });
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
        updatedBy: bootstrapUserId,
      },
      create: {
        id: item.id,
        brandId: brand.id,
        productType: item.productType,
        productNo: item.productNo,
        name: item.name,
        slug: item.slug,
        shortDescription: 'Sản phẩm demo phục vụ kiểm thử giao diện V1.',
        status: 'PUBLISHED',
        publishedAt,
        createdBy: bootstrapUserId,
        updatedBy: bootstrapUserId,
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
        id: item.variantId,
        productId: product.id,
        sku: item.sku,
        name: item.name,
        status: 'ACTIVE',
      },
    });
    await transaction.productPrice.upsert({
      where: { id: item.variantId },
      update: {
        productVariantId: variant.id,
        amount: item.amount,
        startsAt: publishedAt,
        status: 'ACTIVE',
        updatedBy: bootstrapUserId,
      },
      create: {
        id: item.variantId,
        productVariantId: variant.id,
        amount: item.amount,
        startsAt: publishedAt,
        status: 'ACTIVE',
        createdBy: bootstrapUserId,
        updatedBy: bootstrapUserId,
      },
    });
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
        update: { status: 'ACTIVE', updatedBy: bootstrapUserId },
        create: {
          id: item.variantId,
          bundleVariantId: variant.id,
          status: 'ACTIVE',
          createdBy: bootstrapUserId,
          updatedBy: bootstrapUserId,
        },
      });
      await transaction.bundleItem.deleteMany({ where: { productBundleId: bundle.id } });
      await transaction.bundleItem.createMany({
        data: item.components.map((component, sortOrder) => ({
          id: `${sortOrder + 1}1000000-0000-7000-8000-000000000004`,
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
