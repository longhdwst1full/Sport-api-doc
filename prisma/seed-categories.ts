/**
 * Seed riêng cho Category storefront.
 *
 * Tách khỏi `seed-demo.ts` vì seed demo còn ghi branch/warehouse/product/inventory;
 * khi chỉ cần cập nhật danh mục thì không được chạm những bảng đó trên DB dùng chung.
 *
 *   yarn db:seed:categories --confirm-manual-seed [--refresh-data] [--refresh-media]
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { BAO_AN_CATEGORIES, CORE_CATEGORIES, type BaoAnDemoCategory } from './demo-data/bao-an-sport';
import {
  assertUniqueValues,
  existingRecordUpdate,
  parseDemoSeedOptions,
  type DemoSeedOptions,
} from './demo-data/seed-policy';

const prisma = new PrismaClient();
const categories: readonly BaoAnDemoCategory[] = [...CORE_CATEGORIES, ...BAO_AN_CATEGORIES];

interface UploadedImage {
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
  // SDK trả 404 ở hai dạng: `{ http_code }` hoặc bọc trong `{ error: { http_code } }`.
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { http_code?: unknown; error?: { http_code?: unknown } };
  return candidate.http_code === 404 || candidate.error?.http_code === 404;
}

async function uploadCategoryImages(options: DemoSeedOptions): Promise<Map<string, UploadedImage>> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const uploaded = new Map<string, UploadedImage>();
  if (!cloudName || !apiKey || !apiSecret) {
    // Không có credential thì vẫn seed được phần text; ảnh để trống và
    // Storefront tự render placeholder thay vì chặn cả lần seed.
    console.warn('[categories] Cloudinary credentials missing — seeding without images.');
    return uploaded;
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  const folder = (process.env.CLOUDINARY_FOLDER ?? 'sport-sys/sport').replace(/^\/+|\/+$/g, '');

  for (const category of categories) {
    if (!category.imageUrl || !category.sourceUrl) continue;
    const publicId = `${folder}/categories/${category.slug}`;
    let result: CloudinaryImageResource | undefined;
    if (!options.refreshMedia) {
      try {
        result = (await cloudinary.api.resource(publicId, {
          resource_type: 'image',
          type: 'upload',
        })) as CloudinaryImageResource;
      } catch (error) {
        if (!isCloudinaryNotFound(error)) throw error;
      }
    }
    result ??= await cloudinary.uploader.upload(category.imageUrl, {
      public_id: publicId,
      overwrite: options.refreshMedia,
      unique_filename: false,
      resource_type: 'image',
      tags: ['dctd-demo', 'category'],
      context: `source=${encodeURIComponent(category.sourceUrl)}`,
    });
    if (!result.asset_id) throw new Error(`Cloudinary did not return an asset ID for ${category.code}.`);
    const mimeFormat = result.format === 'jpg' ? 'jpeg' : result.format;
    uploaded.set(category.code, {
      providerAssetId: result.asset_id,
      publicId,
      secureUrl: result.secure_url,
      thumbnailUrl: cloudinary.url(publicId, {
        secure: true, width: 800, height: 500, crop: 'limit', quality: 'auto', fetch_format: 'auto',
      }),
      format: result.format,
      mimeType: `image/${mimeFormat}`,
      width: result.width,
      height: result.height,
      sizeBytes: BigInt(result.bytes),
    });
  }
  return uploaded;
}

async function upsertImageAsset(
  transaction: Prisma.TransactionClient,
  category: BaoAnDemoCategory,
  media: UploadedImage | undefined,
  uploadedBy: bigint,
  options: DemoSeedOptions,
): Promise<bigint | undefined> {
  if (!media) return undefined;
  const current = await transaction.mediaAsset.findFirst({
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
    altText: category.name,
    metadataJson: { demoSource: category.sourceUrl, importedAt: new Date().toISOString().slice(0, 10) },
    status: 'ACTIVE',
    uploadedBy,
  };
  if (!current) {
    const created = await transaction.mediaAsset.create({
      data: { provider: 'CLOUDINARY', resourceType: 'IMAGE', ...assetData },
    });
    return created.id;
  }
  if (options.refreshData || options.refreshMedia) {
    const updated = await transaction.mediaAsset.update({ where: { id: current.id }, data: assetData });
    return updated.id;
  }
  return current.id;
}

async function main(): Promise<void> {
  const options = parseDemoSeedOptions(process.argv.slice(2));
  assertUniqueValues(categories.map(({ code }) => code), 'category code');
  assertUniqueValues(categories.map(({ slug }) => slug), 'category slug');

  const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const bootstrapUser = await prisma.user.findFirst({
    where: bootstrapEmail ? { normalizedEmail: bootstrapEmail } : {},
    orderBy: { id: 'asc' },
  });
  if (!bootstrapUser) throw new Error('No user found. Run prisma:seed before seeding categories.');

  const media = await uploadCategoryImages(options);

  await prisma.$transaction(async (transaction) => {
    for (const item of categories) {
      const imageAssetId = await upsertImageAsset(
        transaction, item, media.get(item.code), bootstrapUser.id, options,
      );
      const category = await transaction.category.upsert({
        where: { code: item.code },
        update: existingRecordUpdate(options.refreshData, {
          name: item.name,
          slug: item.slug,
          sortOrder: item.sortOrder,
          description: item.description,
          status: 'ACTIVE',
          ...(imageAssetId ? { imageAssetId } : {}),
        }),
        create: {
          code: item.code,
          name: item.name,
          slug: item.slug,
          sortOrder: item.sortOrder,
          path: 'PENDING',
          depth: 0,
          status: 'ACTIVE',
          description: item.description,
          imageAssetId,
        },
      });
      if (category.path === 'PENDING' && category.path !== category.id.toString()) {
        await transaction.category.update({
          where: { id: category.id },
          data: { path: category.id.toString() },
        });
      }
    }
  }, { timeout: 120_000 });

  const total = await prisma.category.count({ where: { status: 'ACTIVE' } });
  console.log(`[categories] seeded ${categories.length} manifest entries; ${total} ACTIVE categories in database.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
