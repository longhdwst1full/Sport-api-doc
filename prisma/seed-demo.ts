import { Prisma, PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import {
  BAO_AN_BRANDS,
  BAO_AN_CATEGORIES,
  BAO_AN_PRODUCTS,
} from './demo-data/bao-an-sport';
import {
  assertUniqueValues,
  existingRecordUpdate,
  parseDemoSeedOptions,
  type DemoSeedOptions,
} from './demo-data/seed-policy';

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
  ...BAO_AN_BRANDS,
] as const;

const categories = [
  { code: 'GYM', name: 'Tập gym', slug: 'tap-gym', sortOrder: 10 },
  { code: 'RUNNING', name: 'Chạy bộ', slug: 'chay-bo', sortOrder: 20 },
  { code: 'ACCESSORY', name: 'Phụ kiện thể thao', slug: 'phu-kien-the-thao', sortOrder: 30 },
  ...BAO_AN_CATEGORIES,
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
    shortDescription: 'Tạ tay bọc cao su phù hợp tập sức mạnh tại nhà.',
    sourceUrl: null,
    imageUrl: null,
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
    shortDescription: 'Giày chạy bộ demo phục vụ kiểm thử catalog V1.',
    sourceUrl: null,
    imageUrl: null,
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
    shortDescription: 'Thảm tập chống trượt cho yoga và các bài tập trên sàn.',
    sourceUrl: null,
    imageUrl: null,
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
    shortDescription: 'Combo ảo gồm tạ tay và thảm yoga cho nhu cầu tập luyện tại nhà.',
    sourceUrl: null,
    imageUrl: null,
  },
  ...BAO_AN_PRODUCTS.map((item) => ({
    ...item,
    productType: 'STANDARD' as const,
    components: [] as const,
  })),
] as const;

interface PreparedMedia {
  providerAssetId: string;
  publicId: string;
  secureUrl: string;
  thumbnailUrl: string;
  format: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: bigint;
}

interface CloudinaryImageResource {
  asset_id?: string;
  public_id: string;
  secure_url: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

function isCloudinaryNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'http_code' in error
    && error.http_code === 404;
}

async function getOrUploadBaoAnImage(
  publicId: string,
  imageUrl: string,
  sourceUrl: string,
  refreshMedia: boolean,
): Promise<CloudinaryImageResource> {
  if (!refreshMedia) {
    try {
      return await cloudinary.api.resource(publicId, { resource_type: 'image', type: 'upload' }) as CloudinaryImageResource;
    } catch (error) {
      if (!isCloudinaryNotFound(error)) throw error;
    }
  }
  return await cloudinary.uploader.upload(imageUrl, {
    public_id: publicId,
    overwrite: refreshMedia,
    unique_filename: false,
    resource_type: 'image',
    tags: ['dctd-demo', 'bao-an-sport'],
    context: `source=${encodeURIComponent(sourceUrl)}`,
  });
}

function validateDemoManifest(): void {
  assertUniqueValues(brands.map(({ code }) => code), 'brand code');
  assertUniqueValues(brands.map(({ slug }) => slug), 'brand slug');
  assertUniqueValues(categories.map(({ code }) => code), 'category code');
  assertUniqueValues(categories.map(({ slug }) => slug), 'category slug');
  assertUniqueValues(products.map(({ productNo }) => productNo), 'product number');
  assertUniqueValues(products.map(({ slug }) => slug), 'product slug');
  assertUniqueValues(products.map(({ sku }) => sku), 'SKU');
}

async function prepareBaoAnMedia(options: DemoSeedOptions): Promise<Map<string, PreparedMedia>> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials are required to import Bảo An demo images.');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  const folder = (process.env.CLOUDINARY_FOLDER ?? 'sport-sys/sport').replace(/^\/+|\/+$/g, '');
  const prepared = new Map<string, PreparedMedia>();

  for (let offset = 0; offset < BAO_AN_PRODUCTS.length; offset += 4) {
    const batch = BAO_AN_PRODUCTS.slice(offset, offset + 4);
    const uploads = await Promise.all(batch.map(async (item) => {
      const publicId = `${folder}/demo/bao-an-sport/${item.slug}`;
      try {
        const result = await getOrUploadBaoAnImage(
          publicId,
          item.imageUrl,
          item.sourceUrl,
          options.refreshMedia,
        );
        return { item, publicId, result };
      } catch (error) {
        throw new Error(`Cannot prepare Cloudinary image for ${item.productNo} (${item.sourceUrl}).`, {
          cause: error,
        });
      }
    }));
    for (const { item, publicId, result } of uploads) {
      if (!result.asset_id) {
        throw new Error(`Cloudinary did not return an asset ID for ${item.productNo}.`);
      }
      const mimeFormat = result.format === 'jpg' ? 'jpeg' : result.format;
      prepared.set(item.productNo, {
        providerAssetId: result.asset_id,
        publicId,
        secureUrl: result.secure_url,
        thumbnailUrl: cloudinary.url(publicId, {
          secure: true, width: 640, height: 640, crop: 'limit', quality: 'auto', fetch_format: 'auto',
        }),
        format: result.format,
        mimeType: `image/${mimeFormat}`,
        width: result.width,
        height: result.height,
        sizeBytes: BigInt(result.bytes),
      });
    }
  }
  return prepared;
}

async function importDemoData(
  transaction: Prisma.TransactionClient,
  preparedMedia: ReadonlyMap<string, PreparedMedia>,
  options: DemoSeedOptions,
): Promise<void> {
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
      update: existingRecordUpdate(options.refreshData, {
        name: item.name,
        addressJson: item.address,
        status: 'ACTIVE',
        updatedBy: bootstrapUser.id,
      }),
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
      update: existingRecordUpdate(options.refreshData, {
        branchId: branch.id,
        name: item.warehouseName,
        status: 'ACTIVE',
        isPrimary: true,
        updatedBy: bootstrapUser.id,
      }),
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
      update: existingRecordUpdate(options.refreshData, {
        name: item.name,
        slug: item.slug,
        status: 'ACTIVE',
      }),
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
      update: existingRecordUpdate(options.refreshData, {
        name: item.name,
        slug: item.slug,
        sortOrder: item.sortOrder,
        status: 'ACTIVE',
      }),
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
    if ((category.path === 'PENDING' || options.refreshData) && category.path !== category.id.toString()) {
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
      update: existingRecordUpdate(options.refreshData, {
        brandId: brand.id,
        productType: item.productType,
        name: item.name,
        slug: item.slug,
        shortDescription: item.shortDescription,
        seoJson: item.sourceUrl ? { demoSource: item.sourceUrl, capturedAt: '2026-09-06' } : undefined,
        status: 'PUBLISHED',
        publishedAt,
        updatedBy: bootstrapUser.id,
      }),
      create: {
        brandId: brand.id,
        productType: item.productType,
        productNo: item.productNo,
        name: item.name,
        slug: item.slug,
        shortDescription: item.shortDescription,
        seoJson: item.sourceUrl ? { demoSource: item.sourceUrl, capturedAt: '2026-09-06' } : undefined,
        status: 'PUBLISHED',
        publishedAt,
        createdBy: bootstrapUser.id,
        updatedBy: bootstrapUser.id,
      },
    });
    await transaction.productCategory.upsert({
      where: { productId_categoryId: { productId: product.id, categoryId: category.id } },
      update: existingRecordUpdate(options.refreshData, { isPrimary: true, sortOrder: 0 }),
      create: { productId: product.id, categoryId: category.id, isPrimary: true, sortOrder: 0 },
    });
    const variant = await transaction.productVariant.upsert({
      where: { sku: item.sku },
      update: existingRecordUpdate(options.refreshData, {
        productId: product.id,
        name: item.name,
        status: 'ACTIVE',
      }),
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
      if (existingBalance && options.refreshData) {
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
      where: {
        productVariantId: variant.id,
        priceType: 'REGULAR',
        channel: 'ONLINE',
        currencyCode: 'VND',
        status: 'ACTIVE',
        endsAt: null,
      },
      orderBy: { startsAt: 'desc' },
    });
    if (currentPrice && options.refreshData) {
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
    } else if (!currentPrice) {
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
      const existingBundle = await transaction.productBundle.findUnique({
        where: { bundleVariantId: variant.id },
      });
      const bundle = existingBundle
        ? options.refreshData
          ? await transaction.productBundle.update({
              where: { id: existingBundle.id },
              data: { status: 'ACTIVE', updatedBy: bootstrapUser.id },
            })
          : existingBundle
        : await transaction.productBundle.create({
          data: {
          bundleVariantId: variant.id,
          status: 'ACTIVE',
          createdBy: bootstrapUser.id,
          updatedBy: bootstrapUser.id,
          },
        });
      if (!existingBundle || options.refreshData) {
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
    const media = preparedMedia.get(item.productNo);
    if (media && item.sourceUrl) {
      const currentAsset = await transaction.mediaAsset.findFirst({
        where: { provider: 'CLOUDINARY', publicId: media.publicId },
      });
      const assetData = {
        providerAssetId: media.providerAssetId,
        publicId: media.publicId,
        secureUrl: media.secureUrl,
        thumbnailUrl: media.thumbnailUrl,
        format: media.format,
        mimeType: media.mimeType,
        width: media.width,
        height: media.height,
        sizeBytes: media.sizeBytes,
        folder: media.publicId.slice(0, media.publicId.lastIndexOf('/')),
        altText: item.name,
        metadataJson: { demoSource: item.sourceUrl, importedAt: '2026-09-06' },
        status: 'ACTIVE',
        uploadedBy: bootstrapUser.id,
      };
      const asset = currentAsset
        ? options.refreshData || options.refreshMedia
          ? await transaction.mediaAsset.update({ where: { id: currentAsset.id }, data: assetData })
          : currentAsset
        : await transaction.mediaAsset.create({
            data: { provider: 'CLOUDINARY', resourceType: 'IMAGE', ...assetData },
          });
      const currentMedia = await transaction.productMedia.findFirst({
        where: { productId: product.id, mediaAssetId: asset.id },
      });
      if (currentMedia && (options.refreshData || options.refreshMedia)) {
        await transaction.productMedia.updateMany({
          where: { productId: product.id, isPrimary: true, mediaAssetId: { not: asset.id } },
          data: { isPrimary: false },
        });
        await transaction.productMedia.update({
          where: { id: currentMedia.id },
          data: { variantId: variant.id, altText: item.name, sortOrder: 0, isPrimary: true, status: 'ACTIVE' },
        });
      } else if (!currentMedia) {
        await transaction.productMedia.updateMany({
          where: { productId: product.id, isPrimary: true },
          data: { isPrimary: false },
        });
        await transaction.productMedia.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            mediaAssetId: asset.id,
            altText: item.name,
            sortOrder: 0,
            isPrimary: true,
            status: 'ACTIVE',
          },
        });
      }
    }
  }
}

async function main(): Promise<void> {
  const options = parseDemoSeedOptions(process.argv.slice(2));
  validateDemoManifest();
  const preparedMedia = await prepareBaoAnMedia(options);
  await prisma.$transaction(
    (transaction) => importDemoData(transaction, preparedMedia, options),
    { maxWait: 10_000, timeout: 180_000 },
  );
  console.log(
    `Demo data checked/imported in ${options.refreshData ? 'refresh-data' : 'create-only'} mode; `
    + `media mode: ${options.refreshMedia ? 'refresh' : 'reuse'}.`,
  );
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
