import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Xoá sạch catalog + dữ liệu giao dịch thử rồi seed lại bộ demo trong `demo-data/catalog-demo.json`.
 *
 * Chỉ dùng cho môi trường demo/đồ án (quyết định của chủ dự án 2026-09-25). Không bao giờ gọi từ
 * start/build/migration. Luôn ghi backup JSON vào `.backups/` TRƯỚC khi xoá.
 *
 * Giữ nguyên: kho/chi nhánh, user/phân quyền, khách hàng, audit log, media_assets (ảnh Cloudinary
 * được dùng lại theo publicId) và bài viết (chỉ cập nhật danh sách sản phẩm liên quan).
 */
const CONFIRM_FLAG = '--confirm-destructive-reset';
const CHANGE_ID = 'SEED-20260925-CATALOG-RESET';
const DEMO_STOCK = { MIN: 10, MAX: 30 } as const;

const prisma = new PrismaClient();

interface DemoProduct {
  productNo: string;
  name: string;
  slug: string;
  brandCode: string | null;
  shortDescription: string | null;
  description: string | null;
  sourceUrl: string | null;
  crawledSpecifications: Record<string, string>;
  categoryCodes: string[];
  media: Array<{ publicId: string; secureUrl: string; altText: string | null; isPrimary: boolean }>;
  variants: Array<{
    sku: string;
    name: string;
    barcode: string | null;
    weightGrams: number;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    price: string;
  }>;
}

interface DemoDataset {
  categories: Array<{ code: string; name: string; slug: string; parentCode: string | null; sortOrder: number; description: string | null; returnable: boolean }>;
  brands: Array<{ code: string; name: string; slug: string }>;
  products: DemoProduct[];
}

/**
 * Gom ~150 nhãn thông số crawl về một từ điển nhỏ. Thứ tự alias quan trọng: nhãn đầu tiên có giá trị
 * thắng (ví dụ "Trọng lượng" trước "Trọng lượng máy"). Nhãn không map giữ lại trong seoJson.
 */
export const ATTRIBUTES: Array<{ code: string; name: string; aliases: RegExp }> = [
  { code: 'MODEL_CODE', name: 'Mã model', aliases: /^mã sản phẩm$/ },
  { code: 'COLOR', name: 'Màu sắc', aliases: /^màu sắc$/ },
  { code: 'MATERIAL', name: 'Chất liệu', aliases: /^(chất liệu|vật liệu)$/ },
  { code: 'PRODUCT_WEIGHT', name: 'Trọng lượng sản phẩm', aliases: /^trọng lượng( (máy|ghế|bàn|xe|xà|trụ|bao|tạ|khung|giá|kính|bóng|cả bộ))?$/ },
  { code: 'PACKAGE_WEIGHT', name: 'Trọng lượng đóng gói', aliases: /^trọng lượng (thùng|hộp|cả hộp|cả thùng|đóng thùng)$/ },
  { code: 'MAX_LOAD', name: 'Tải trọng tối đa', aliases: /^tải trọng tối đa$/ },
  { code: 'INSTALL_SIZE', name: 'Kích thước lắp đặt', aliases: /^kích thước( (lắp đặt|lắp|khi dùng|đặt))?$/ },
  { code: 'FOLDED_SIZE', name: 'Kích thước gập gọn', aliases: /^kích thước (gập gọn|gấp gọn|gập dựng)$/ },
  { code: 'PACKAGE_SIZE', name: 'Kích thước đóng gói', aliases: /^kích thước (thùng|hộp|đóng gói|đóng thùng|đóng hộp|vận chuyển|thùng 1)$/ },
  { code: 'INSTALL_AREA', name: 'Diện tích lắp đặt', aliases: /^diện tích (lắp đặt|phù hợp)$/ },
  { code: 'POWER', name: 'Công suất', aliases: /^(công suất|động cơ)$/ },
  { code: 'SPEED', name: 'Tốc độ', aliases: /^tốc độ$/ },
  { code: 'VOLTAGE', name: 'Điện áp', aliases: /^điện áp( sử dụng)?$/ },
  { code: 'SCREEN', name: 'Màn hình', aliases: /^màn hình$/ },
  { code: 'INCLINE', name: 'Nâng độ dốc', aliases: /^nâng độ dốc$/ },
  { code: 'RUNNING_DECK', name: 'Băng chạy', aliases: /^(kích thước bàn chạy|thảm chạy)$/ },
  { code: 'RESISTANCE', name: 'Kháng lực', aliases: /^kháng lực$/ },
  { code: 'FLYWHEEL', name: 'Trọng lượng bánh đà', aliases: /^trọng lượng bánh đà$/ },
  { code: 'HEART_RATE', name: 'Đo nhịp tim', aliases: /^đo nhịp tim$/ },
  { code: 'WHEELS', name: 'Bánh xe di chuyển', aliases: /^bánh xe( di chuyển)?$/ },
  { code: 'FOLDABLE', name: 'Gập gọn', aliases: /^(gập gọn|chức năng gập gọn)$/ },
  { code: 'DIAMETER', name: 'Đường kính', aliases: /^đường kính( (bao|bóng|rổ|chân|bánh xe))?$/ },
  { code: 'THICKNESS', name: 'Độ dày', aliases: /^độ dày( (mặt bàn|thảm|bảng|vợt|thảm cầu lông))?$/ },
  { code: 'HEIGHT', name: 'Chiều cao', aliases: /^chiều cao( (điều chỉnh|tối đa|rổ|trụ đấm|thân bao))?$/ },
  { code: 'LENGTH', name: 'Chiều dài', aliases: /^chiều dài$/ },
  { code: 'SIZE', name: 'Size', aliases: /^size( bóng)?$/ },
  { code: 'INCLUDED', name: 'Phụ kiện đi kèm', aliases: /^(phụ kiện đi kèm|bộ sản phẩm|bộ vợt gồm|lưới đi kèm|bóng đi kèm|bóng tặng kèm|cọc lưới đi kèm|bánh tạ đi kèm|đòn tạ đi kèm|túi đựng|hộp đựng)$/ },
  { code: 'TARGET_USER', name: 'Đối tượng sử dụng', aliases: /^đối tượng sử dụng$/ },
  // Hai dòng dưới lấy từ khối "Thương hiệu / Bảo hành / Xuất xứ" của trang sản phẩm, không phải bảng thông số.
  { code: 'ORIGIN', name: 'Xuất xứ', aliases: /^xuất xứ$/ },
  { code: 'WARRANTY', name: 'Bảo hành', aliases: /^bảo hành$/ },
];

const UNKNOWN_VALUE = /^(đang cập nhật|updating|n\/a|-)$/i;

export function mapSpecifications(crawled: Record<string, string>): {
  specifications: Array<{ code: string; values: string[] }>;
  unmapped: Record<string, string>;
} {
  const byCode = new Map<string, string>();
  const unmapped: Record<string, string> = {};
  for (const [label, raw] of Object.entries(crawled)) {
    const value = String(raw).trim().slice(0, 255);
    if (!value || UNKNOWN_VALUE.test(value)) continue;
    const attribute = ATTRIBUTES.find(({ aliases }) => aliases.test(label.trim().toLowerCase()));
    if (!attribute) unmapped[label] = value;
    else if (!byCode.has(attribute.code)) byCode.set(attribute.code, value);
  }
  return {
    specifications: ATTRIBUTES.filter(({ code }) => byCode.has(code)).map(({ code }) => ({ code, values: [byCode.get(code)!] })),
    unmapped,
  };
}

/** "64 x 25 x 7cm" / "1600 x 1470 x 120 mm" → mm; chỉ nhận đủ 3 chiều để không đoán bậy. */
export function parseDimensionsMm(value: string | undefined): [number, number, number] | null {
  const match = value?.toLowerCase().match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s*$/);
  if (!match) return null;
  const factor = match[4] === 'mm' ? 1 : match[4] === 'cm' ? 10 : 1000;
  const dims = [match[1], match[2], match[3]].map((part) => Math.round(Number(part.replace(',', '.')) * factor));
  return dims.every((dim) => dim >= 1) ? (dims as [number, number, number]) : null;
}

/** "5.5 kg" / "150 gram" → gram. */
export function parseWeightGrams(value: string | undefined): number | null {
  const match = value?.toLowerCase().match(/^\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram)\s*$/);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  return Math.round(match[2] === 'kg' ? amount * 1000 : amount);
}

/** Số tồn demo ổn định theo SKU + kho: chạy lại ra cùng số, không phụ thuộc Math.random. */
export function demoQuantity(sku: string, warehouseCode: string): number {
  const hash = createHash('sha256').update(`${sku}:${warehouseCode}`).digest().readUInt32BE(0);
  return DEMO_STOCK.MIN + (hash % (DEMO_STOCK.MAX - DEMO_STOCK.MIN + 1));
}

const json = (value: unknown) => JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item));

/** Bảng bị xoá, con trước cha (khớp đồ thị khoá ngoại đã kiểm 2026-09-25). */
const WIPE_ORDER = [
  'payment_transactions', 'payment_evidences', 'refunds', 'return_status_history', 'return_items', 'return_requests',
  'fulfillment_status_history', 'fulfillments', 'payments', 'order_addresses', 'order_status_history',
  'order_item_components', 'order_items', 'orders',
  'inventory_reservation_items', 'inventory_reservations', 'checkout_session_items', 'checkout_sessions', 'cart_items',
  'flash_sale_quota_reservations', 'flash_sale_items', 'flash_sale_campaigns',
  'product_review_comments', 'product_reviews',
  'stock_adjustment_items', 'stock_adjustments', 'stock_transfer_items', 'stock_transfers',
  'inventory_movements', 'inventory_balances',
  'product_prices', 'bundle_items', 'product_bundles', 'product_media', 'product_categories', 'product_variants', 'products',
  'categories', 'brands', 'attributes',
] as const;

async function backup(): Promise<string> {
  const snapshot: Record<string, unknown[]> = {};
  for (const table of WIPE_ORDER) snapshot[table] = await prisma.$queryRawUnsafe(`SELECT * FROM ${table}`);
  mkdirSync(join(__dirname, '..', '.backups'), { recursive: true });
  const file = join(__dirname, '..', '.backups', `pre-catalog-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, json(snapshot));
  return file;
}

async function main(): Promise<void> {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(`Destructive catalog reset. Run only with explicit approval and ${CONFIRM_FLAG}.`);
  }
  const dataset = JSON.parse(readFileSync(join(__dirname, 'demo-data', 'catalog-demo.json'), 'utf8')) as DemoDataset;
  const actor = await prisma.user.findFirstOrThrow({ where: { status: 'ACTIVE' }, orderBy: { id: 'asc' }, select: { id: true } });
  const warehouses = await prisma.warehouse.findMany({ where: { status: 'ACTIVE', branch: { status: 'ACTIVE' } }, orderBy: { id: 'asc' } });
  const assets = new Map(
    (await prisma.mediaAsset.findMany({ where: { publicId: { in: dataset.products.flatMap((p) => p.media.map((m) => m.publicId)) } }, select: { id: true, publicId: true } }))
      .map((asset) => [asset.publicId, asset.id]),
  );
  const missing = dataset.products.flatMap((p) => p.media.filter((m) => !assets.has(m.publicId)).map((m) => m.publicId));
  if (missing.length > 0) throw new Error(`Missing media assets: ${missing.slice(0, 5).join(', ')}`);

  const backupFile = await backup();
  console.log(`Backup written: ${backupFile}`);

  const requestId = randomUUID();
  const now = new Date();
  // Danh mục chỉ giữ nhánh có sản phẩm: danh mục rỗng trên storefront trông như lỗi.
  const usedCodes = new Set(dataset.products.flatMap((p) => p.categoryCodes));
  const parentOf = new Map(dataset.categories.map((c) => [c.code, c.parentCode]));
  for (const code of [...usedCodes]) for (let parent = parentOf.get(code); parent; parent = parentOf.get(parent)) usedCodes.add(parent);

  const summary = await prisma.$transaction(async (tx) => {
    for (const table of WIPE_ORDER) await tx.$executeRawUnsafe(`DELETE FROM ${table}`);
    // Email của đơn/phiếu trả đã xoá không còn gì để gửi; để lại chúng chỉ làm worker thử lại mãi.
    await tx.outboxEvent.deleteMany({ where: { status: { not: 'PROCESSED' }, aggregateType: { in: ['ORDER', 'RETURN_REQUEST'] } } });

    const attributeRows = await Promise.all(ATTRIBUTES.map((attribute, index) =>
      tx.attribute.create({ data: { code: attribute.code, name: attribute.name, dataType: 'TEXT', sortOrder: (index + 1) * 10 } })));

    const brandIds = new Map<string, bigint>();
    for (const brand of dataset.brands) brandIds.set(brand.code, (await tx.brand.create({ data: brand })).id);

    const categoryIds = new Map<string, { id: bigint; path: string; depth: number }>();
    for (const category of dataset.categories.filter((c) => usedCodes.has(c.code))) {
      const parent = category.parentCode ? categoryIds.get(category.parentCode) : undefined;
      const path = parent ? `${parent.path}/${category.slug}` : category.slug;
      const row = await tx.category.create({
        data: {
          code: category.code, name: category.name, slug: category.slug, path, depth: parent ? parent.depth + 1 : 0,
          parentId: parent?.id ?? null, sortOrder: category.sortOrder, description: category.description, returnable: category.returnable,
        },
      });
      categoryIds.set(category.code, { id: row.id, path, depth: row.depth });
    }

    const adjustments = new Map<bigint, bigint>();
    for (const warehouse of warehouses) {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          adjustmentNo: `SEED-${warehouse.code}-${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
          warehouseId: warehouse.id, adjustmentType: 'OPENING_BALANCE', reasonCode: 'MANUAL',
          reason: `Tồn demo seed (${CHANGE_ID})`, idempotencyKey: `${CHANGE_ID}:${warehouse.code}`,
          requestHash: createHash('sha256').update(`${CHANGE_ID}:${warehouse.code}`).digest('hex'),
          resultJson: { changeId: CHANGE_ID }, createdBy: actor.id, postedAt: now,
        },
      });
      adjustments.set(warehouse.id, adjustment.id);
    }

    let variants = 0; let movements = 0;
    const categoryImage = new Map<string, bigint>();
    for (const product of dataset.products) {
      const { specifications, unmapped } = mapSpecifications(product.crawledSpecifications);
      const spec = (code: string) => specifications.find((entry) => entry.code === code)?.values[0];
      const created = await tx.product.create({
        data: {
          productNo: product.productNo, name: product.name, slug: product.slug, productType: 'STANDARD',
          brandId: product.brandCode ? brandIds.get(product.brandCode) ?? null : null,
          shortDescription: product.shortDescription, description: product.description,
          status: 'PUBLISHED', isPublished: true, publishedAt: now,
          specifications: specifications as unknown as Prisma.InputJsonValue,
          seoJson: { sourceUrl: product.sourceUrl, specifications: product.crawledSpecifications, unmappedSpecifications: unmapped, seed: CHANGE_ID },
          createdBy: actor.id, updatedBy: actor.id,
        },
      });
      await tx.productCategory.createMany({
        data: product.categoryCodes.filter((code) => categoryIds.has(code)).map((code, index) => ({
          productId: created.id, categoryId: categoryIds.get(code)!.id, isPrimary: index === 0, sortOrder: index,
        })),
      });
      await tx.productMedia.createMany({
        data: product.media.map((media, index) => ({
          productId: created.id, mediaAssetId: assets.get(media.publicId)!, mediaType: 'IMAGE',
          altText: media.altText ?? product.name, sortOrder: index, isPrimary: media.isPrimary, status: 'ACTIVE',
        })),
      });
      const primary = product.media.find((media) => media.isPrimary);
      for (const code of product.categoryCodes) if (primary && !categoryImage.has(code)) categoryImage.set(code, assets.get(primary.publicId)!);

      const packageSize = parseDimensionsMm(spec('PACKAGE_SIZE'));
      const weight = parseWeightGrams(spec('PACKAGE_WEIGHT')) ?? parseWeightGrams(spec('PRODUCT_WEIGHT'));
      for (const variant of product.variants) {
        const row = await tx.productVariant.create({
          data: {
            productId: created.id, sku: variant.sku, name: variant.name, barcode: variant.barcode, status: 'ACTIVE',
            // Cước GHN tính theo cân nặng/kích thước kiện: ưu tiên số đã có, rồi mới tới số parse được từ thông số crawl.
            weightGrams: variant.weightGrams > 0 ? variant.weightGrams : weight ?? 0,
            lengthMm: variant.lengthMm ?? packageSize?.[0] ?? null,
            widthMm: variant.widthMm ?? packageSize?.[1] ?? null,
            heightMm: variant.heightMm ?? packageSize?.[2] ?? null,
          },
        });
        await tx.productPrice.create({
          data: { productVariantId: row.id, priceType: 'REGULAR', channel: 'ONLINE', currencyCode: 'VND', amount: new Prisma.Decimal(variant.price), startsAt: now, status: 'ACTIVE', createdBy: actor.id, updatedBy: actor.id },
        });
        for (const warehouse of warehouses) {
          const quantity = demoQuantity(variant.sku, warehouse.code);
          const adjustmentId = adjustments.get(warehouse.id)!;
          await tx.inventoryBalance.create({ data: { warehouseId: warehouse.id, productVariantId: row.id, onHand: quantity, reserved: 0 } });
          await tx.stockAdjustmentItem.create({ data: { stockAdjustmentId: adjustmentId, productVariantId: row.id, quantityDelta: quantity, expectedOnHand: 0, actualOnHand: quantity, note: 'Tồn demo' } });
          await tx.inventoryMovement.create({
            data: {
              warehouseId: warehouse.id, productVariantId: row.id, movementType: 'ADJUST', quantityDelta: quantity, balanceAfter: quantity,
              referenceType: 'STOCK_ADJUSTMENT', referenceId: adjustmentId.toString(),
              idempotencyKey: `${CHANGE_ID}:${warehouse.code}:${variant.sku}`, reason: `Tồn demo seed (${CHANGE_ID})`, occurredAt: now, createdBy: actor.id,
            },
          });
          movements++;
        }
        variants++;
      }
    }

    // Danh mục cha chưa có ảnh riêng thì mượn ảnh của một danh mục con.
    for (const category of [...dataset.categories].reverse()) {
      if (!categoryIds.has(category.code)) continue;
      if (!categoryImage.has(category.code)) {
        const child = dataset.categories.find((c) => c.parentCode === category.code && categoryImage.has(c.code));
        if (child) categoryImage.set(category.code, categoryImage.get(child.code)!);
      }
      const image = categoryImage.get(category.code);
      if (image) await tx.category.update({ where: { id: categoryIds.get(category.code)!.id }, data: { imageAssetId: image } });
    }

    // Bài viết lưu slug sản phẩm liên quan dạng JSON (không có khoá ngoại): bỏ slug không còn tồn tại.
    const slugs = new Set(dataset.products.map((p) => p.slug));
    for (const post of await tx.contentPost.findMany({ select: { id: true, relatedProductSlugs: true } })) {
      const related = Array.isArray(post.relatedProductSlugs) ? (post.relatedProductSlugs as string[]) : [];
      const kept = related.filter((slug) => slugs.has(slug));
      if (kept.length !== related.length) await tx.contentPost.update({ where: { id: post.id }, data: { relatedProductSlugs: kept } });
    }

    const result = {
      attributes: attributeRows.length, brands: brandIds.size, categories: categoryIds.size,
      products: dataset.products.length, variants, warehouses: warehouses.length, movements, backupFile,
    };
    await tx.auditLog.create({
      data: { requestId, sequenceNo: 1, actorType: 'SYSTEM', action: 'catalog.demo.reset', entityType: 'CATALOG', entityId: CHANGE_ID, afterJson: result, reason: `Xoá catalog + giao dịch thử, seed lại bộ demo (${CHANGE_ID})` },
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
