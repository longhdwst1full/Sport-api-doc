import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

import { ATTRIBUTES, mapSpecifications, parseDimensionsMm, parseWeightGrams } from './seed-catalog-reset';

/**
 * Bổ sung dữ liệu demo Bảo An Sport lên catalog ĐANG CÓ, không xoá gì (SEED-20260926-CATALOG-ENRICH).
 *
 * Khác `seed-catalog-reset.ts`: không đụng đơn, tồn kho, giỏ, giá hay review. Chỉ cập nhật theo khoá
 * tự nhiên — sản phẩm theo `product_no`, SKU theo `sku`, hãng/thuộc tính theo `code`, bài viết theo
 * `slug` — nên chạy lại cho cùng kết quả. Nguồn: `demo-data/catalog-demo.json` và
 * `demo-data/content-demo.json` (nội dung nguyên văn từ baoansport.vn, chủ dự án cho phép 2026-09-26).
 *
 * Luôn ghi backup JSON các bảng bị cập nhật vào `.backups/` TRƯỚC khi ghi.
 */
const CONFIRM_FLAG = '--confirm-manual-seed';
const CHANGE_ID = 'SEED-20260926-CATALOG-ENRICH';

const prisma = new PrismaClient();

interface DemoProduct {
  productNo: string;
  name: string;
  brandCode: string | null;
  shortDescription: string | null;
  description: string | null;
  sourceUrl: string | null;
  crawledSpecifications: Record<string, string>;
  media: Array<{ publicId: string; secureUrl: string; altText: string | null; isPrimary: boolean }>;
  variants: Array<{ sku: string; weightGrams: number; lengthMm: number | null; widthMm: number | null; heightMm: number | null }>;
}

interface DemoPost {
  postType: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverUrl: string;
  relatedProductSlugs: string[];
  publishedAt: string;
  sourceUrl: string;
}

const json = (value: unknown) => JSON.stringify(value, (_, item: unknown) => (typeof item === 'bigint' ? item.toString() : item));

async function backup(productNos: string[], postSlugs: string[]): Promise<string> {
  const products = await prisma.product.findMany({ where: { productNo: { in: productNos } }, include: { variants: true, media: true } });
  const snapshot = {
    products,
    posts: await prisma.contentPost.findMany({ where: { slug: { in: postSlugs } } }),
    brands: await prisma.brand.findMany(),
    attributes: await prisma.attribute.findMany(),
  };
  mkdirSync(join(__dirname, '..', '.backups'), { recursive: true });
  const file = join(__dirname, '..', '.backups', `pre-catalog-enrich-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, json(snapshot));
  return file;
}

function imageFormat(url: string): string | null {
  return url.match(/\.(jpe?g|png|webp|gif)$/i)?.[1].toLowerCase().replace('jpeg', 'jpg') ?? null;
}

async function main(): Promise<void> {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(`Manual demo seed. Run only with explicit approval and ${CONFIRM_FLAG}.`);
  }
  const catalog = JSON.parse(readFileSync(join(__dirname, 'demo-data', 'catalog-demo.json'), 'utf8')) as {
    brands: Array<{ code: string; name: string; slug: string }>;
    products: DemoProduct[];
  };
  const content = JSON.parse(readFileSync(join(__dirname, 'demo-data', 'content-demo.json'), 'utf8')) as { posts: DemoPost[] };
  const actor = await prisma.user.findFirstOrThrow({ where: { status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true } });

  const backupFile = await backup(catalog.products.map((p) => p.productNo), content.posts.map((p) => p.slug));
  console.log(`Backup written: ${backupFile}`);

  const summary = await prisma.$transaction(async (tx) => {
    const brandIds = new Map<string, bigint>();
    for (const brand of catalog.brands) {
      const row = await tx.brand.upsert({ where: { code: brand.code }, create: brand, update: { name: brand.name } });
      brandIds.set(brand.code, row.id);
    }
    const existingAttributes = new Set((await tx.attribute.findMany({ select: { code: true } })).map(({ code }) => code));
    let attributesCreated = 0;
    for (const [index, attribute] of ATTRIBUTES.entries()) {
      if (existingAttributes.has(attribute.code)) continue;
      await tx.attribute.create({ data: { code: attribute.code, name: attribute.name, dataType: 'TEXT', sortOrder: (index + 1) * 10 } });
      attributesCreated++;
    }

    // Ảnh là link ngoài (provider EXTERNAL) như bộ demo hiện có; publicId = URL nguồn để dùng lại giữa các lần chạy.
    const urls = [...new Set(catalog.products.flatMap((p) => p.media.map((m) => m.publicId)))];
    const assetIds = new Map(
      (await tx.mediaAsset.findMany({ where: { publicId: { in: urls } }, select: { id: true, publicId: true } })).map((a) => [a.publicId, a.id]),
    );
    let assetsCreated = 0;
    for (const url of urls.filter((u) => !assetIds.has(u))) {
      const row = await tx.mediaAsset.create({
        data: {
          provider: 'EXTERNAL', providerAssetId: url, publicId: url, secureUrl: url, folder: 'baoansport',
          format: imageFormat(url), resourceType: 'IMAGE', status: 'ACTIVE', uploadedBy: actor.id,
          metadataJson: { seed: CHANGE_ID },
        },
      });
      assetIds.set(url, row.id);
      assetsCreated++;
    }

    let products = 0; let variants = 0; const missingProducts: string[] = [];
    for (const product of catalog.products) {
      const existing = await tx.product.findUnique({ where: { productNo: product.productNo }, select: { id: true, seoJson: true } });
      if (!existing) { missingProducts.push(product.productNo); continue; }
      const { specifications, unmapped } = mapSpecifications(product.crawledSpecifications);
      const spec = (code: string) => specifications.find((entry) => entry.code === code)?.values[0];
      await tx.product.update({
        where: { id: existing.id },
        data: {
          brandId: product.brandCode ? brandIds.get(product.brandCode) ?? null : null,
          shortDescription: product.shortDescription,
          description: product.description,
          specifications: specifications as unknown as Prisma.InputJsonValue,
          seoJson: {
            ...((existing.seoJson as Record<string, unknown> | null) ?? {}),
            sourceUrl: product.sourceUrl, specifications: product.crawledSpecifications, unmappedSpecifications: unmapped, enrichedBy: CHANGE_ID,
          },
          updatedBy: actor.id,
          version: { increment: 1 },
        },
      });
      // Bộ ảnh cũ lẫn banner quảng cáo và ảnh "Sản phẩm cùng loại" của sản phẩm khác: thay cả bộ bằng gallery thật.
      await tx.productMedia.deleteMany({ where: { productId: existing.id, variantId: null } });
      await tx.productMedia.createMany({
        data: product.media.map((media, index) => ({
          productId: existing.id, mediaAssetId: assetIds.get(media.publicId)!, mediaType: 'IMAGE',
          altText: media.altText ?? product.name, sortOrder: index, isPrimary: media.isPrimary, status: 'ACTIVE',
        })),
      });
      const packageSize = parseDimensionsMm(spec('PACKAGE_SIZE'));
      const weight = parseWeightGrams(spec('PACKAGE_WEIGHT')) ?? parseWeightGrams(spec('PRODUCT_WEIGHT'));
      for (const variant of product.variants) {
        const row = await tx.productVariant.findUnique({ where: { sku: variant.sku }, select: { id: true, weightGrams: true, lengthMm: true } });
        if (!row) continue;
        // Chỉ điền cân nặng/kích thước còn trống: số Admin đã nhập tay thắng số parse từ thông số web.
        await tx.productVariant.update({
          where: { id: row.id },
          data: {
            ...(row.weightGrams === 0 && weight ? { weightGrams: weight } : {}),
            ...(row.lengthMm === null && packageSize ? { lengthMm: packageSize[0], widthMm: packageSize[1], heightMm: packageSize[2] } : {}),
          },
        });
        variants++;
      }
      products++;
    }

    let postsCreated = 0; let postsUpdated = 0;
    for (const post of content.posts) {
      const data = {
        postType: post.postType, title: post.title, excerpt: post.excerpt, body: post.body, coverUrl: post.coverUrl,
        relatedProductSlugs: post.relatedProductSlugs, publishedAt: new Date(post.publishedAt),
        status: 'PUBLISHED', isPublished: true, archivedAt: null, archiveReason: null,
      };
      const existing = await tx.contentPost.findUnique({ where: { slug: post.slug }, select: { id: true } });
      if (existing) {
        await tx.contentPost.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } });
        postsUpdated++;
      } else {
        await tx.contentPost.create({ data: { ...data, slug: post.slug } });
        postsCreated++;
      }
    }

    const result = {
      brands: brandIds.size, attributesCreated, assetsCreated, products, variants, missingProducts,
      postsCreated, postsUpdated, backupFile,
    };
    await tx.auditLog.create({
      data: {
        requestId: randomUUID(), sequenceNo: 1, actorType: 'SYSTEM', action: 'catalog.demo.enrich', entityType: 'CATALOG',
        entityId: CHANGE_ID, afterJson: result, reason: `Bổ sung mô tả/thương hiệu/thông số/ảnh/bài viết từ baoansport.vn (${CHANGE_ID})`,
      },
    });
    return result;
  }, { maxWait: 20_000, timeout: 600_000 });
  console.log(json(summary));
}

if (require.main === module) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
