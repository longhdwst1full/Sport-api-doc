import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  toDatabaseId,
  toEntityId,
  toOptionalDatabaseId,
  toOptionalEntityId,
} from '../../../../common/identifiers/entity-id';
import { MutationContext } from '../../../../common/request/request-context';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
} from '../../../../common/pagination/active-search.dto';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditReader } from '../../../audit/audit.reader';
import { AuditWriter } from '../../../audit/audit.writer';
import { ProductMediaService } from './product-media.service';
import { AttributesService } from '../../attributes/attributes.service';
import { ATTRIBUTE_AUDIT_ACTION } from '../../attributes/attribute.constants';
import type { ReplaceProductSpecificationsDto } from '../../attributes/attribute.dto';
import { CATALOG_REFERENCE_STATUS } from '../../catalog.constants';
import {
  ChangeProductStatusDto,
  CreateBundleDto,
  CreatePriceDto,
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListResponseDto,
  ProductPriceTimelineDto,
  ProductPriceWindowDto,
  ProductSummaryDto,
  ReplacePriceDto,
  UpdateProductDto,
  UpdateVariantDto,
  ProductSetupStatusDto,
} from '../dto/product.dto';
import {
  PRODUCT_AUDIT_ACTION,
  PRODUCT_BUNDLE_STATUS,
  PRODUCT_BUNDLE_TYPE,
  PRODUCT_CREATE_IDEMPOTENCY,
  PRODUCT_CURRENCY,
  PRODUCT_ERROR,
  PRODUCT_ERROR_CODE,
  PRODUCT_LIST_SORT,
  PRODUCT_MEDIA_STATUS,
  PRODUCT_PRICE_STATUS,
  PRODUCT_PRICE_TYPE,
  PRODUCT_SALES_CHANNEL,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_VARIANT_STATUS,
  ProductStatus,
  ProductType,
} from '../product.constants';
import {
  generateProductNo,
  generateProductSlug,
  generateSku,
} from '../product-identifiers';
import { evaluatePublishReadiness, type ProductPublishSnapshot } from '../product-publish.policy';
import { findReplay, lockRequest, requestFingerprint } from '../request-idempotency';
import { inStockVariantIds, stockedVariantIds, type StockLine } from './product-availability';

const effectivePriceWhere = (now: Date): Prisma.ProductPriceWhereInput => ({
  status: { in: [PRODUCT_PRICE_STATUS.ACTIVE, PRODUCT_PRICE_STATUS.SCHEDULED] },
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

/** Đúng các trường mà luật "bán được" đọc — dùng chung cho include đầy đủ và truy vấn xếp giá. */
interface SellabilityVariant {
  status: string;
  prices: ReadonlyArray<unknown>;
  bundleDefinition: {
    status: string;
    items: ReadonlyArray<{ componentVariant: { status: string; product: { status: string } } }>;
  } | null;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly auditReader: AuditReader,
    private readonly media: ProductMediaService,
    private readonly attributes: AttributesService,
  ) {}

  async searchActiveVariants(query: ActiveSearchQueryDto): Promise<ActiveLookupResponseDto> {
    const search = query.search?.trim();
    const where: Prisma.ProductVariantWhereInput = {
      status: PRODUCT_VARIANT_STATUS.ACTIVE,
      bundleDefinition: { is: null },
      product: {
        productType: PRODUCT_TYPE.STANDARD,
        status: { not: PRODUCT_STATUS.ARCHIVED },
      },
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    // Hai phép đọc độc lập: chạy song song để tránh giữ transaction/connection trên
    // Supabase pooler. READ COMMITTED trước đây cũng không bảo đảm cùng snapshot.
    const [rows, total] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        orderBy: [{ sku: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
        select: {
          id: true,
          sku: true,
          name: true,
          // Giá đang áp dụng để form khuyến mãi điền sẵn giá gốc.
          prices: {
            where: { status: 'ACTIVE', channel: 'ONLINE', priceType: 'REGULAR' },
            orderBy: { startsAt: 'desc' },
            take: 1,
            select: { amount: true },
          },
        },
      }),
      this.prisma.productVariant.count({ where }),
    ]);
    return {
      items: rows.map(({ id, sku, name, prices }) => ({
        id: toEntityId(id),
        code: sku,
        label: name,
        priceAmount: prices[0]?.amount.toFixed(2) ?? null,
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        hasMore: skip + query.limit < total,
      },
    };
  }

  /**
   * Lọc theo danh mục phải bao gồm cả nhánh con. Sản phẩm chỉ gắn vào danh mục lá,
   * nên nếu so khớp slug chính xác thì chọn danh mục cha luôn trả về rỗng.
   * `path` lưu chuỗi slug từ gốc nên tiền tố `<path>/` bắt đúng toàn bộ hậu duệ.
   */
  private async resolveCategoryFilter(
    slug: string | undefined,
    storefront: boolean,
  ): Promise<Prisma.CategoryWhereInput | undefined> {
    const value = slug?.trim();
    if (!value) return undefined;
    const activeOnly = storefront ? { status: CATALOG_REFERENCE_STATUS.ACTIVE } : {};
    const selected = await this.prisma.category.findUnique({
      where: { slug: value },
      select: { path: true },
    });
    // Slug không tồn tại thì giữ nguyên hành vi cũ: không khớp sản phẩm nào.
    if (!selected) return { slug: value, ...activeOnly };
    return {
      OR: [{ slug: value }, { path: { startsWith: `${selected.path}/` } }],
      ...activeOnly,
    };
  }

  async list(query: ListProductsQueryDto, storefront: boolean): Promise<ProductListResponseDto> {
    const now = new Date();
    const search = query.search?.trim();
    const categoryWhere = await this.resolveCategoryFilter(query.category, storefront);
    const where: Prisma.ProductWhereInput = {
      ...(storefront
        // Storefront nhìn cờ hiển thị: ẩn tạm một sản phẩm không cần đẩy nó về DRAFT.
        ? { status: PRODUCT_STATUS.PUBLISHED, isPublished: true, ...this.sellableProductWhere(now) }
        : query.status
          ? { status: query.status }
          : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { productNo: { contains: search, mode: 'insensitive' } },
              { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      // Các ô riêng cộng dồn: nhập cả tên lẫn SKU thì phải thoả cả hai,
      // khác với ô gộp ở trên vốn là OR.
      ...(query.name?.trim()
        ? { name: { contains: query.name.trim(), mode: 'insensitive' as const } }
        : {}),
      ...(query.productNo?.trim()
        ? { productNo: { contains: query.productNo.trim(), mode: 'insensitive' as const } }
        : {}),
      ...(query.sku?.trim()
        ? {
            variants: {
              some: { sku: { contains: query.sku.trim(), mode: 'insensitive' as const } },
            },
          }
        : {}),
      ...(categoryWhere ? { categories: { some: { category: categoryWhere } } } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const byPrice =
      query.sort === PRODUCT_LIST_SORT.PRICE_ASC ||
      query.sort === PRODUCT_LIST_SORT.PRICE_DESC ||
      query.minPrice !== undefined ||
      query.maxPrice !== undefined;
    // Trang sản phẩm và tổng số là hai phép đọc độc lập: không cần giữ transaction
    // trên pooler chỉ để đọc, nhất là khi DB ở khác region với API.
    const [rows, total] = byPrice
      ? await this.listPageByPrice(where, query, storefront, now, skip)
      : await Promise.all([
          this.prisma.product.findMany({
            where,
            include: this.productInclude(now, storefront),
            // Database ở xa nên chi phí chính là số vòng mạng: chiến lược mặc định
            // tách mỗi quan hệ thành một truy vấn riêng (12 vòng cho include này),
            // còn 'join' gộp lại còn 4. Đo được 1.930ms -> 814ms.
            relationLoadStrategy: 'join',
            orderBy:
              query.sort === PRODUCT_LIST_SORT.NAME_ASC
                ? [{ name: 'asc' }, { id: 'asc' }]
                : [{ createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: query.limit,
          }),
          this.prisma.product.count({ where }),
        ]);
    const inStock = await this.inStockVariantIds(rows, storefront);
    return {
      items: rows.map((row) => {
        const summary = this.toSummary(row, storefront);
        return {
          ...summary,
          shortDescription: row.shortDescription ?? null,
          inStock: this.visibleVariants(row, storefront).some(({ id }) => inStock.has(id.toString())),
        };
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getBySlug(slug: string, storefront: boolean): Promise<ProductDetailDto> {
    const now = new Date();
    const row = await this.prisma.product.findFirst({
      relationLoadStrategy: 'join',
      where: {
        slug,
        ...(storefront
          ? {
              status: PRODUCT_STATUS.PUBLISHED,
              isPublished: true,
              ...this.sellableProductWhere(now),
            }
          : {}),
      },
      include: this.productInclude(now, storefront),
    });
    if (!row) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
    const [specifications, inStock] = await Promise.all([
      this.attributes.resolve(row.specifications),
      this.inStockVariantIds([row], storefront),
    ]);
    const detail = this.toDetail(row, storefront);
    return {
      ...detail,
      specifications,
      inStock: detail.variants.some(({ id }) => inStock.has(id)),
      variants: detail.variants.map((variant) => ({ ...variant, inStock: inStock.has(variant.id) })),
    };
  }

  /**
   * Trang danh sách khi phải xếp/lọc theo giá. `minPrice` là giá thấp nhất trong các SKU bán được
   * (khung giá hiệu lực) nên không nằm trên một cột nào để ORDER BY: đọc bản nhẹ của mọi sản phẩm
   * khớp bộ lọc, tính đúng luật như `toSummary`, xếp rồi mới nạp đầy đủ một trang.
   *
   * PERFORMANCE: tuyến tính theo số sản phẩm khớp lọc (~600 ở V1, 1 truy vấn nhẹ + 1 truy vấn trang).
   * Khi catalog lên hàng chục nghìn thì cần cột giá hiển thị được duy trì sẵn thay vì cách này.
   */
  private async listPageByPrice(
    where: Prisma.ProductWhereInput,
    query: ListProductsQueryDto,
    storefront: boolean,
    now: Date,
    skip: number,
  ) {
    const candidates = await this.prisma.product.findMany({
      where,
      relationLoadStrategy: 'join',
      select: {
        id: true,
        productType: true,
        createdAt: true,
        variants: {
          select: {
            status: true,
            prices: { where: effectivePriceWhere(now), orderBy: { startsAt: 'desc' }, take: 1, select: { amount: true } },
            bundleDefinition: {
              select: {
                status: true,
                items: { select: { componentVariant: { select: { status: true, product: { select: { status: true } } } } } },
              },
            },
          },
        },
      },
    });
    const minPrice = query.minPrice !== undefined ? new Prisma.Decimal(query.minPrice) : undefined;
    const maxPrice = query.maxPrice !== undefined ? new Prisma.Decimal(query.maxPrice) : undefined;
    const priced = candidates
      .map((candidate) => {
        const amounts = candidate.variants
          .filter((variant) => this.isLoadedVariantSellable(candidate.productType as ProductType, variant))
          .flatMap((variant) => variant.prices.map(({ amount }) => amount));
        const lowest = amounts.reduce<Prisma.Decimal | null>(
          (current, amount) => (current === null || amount.lessThan(current) ? amount : current),
          null,
        );
        return { id: candidate.id, createdAt: candidate.createdAt, price: lowest };
      })
      // Có khoảng giá thì sản phẩm chưa có giá không thể nằm "trong khoảng".
      .filter(({ price }) =>
        (minPrice === undefined && maxPrice === undefined) ||
        (price !== null &&
          (minPrice === undefined || price.greaterThanOrEqualTo(minPrice)) &&
          (maxPrice === undefined || price.lessThanOrEqualTo(maxPrice))));
    const direction = query.sort === PRODUCT_LIST_SORT.PRICE_DESC ? -1 : 1;
    const byPriceSort = query.sort === PRODUCT_LIST_SORT.PRICE_ASC || query.sort === PRODUCT_LIST_SORT.PRICE_DESC;
    priced.sort((left, right) => {
      if (byPriceSort) {
        // Chưa có giá luôn ở cuối, bất kể chiều xếp — lên đầu "giá thấp nhất" là sai sự thật.
        if (left.price === null || right.price === null) {
          if (left.price !== right.price) return left.price === null ? 1 : -1;
        } else {
          const compared = left.price.comparedTo(right.price) * direction;
          if (compared !== 0) return compared;
        }
      }
      return right.createdAt.getTime() - left.createdAt.getTime() || (right.id > left.id ? 1 : right.id < left.id ? -1 : 0);
    });
    const pageIds = priced.slice(skip, skip + query.limit).map(({ id }) => id);
    const loaded = pageIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: pageIds } },
          include: this.productInclude(now, storefront),
          relationLoadStrategy: 'join',
        })
      : [];
    const byId = new Map(loaded.map((row) => [row.id, row]));
    const rows = pageIds.flatMap((id) => byId.get(id) ?? []);
    return [rows, priced.length] as const;
  }

  /** Các SKU mà response hiển thị: Storefront chỉ thấy SKU bán được, Admin thấy tất cả. */
  private visibleVariants(
    row: Awaited<ReturnType<ProductsService['findProductForMapping']>>,
    storefront: boolean,
  ) {
    return storefront
      ? row.variants.filter((variant) => this.isLoadedVariantSellable(row.productType as ProductType, variant))
      : row.variants;
  }

  /**
   * Một lượt đọc số dư cho cả trang. Chỉ kho và chi nhánh đang hoạt động — cùng điều kiện checkout
   * dùng để chọn kho, để "còn hàng" trên thẻ không hứa thứ checkout sẽ từ chối.
   */
  private async inStockVariantIds(
    rows: ReadonlyArray<Awaited<ReturnType<ProductsService['findProductForMapping']>>>,
    storefront: boolean,
  ): Promise<Set<string>> {
    const lines: StockLine[] = rows.flatMap((row) =>
      this.visibleVariants(row, storefront).map((variant) => ({
        variantId: variant.id,
        components:
          variant.bundleDefinition?.items.map(({ componentVariantId, quantity }) => ({
            variantId: componentVariantId,
            quantity,
          })) ?? [],
      })),
    );
    const ids = stockedVariantIds(lines);
    if (ids.length === 0) return new Set();
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        productVariantId: { in: ids },
        warehouse: { status: 'ACTIVE', branch: { status: 'ACTIVE' } },
      },
      select: { warehouseId: true, productVariantId: true, onHand: true, reserved: true },
    });
    return inStockVariantIds(lines, balances);
  }

  /**
   * Tạo Product cùng 1–50 SKU ban đầu trong một transaction.
   *
   * IDEMPOTENCY: khoá là `x-request-id` (Admin giữ cố định cho một lần mở form tạo), kết quả lưu
   * chính là audit `catalog.product.create` của request đó — không thêm cột. Cùng khoá + cùng người +
   * cùng payload trả sản phẩm đã tạo; khoá đã gắn với thao tác khác, người khác hoặc payload khác trả
   * 409. Request không gửi header nhận id ngẫu nhiên từ server nên mỗi lần gọi là một lần tạo mới.
   */
  async create(input: CreateProductDto, context: MutationContext): Promise<ProductDetailDto> {
    if (context.requestId.length > PRODUCT_CREATE_IDEMPOTENCY.MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `x-request-id must not exceed ${PRODUCT_CREATE_IDEMPOTENCY.MAX_KEY_LENGTH} characters`,
      );
    }
    this.validateCategorySelection(input.categoryIds, input.primaryCategoryId);
    const fingerprint = requestFingerprint(PRODUCT_CREATE_IDEMPOTENCY.OPERATION, 'POST', context, input);
    const productNo = generateProductNo();
    const slug = generateProductSlug(input.name, productNo);
    const { variants, media = [], specifications: specificationInput, ...productInput } = input;
    if (new Set(media.map(({ mediaAssetId }) => mediaAssetId)).size !== media.length) {
      throw new UnprocessableEntityException('Media assets must be unique');
    }
    const manualSkus = variants.flatMap(({ sku }) => (sku ? [sku] : []));
    if (new Set(manualSkus).size !== manualSkus.length) {
      throw new UnprocessableEntityException('SKU must be unique within the product');
    }
    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        // TRANSACTION: AuditWriter tự cấp sequence_no = MAX + 1, nên unique (request_id, sequence_no)
        // KHÔNG chặn được request thứ hai cùng id. Advisory lock theo request id giữ tới hết
        // transaction để các request cùng id chạy tuần tự; lần tra audit ngay sau đó vì vậy luôn
        // thấy kết quả đã commit của request trước. Va hash giữa hai id khác nhau chỉ làm chúng
        // chờ nhau, không sai dữ liệu.
        await lockRequest(transaction, 'catalog.product.create', context.requestId);
        const replayedId = await findReplay(transaction, this.auditReader, context, {
          action: PRODUCT_AUDIT_ACTION.CREATE,
          entityType: 'PRODUCT',
          fingerprint,
          conflictCode: PRODUCT_ERROR_CODE.IDEMPOTENCY_CONFLICT,
          conflictMessage: 'Yêu cầu tạo sản phẩm này đã được dùng cho dữ liệu khác. Vui lòng tải lại form rồi thử lại.',
        });
        if (replayedId !== undefined) return toDatabaseId(replayedId);

        await this.validateReferences(transaction, input.brandId, input.categoryIds);
        // INVARIANT: thông số tạo cùng sản phẩm đi qua đúng validator của replaceSpecifications (D61);
        // sai một giá trị thì rollback cả sản phẩm thay vì để lại SPU thiếu thông số.
        const specifications = specificationInput
          ? await this.attributes.validateSpecifications(transaction, specificationInput, [])
          : undefined;
        const product = await transaction.product.create({
          data: {
            productType: input.productType ?? PRODUCT_TYPE.STANDARD,
            productNo,
            name: input.name,
            slug,
            brandId: toOptionalDatabaseId(input.brandId),
            shortDescription: input.shortDescription,
            description: input.description,
            ...(specifications ? { specifications: specifications as unknown as Prisma.InputJsonValue } : {}),
            createdBy: toOptionalDatabaseId(context.actorUserId),
            updatedBy: toOptionalDatabaseId(context.actorUserId),
          },
        });
        await transaction.productCategory.createMany({
          data: input.categoryIds.map((categoryId, sortOrder) => ({
            productId: product.id,
            categoryId: toDatabaseId(categoryId),
            isPrimary: categoryId === input.primaryCategoryId,
            sortOrder,
          })),
        });
        // TRANSACTION: Product, category links và toàn bộ SKU ban đầu là một aggregate create;
        // barcode/SKU lỗi phải rollback tất cả để Admin không nhận một SPU dở dang.
        const now = new Date();
        for (const [variantIndex, { initialPriceAmount, ...variantInput }] of variants.entries()) {
          // INVARIANT: SKU là mã hàng của cửa hàng; admin nhập tay (đã chuẩn hoá ở DTO) hoặc bỏ trống để
          // sinh mã ngắn. Trùng → unique constraint → 409. Đặt sau spread để `sku: undefined` không đè.
          const sku = variantInput.sku ?? generateSku();
          const variant = await transaction.productVariant.create({
            data: { productId: product.id, ...variantInput, sku },
          });
          // TRANSACTION: giá ban đầu tạo cùng SKU; không còn SKU "chưa có giá" khi mạng rớt giữa chừng.
          // Chưa có giá tham chiếu nên không áp luật giảm >20% phải có lý do.
          if (initialPriceAmount) {
            const price = await transaction.productPrice.create({
              data: {
                productVariantId: variant.id,
                amount: new Prisma.Decimal(initialPriceAmount),
                startsAt: now,
                status: PRODUCT_PRICE_STATUS.ACTIVE,
                createdBy: toDatabaseId(context.actorUserId),
                updatedBy: toDatabaseId(context.actorUserId),
              },
            });
            await this.audit.write(
              {
                requestId: context.requestId,
                sequenceNo: 1,
                actorType: 'USER',
                actorUserId: context.actorUserId,
                action: PRODUCT_AUDIT_ACTION.PRICE_CREATE,
                entityType: 'PRODUCT_PRICE',
                entityId: toEntityId(price.id),
                after: { amount: initialPriceAmount, startsAt: now.toISOString(), initial: true },
              },
              transaction,
            );
          }
          await this.audit.write(
            {
              requestId: context.requestId,
              sequenceNo: variantIndex + 2,
              actorType: 'USER',
              actorUserId: context.actorUserId,
              action: PRODUCT_AUDIT_ACTION.VARIANT_CREATE,
              entityType: 'PRODUCT_VARIANT',
              entityId: toEntityId(variant.id),
              after: { ...variantInput, sku } as unknown as Prisma.InputJsonValue,
            },
            transaction,
          );
        }
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.CREATE,
            entityType: 'PRODUCT',
            entityId: toEntityId(product.id),
            after: {
              ...productInput,
              productNo,
              slug,
              variantCount: variants.length,
              mediaCount: media.length,
              ...(specifications ? { specifications } : {}),
              // IDEMPOTENCY: dấu vân tay để lần gửi lại cùng x-request-id so với payload gốc.
              idempotency: fingerprint,
            } as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        if (media.length > 0) await this.media.attachInitialMedia(transaction, product.id, media, context);
        return product.id;
      });
      return this.getById(productId);
    } catch (error) {
      this.rethrowConstraint(error, 'Mã sản phẩm, slug, SKU hoặc barcode đã tồn tại');
    }
  }

  async update(
    id: string,
    input: UpdateProductDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseId = toDatabaseId(id);
    const { expectedVersion, categoryIds, primaryCategoryId, brandId, specifications: specificationInput, ...fields } = input;
    if ((categoryIds && !primaryCategoryId) || (!categoryIds && primaryCategoryId)) {
      throw new UnprocessableEntityException('categoryIds and primaryCategoryId must be sent together');
    }
    if (categoryIds && primaryCategoryId) this.validateCategorySelection(categoryIds, primaryCategoryId);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.lockProductIds(transaction, [databaseId]);
        const current = await transaction.product.findUnique({
          where: { id: databaseId },
          select: {
            productType: true,
            status: true,
            slug: true,
            specifications: true,
            _count: { select: { variants: true } },
          },
        });
        if (!current) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
        if (
          fields.slug !== undefined &&
          fields.slug !== current.slug &&
          current.status !== PRODUCT_STATUS.DRAFT
        ) {
          throw new UnprocessableEntityException('Product slug cannot change after publish');
        }
        if (
          fields.productType &&
          fields.productType !== current.productType &&
          current._count.variants > 0
        ) {
          throw new UnprocessableEntityException(
            'Product type cannot change after variants have been created',
          );
        }
        await this.validateReferences(transaction, brandId, categoryIds);
        // TRANSACTION: thông số sửa cùng thông tin sản phẩm trong một lần tăng version, để form Sửa lưu
        // một lần như form Tạo. Không gửi `specifications` thì giữ nguyên bộ cũ.
        const specifications = specificationInput
          ? await this.attributes.validateSpecifications(
              transaction,
              specificationInput,
              this.attributes.readStored(current.specifications),
            )
          : undefined;
        const updated = await transaction.product.updateMany({
          where: {
            id: databaseId,
            version: BigInt(expectedVersion),
            status: { not: PRODUCT_STATUS.ARCHIVED },
          },
          data: {
            ...fields,
            ...(brandId !== undefined ? { brandId: toOptionalDatabaseId(brandId) } : {}),
            ...(specifications ? { specifications: specifications as unknown as Prisma.InputJsonValue } : {}),
            version: { increment: 1 },
            updatedBy: toOptionalDatabaseId(context.actorUserId),
          },
        });
        if (updated.count !== 1) throw new ConflictException('Product version conflict or product is archived');
        if (categoryIds && primaryCategoryId) {
          await transaction.productCategory.deleteMany({ where: { productId: databaseId } });
          await transaction.productCategory.createMany({
            data: categoryIds.map((categoryId, sortOrder) => ({
              productId: databaseId,
              categoryId: toDatabaseId(categoryId),
              isPrimary: categoryId === primaryCategoryId,
              sortOrder,
            })),
          });
        }
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.UPDATE,
            entityType: 'PRODUCT',
            entityId: id,
            ...(specifications
              ? { before: { specifications: current.specifications } as unknown as Prisma.InputJsonValue }
              : {}),
            after: { ...input, ...(specifications ? { specifications } : {}) } as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
      });
      return this.getById(id);
    } catch (error) {
      this.rethrowConstraint(error, 'Product number or slug already exists');
    }
  }

  async publish(
    id: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseId = toDatabaseId(id);
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.product.findUnique({
        where: { id: databaseId },
        select: {
          id: true,
          variants: {
            select: {
              bundleDefinition: {
                select: {
                  items: {
                    select: { componentVariant: { select: { productId: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!candidate) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
      const aggregateProductIds = [
        candidate.id,
        ...candidate.variants.flatMap(({ bundleDefinition }) =>
          bundleDefinition?.items.map(({ componentVariant }) => componentVariant.productId) ?? [],
        ),
      ];
      await this.lockProductIds(transaction, aggregateProductIds);
      const product = await transaction.product.findFirst({
        where: { id: databaseId },
        include: {
          variants: {
            where: { status: PRODUCT_VARIANT_STATUS.ACTIVE },
            include: {
              prices: { where: effectivePriceWhere(now) },
              bundleDefinition: {
                include: {
                  items: {
                    include: {
                      componentVariant: { include: { product: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!product) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
      if (product.status !== PRODUCT_STATUS.DRAFT) {
        throw new UnprocessableEntityException('Only DRAFT product can be published');
      }
      // INVARIANT: cùng policy với getAdminProductSetupStatus — checklist "đủ" thì publish chắc chắn qua.
      const readiness = evaluatePublishReadiness(
        await this.publishSnapshot(transaction, product.id, product.status, product.productType as ProductType, product.variants),
      );
      if (readiness.blockingIssues.length > 0) {
        throw new UnprocessableEntityException(readiness.blockingIssues[0].message);
      }
      const updated = await transaction.product.updateMany({
        where: {
          id: databaseId,
          version: BigInt(input.expectedVersion),
          status: PRODUCT_STATUS.DRAFT,
        },
        data: {
          status: PRODUCT_STATUS.PUBLISHED,
          isPublished: true,
          publishedAt: now,
          version: { increment: 1 },
          updatedBy: toOptionalDatabaseId(context.actorUserId),
        },
      });
      if (updated.count !== 1) throw new ConflictException(PRODUCT_ERROR.VERSION_CONFLICT);
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: PRODUCT_AUDIT_ACTION.PUBLISH,
          entityType: 'PRODUCT',
          entityId: id,
        },
        transaction,
      );
      return this.getById(id, transaction);
    });
  }

  async archiveProduct(
    id: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    return this.changeProductStatus(
      id,
      input,
      context,
      [PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED],
      PRODUCT_STATUS.ARCHIVED,
      PRODUCT_AUDIT_ACTION.ARCHIVE,
    );
  }

  async reactivateProduct(
    id: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    return this.changeProductStatus(
      id,
      input,
      context,
      [PRODUCT_STATUS.ARCHIVED],
      PRODUCT_STATUS.DRAFT,
      PRODUCT_AUDIT_ACTION.REACTIVATE,
    );
  }

  async archiveVariant(
    variantId: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseVariantId = toDatabaseId(variantId);
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.productVariant.findUnique({
        where: { id: databaseVariantId },
        select: { productId: true },
      });
      if (!candidate) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
      await this.lockProductIds(transaction, [candidate.productId]);
      const variant = await transaction.productVariant.findUnique({
        where: { id: databaseVariantId },
      });
      if (!variant) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
      if (variant.status !== PRODUCT_VARIANT_STATUS.ACTIVE) {
        throw new UnprocessableEntityException('Only ACTIVE variant can be archived');
      }
      const activePublishedBundleUsage = await transaction.bundleItem.count({
        where: {
          componentVariantId: databaseVariantId,
          productBundle: {
            status: PRODUCT_BUNDLE_STATUS.ACTIVE,
            bundleVariant: { product: { status: PRODUCT_STATUS.PUBLISHED } },
          },
        },
      });
      if (activePublishedBundleUsage > 0) {
        throw new UnprocessableEntityException(
          'Variant is used by an active published combo; archive the combo first',
        );
      }
      const updated = await transaction.productVariant.updateMany({
        where: {
          id: databaseVariantId,
          version: BigInt(input.expectedVersion),
          status: PRODUCT_VARIANT_STATUS.ACTIVE,
        },
        data: { status: PRODUCT_VARIANT_STATUS.INACTIVE, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException(PRODUCT_ERROR.VARIANT_VERSION_CONFLICT);
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: PRODUCT_AUDIT_ACTION.VARIANT_ARCHIVE,
          entityType: 'PRODUCT_VARIANT',
          entityId: variantId,
          before: { status: PRODUCT_VARIANT_STATUS.ACTIVE, version: input.expectedVersion },
          after: { status: PRODUCT_VARIANT_STATUS.INACTIVE, version: input.expectedVersion + 1 },
        },
        transaction,
      );
      return this.getById(variant.productId, transaction);
    });
  }

  async reactivateVariant(
    variantId: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseVariantId = toDatabaseId(variantId);
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.productVariant.findUnique({
        where: { id: databaseVariantId },
        select: { productId: true },
      });
      if (!candidate) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
      await this.lockProductIds(transaction, [candidate.productId]);
      const variant = await transaction.productVariant.findUnique({
        where: { id: databaseVariantId },
        include: { product: true },
      });
      if (!variant) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
      if (variant.status !== PRODUCT_VARIANT_STATUS.INACTIVE) {
        throw new UnprocessableEntityException('Only INACTIVE variant can be reactivated');
      }
      if (variant.product.status === PRODUCT_STATUS.ARCHIVED) {
        throw new UnprocessableEntityException('Reactivate the product before its variant');
      }
      const updated = await transaction.productVariant.updateMany({
        where: {
          id: databaseVariantId,
          version: BigInt(input.expectedVersion),
          status: PRODUCT_VARIANT_STATUS.INACTIVE,
        },
        data: { status: PRODUCT_VARIANT_STATUS.ACTIVE, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException(PRODUCT_ERROR.VARIANT_VERSION_CONFLICT);
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: PRODUCT_AUDIT_ACTION.VARIANT_REACTIVATE,
          entityType: 'PRODUCT_VARIANT',
          entityId: variantId,
          before: { status: PRODUCT_VARIANT_STATUS.INACTIVE, version: input.expectedVersion },
          after: { status: PRODUCT_VARIANT_STATUS.ACTIVE, version: input.expectedVersion + 1 },
        },
        transaction,
      );
      return this.getById(variant.productId, transaction);
    });
  }

  async createVariant(
    productId: string,
    input: CreateVariantDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseProductId = toDatabaseId(productId);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.lockProductIds(transaction, [databaseProductId]);
        const product = await transaction.product.findFirst({
          where: { id: databaseProductId, status: { not: PRODUCT_STATUS.ARCHIVED } },
        });
        if (!product) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
        const sku = input.sku ?? generateSku();
        const variant = await transaction.productVariant.create({
          data: { productId: databaseProductId, ...input, sku },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.VARIANT_CREATE,
            entityType: 'PRODUCT_VARIANT',
            entityId: toEntityId(variant.id),
            after: { ...input, sku } as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
      });
      return this.getById(productId);
    } catch (error) {
      this.rethrowConstraint(error, 'SKU or barcode already exists');
    }
  }

  async updateVariant(
    variantId: string,
    input: UpdateVariantDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseVariantId = toDatabaseId(variantId);
    const { expectedVersion, ...fields } = input;
    if (Object.keys(fields).length === 0) {
      throw new UnprocessableEntityException('At least one mutable variant field is required');
    }
    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        const candidate = await transaction.productVariant.findUnique({
          where: { id: databaseVariantId },
          select: { productId: true },
        });
        if (!candidate) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
        await this.lockProductIds(transaction, [candidate.productId]);
        const updated = await transaction.productVariant.updateMany({
          where: {
            id: databaseVariantId,
            version: BigInt(expectedVersion),
            product: { status: { not: PRODUCT_STATUS.ARCHIVED } },
          },
          data: { ...fields, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(PRODUCT_ERROR.VARIANT_VERSION_CONFLICT);
        }
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.VARIANT_UPDATE,
            entityType: 'PRODUCT_VARIANT',
            entityId: variantId,
            after: { ...fields, version: expectedVersion + 1 } as Prisma.InputJsonObject,
          },
          transaction,
        );
        return candidate.productId;
      });
      return this.getById(productId);
    } catch (error) {
      this.rethrowConstraint(error, 'Barcode already exists');
    }
  }

  async createPrice(
    variantId: string,
    input: CreatePriceDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseVariantId = toDatabaseId(variantId);
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : undefined;
    this.ensurePriceIsNotRetroactive(startsAt);
    if (endsAt && endsAt <= startsAt) throw new UnprocessableEntityException('endsAt must be after startsAt');
    // IDEMPOTENCY: gửi lại cùng x-request-id (mất response rồi bấm lại) trả sản phẩm hiện tại thay vì tạo
    // bản giá thứ hai; cùng id khác payload → 409. Xem request-idempotency.ts.
    const fingerprint = requestFingerprint('createAdminProductPrice', 'POST', context, { variantId, input });
    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        await lockRequest(transaction, 'catalog.price.create', context.requestId);
        const variant = await transaction.productVariant.findFirst({ where: { id: databaseVariantId } });
        if (!variant) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
        const replayed = await findReplay(transaction, this.auditReader, context, {
          action: PRODUCT_AUDIT_ACTION.PRICE_CREATE,
          entityType: 'PRODUCT_PRICE',
          fingerprint,
          conflictCode: PRODUCT_ERROR_CODE.IDEMPOTENCY_CONFLICT,
          conflictMessage: 'Yêu cầu tạo giá này đã được dùng cho dữ liệu khác. Vui lòng tải lại rồi thử lại.',
        });
        if (replayed !== undefined) return variant.productId;
        await this.lockProductIds(transaction, [variant.productId]);
        const reference = await transaction.productPrice.findFirst({
          where: {
            productVariantId: databaseVariantId,
            startsAt: { lte: startsAt },
            OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
          },
          orderBy: { startsAt: 'desc' },
        });
        this.ensureLargeReductionHasReason(reference?.amount, input.amount, input.reason);
        const price = await transaction.productPrice.create({
          data: {
            productVariantId: databaseVariantId,
            amount: new Prisma.Decimal(input.amount),
            startsAt,
            endsAt,
            status:
              startsAt <= new Date()
                ? PRODUCT_PRICE_STATUS.ACTIVE
                : PRODUCT_PRICE_STATUS.SCHEDULED,
            createdBy: toDatabaseId(context.actorUserId),
            updatedBy: toDatabaseId(context.actorUserId),
          },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.PRICE_CREATE,
            entityType: 'PRODUCT_PRICE',
            entityId: toEntityId(price.id),
            after: { ...input, amount: input.amount, idempotency: fingerprint } as unknown as Prisma.InputJsonValue,
            reason: input.reason?.trim(),
          },
          transaction,
        );
        return variant.productId;
      });
      return this.getById(productId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        throw new ConflictException(PRODUCT_ERROR.PRICE_OVERLAP);
      }
      throw error;
    }
  }

  async replacePrice(
    variantId: string,
    input: ReplacePriceDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseVariantId = toDatabaseId(variantId);
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : undefined;
    this.ensurePriceIsNotRetroactive(startsAt);
    if (endsAt && endsAt <= startsAt) {
      throw new UnprocessableEntityException('endsAt must be after startsAt');
    }

    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        const variant = await transaction.productVariant.findUnique({ where: { id: databaseVariantId } });
        if (!variant) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
        await this.lockProductIds(transaction, [variant.productId]);

        const current = await transaction.productPrice.findFirst({
          where: {
            id: toDatabaseId(input.expectedCurrentPriceId),
            productVariantId: databaseVariantId,
            priceType: PRODUCT_PRICE_TYPE.REGULAR,
            channel: PRODUCT_SALES_CHANNEL.ONLINE,
            currencyCode: PRODUCT_CURRENCY.VND,
            status: { in: [PRODUCT_PRICE_STATUS.ACTIVE, PRODUCT_PRICE_STATUS.SCHEDULED] },
            endsAt: null,
          },
        });
        if (!current || current.version !== BigInt(input.expectedCurrentPriceVersion)) {
          throw new ConflictException('Current price changed; reload before replacing it');
        }
        if (startsAt <= current.startsAt) {
          throw new UnprocessableEntityException(
            'Replacement price must start after the current price starts',
          );
        }
        this.ensureLargeReductionHasReason(current.amount, input.amount, input.reason);

        const closed = await transaction.productPrice.updateMany({
          where: {
            id: current.id,
            version: BigInt(input.expectedCurrentPriceVersion),
            endsAt: null,
          },
          data: {
            endsAt: startsAt,
            version: { increment: 1 },
            updatedBy: toDatabaseId(context.actorUserId),
          },
        });
        if (closed.count !== 1) {
          throw new ConflictException('Current price changed; reload before replacing it');
        }

        const price = await transaction.productPrice.create({
          data: {
            productVariantId: databaseVariantId,
            amount: new Prisma.Decimal(input.amount),
            startsAt,
            endsAt,
            status:
              startsAt <= new Date()
                ? PRODUCT_PRICE_STATUS.ACTIVE
                : PRODUCT_PRICE_STATUS.SCHEDULED,
            createdBy: toDatabaseId(context.actorUserId),
            updatedBy: toDatabaseId(context.actorUserId),
          },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.PRICE_REPLACE,
            entityType: 'PRODUCT_PRICE',
            entityId: toEntityId(price.id),
            before: {
              id: toEntityId(current.id),
              amount: current.amount.toFixed(2),
              endsAt: current.endsAt?.toISOString() ?? null,
              version: Number(current.version),
            },
            after: {
              id: toEntityId(price.id),
              amount: input.amount,
              startsAt: input.startsAt,
              reason: input.reason?.trim() || null,
              endsAt: input.endsAt ?? null,
            },
            reason: input.reason?.trim(),
          },
          transaction,
        );
        return variant.productId;
      });
      return this.getById(productId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        throw new ConflictException(PRODUCT_ERROR.PRICE_OVERLAP);
      }
      throw error;
    }
  }

  async getPriceTimeline(variantId: string): Promise<ProductPriceTimelineDto> {
    const databaseVariantId = toDatabaseId(variantId);
    const exists = await this.prisma.productVariant.count({ where: { id: databaseVariantId } });
    if (!exists) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
    const rows = await this.prisma.productPrice.findMany({
      where: { productVariantId: databaseVariantId },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    });
    const now = new Date();
    const mapPrice = (row: (typeof rows)[number]): ProductPriceWindowDto => ({
      id: toEntityId(row.id),
      amount: row.amount.toFixed(2),
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      status: row.status,
      version: Number(row.version),
      createdAt: row.createdAt.toISOString(),
    });
    const current = rows.find(
      (row) => row.startsAt <= now && (!row.endsAt || row.endsAt > now),
    );
    return {
      productVariantId: variantId,
      current: current ? mapPrice(current) : null,
      upcoming: rows.filter((row) => row.startsAt > now).reverse().map(mapPrice),
      history: rows.filter((row) => Boolean(row.endsAt && row.endsAt <= now)).map(mapPrice),
    };
  }

  private ensurePriceIsNotRetroactive(startsAt: Date): void {
    const immediateRequestToleranceMs = 60_000;
    if (startsAt.getTime() < Date.now() - immediateRequestToleranceMs) {
      throw new UnprocessableEntityException('Price startsAt cannot be in the past');
    }
  }

  private ensureLargeReductionHasReason(
    referenceAmount: Prisma.Decimal | undefined,
    nextAmount: string,
    reason: string | undefined,
  ): void {
    if (!referenceAmount || referenceAmount.lte(0)) return;
    const next = new Prisma.Decimal(nextAmount);
    const reductionRatio = referenceAmount.minus(next).div(referenceAmount);
    if (reductionRatio.gt(new Prisma.Decimal('0.20')) && !reason?.trim()) {
      throw new UnprocessableEntityException({
        code: 'PRICE_REDUCTION_REASON_REQUIRED',
        message: 'A reason is required when reducing price by more than 20%',
      });
    }
  }

  async createBundle(
    productId: string,
    input: CreateBundleDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseProductId = toDatabaseId(productId);
    try {
      await this.prisma.$transaction(async (transaction) => {
        const componentIds = input.items.map(({ componentVariantId }) => componentVariantId);
        const databaseComponentIds = componentIds.map(toDatabaseId);
        if (new Set(componentIds).size !== componentIds.length) {
          throw new UnprocessableEntityException('Bundle components must be unique');
        }
        const candidateComponents = await transaction.productVariant.findMany({
          where: { id: { in: databaseComponentIds } },
          select: { productId: true },
        });
        await this.lockProductIds(transaction, [
          databaseProductId,
          ...candidateComponents.map(({ productId: componentProductId }) => componentProductId),
        ]);
        const product = await transaction.product.findUnique({ where: { id: databaseProductId } });
        if (!product) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
        if (product.productType !== PRODUCT_TYPE.BUNDLE) {
          throw new UnprocessableEntityException(
            'Bundle definition can only be created for a BUNDLE product',
          );
        }
        const bundleVariant = await transaction.productVariant.findFirst({
          where: {
            id: toDatabaseId(input.bundleVariantId),
            productId: databaseProductId,
            status: PRODUCT_VARIANT_STATUS.ACTIVE,
          },
        });
        if (!bundleVariant) {
          throw new UnprocessableEntityException(
            'Active bundle variant must belong to the BUNDLE product',
          );
        }
        const componentCount = await transaction.productVariant.count({
          where: {
            id: { in: databaseComponentIds },
            status: PRODUCT_VARIANT_STATUS.ACTIVE,
            product: { status: { not: PRODUCT_STATUS.ARCHIVED } },
          },
        });
        if (componentCount !== componentIds.length) throw new UnprocessableEntityException('Bundle contains invalid component');
        const bundle = await transaction.productBundle.create({
          data: {
            bundleVariantId: toDatabaseId(input.bundleVariantId),
            createdBy: toDatabaseId(context.actorUserId),
            updatedBy: toDatabaseId(context.actorUserId),
            items: {
              create: input.items.map((item, sortOrder) => ({
                componentVariantId: toDatabaseId(item.componentVariantId),
                quantity: item.quantity,
                sortOrder,
              })),
            },
          },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.BUNDLE_CREATE,
            entityType: 'PRODUCT_BUNDLE',
            entityId: toEntityId(bundle.id),
          },
          transaction,
        );
      });
      return this.getById(productId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        throw new UnprocessableEntityException('Nested bundles are not allowed');
      }
      this.rethrowConstraint(error, 'Bundle already exists');
    }
  }

  private async getById(
    id: string | bigint,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ProductDetailDto> {
    const row = await client.product.findFirst({
      where: { id: typeof id === 'bigint' ? id : toDatabaseId(id) },
      include: this.productInclude(new Date(), false),
    });
    if (!row) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
    // Thông số rỗng thì resolve trả [] ngay, không query thêm — các lệnh ghi dùng getById không chậm đi.
    return { ...this.toDetail(row, false), specifications: await this.attributes.resolve(row.specifications) };
  }

  /**
   * Ghi đè toàn bộ thông số kỹ thuật của sản phẩm.
   *
   * INVARIANT: JSONB chỉ nhận giá trị đã qua `AttributesService.validateSpecifications` (decision D61).
   * TRANSACTION: khoá sản phẩm và tăng version cùng lúc với ghi thông số để hai người sửa song song không
   * đè lên nhau im lặng (optimistic version như các lệnh sửa sản phẩm khác).
   */
  async replaceSpecifications(
    id: string,
    input: ReplaceProductSpecificationsDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseId = toDatabaseId(id);
    await this.prisma.$transaction(async (transaction) => {
      await this.lockProductIds(transaction, [databaseId]);
      const current = await transaction.product.findUnique({
        where: { id: databaseId },
        select: { id: true, version: true, status: true, specifications: true },
      });
      if (!current) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
      if (current.status === PRODUCT_STATUS.ARCHIVED) {
        throw new UnprocessableEntityException('Archived product cannot be edited');
      }
      if (Number(current.version) !== input.expectedVersion) throw new ConflictException(PRODUCT_ERROR.VERSION_CONFLICT);
      const before = this.attributes.readStored(current.specifications);
      const specifications = await this.attributes.validateSpecifications(transaction, input.specifications, before);
      await transaction.product.update({
        where: { id: databaseId },
        data: {
          specifications: specifications as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedBy: toOptionalDatabaseId(context.actorUserId),
        },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: ATTRIBUTE_AUDIT_ACTION.PRODUCT_SPECIFICATIONS_REPLACE,
          entityType: 'PRODUCT',
          entityId: id,
          before: before as unknown as Prisma.InputJsonValue,
          after: specifications as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
    });
    return this.getById(id);
  }

  private async changeProductStatus(
    id: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
    allowedFrom: ProductStatus[],
    targetStatus: typeof PRODUCT_STATUS.DRAFT | typeof PRODUCT_STATUS.ARCHIVED,
    action: string,
  ): Promise<ProductDetailDto> {
    const databaseId = toDatabaseId(id);
    return this.prisma.$transaction(async (transaction) => {
      await this.lockProductIds(transaction, [databaseId]);
      const product = await transaction.product.findUnique({ where: { id: databaseId } });
      if (!product) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
      if (!allowedFrom.includes(product.status as (typeof allowedFrom)[number])) {
        throw new UnprocessableEntityException(
          `Product cannot transition from ${product.status} to ${targetStatus}`,
        );
      }
      if (targetStatus === PRODUCT_STATUS.ARCHIVED) {
        const activePublishedBundleUsage = await transaction.bundleItem.count({
          where: {
            componentVariant: { productId: databaseId },
            productBundle: {
              status: PRODUCT_BUNDLE_STATUS.ACTIVE,
              bundleVariant: { product: { status: PRODUCT_STATUS.PUBLISHED } },
            },
          },
        });
        if (activePublishedBundleUsage > 0) {
          throw new UnprocessableEntityException(
            'Product supplies an active published combo; archive the combo first',
          );
        }
      }
      const updated = await transaction.product.updateMany({
        where: {
          id: databaseId,
          version: BigInt(input.expectedVersion),
          status: { in: allowedFrom },
        },
        data: {
          status: targetStatus,
          // Về DRAFT hay ARCHIVED thì đều phải tắt hiển thị, nếu không cờ còn bật sẽ mô tả sai
          // trạng thái thật của sản phẩm trên màn quản trị.
          isPublished: false,
          ...(targetStatus === PRODUCT_STATUS.DRAFT ? { publishedAt: null } : {}),
          version: { increment: 1 },
          updatedBy: toOptionalDatabaseId(context.actorUserId),
        },
      });
      if (updated.count !== 1) throw new ConflictException(PRODUCT_ERROR.VERSION_CONFLICT);
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action,
          entityType: 'PRODUCT',
          entityId: id,
          before: { status: product.status, version: input.expectedVersion },
          after: { status: targetStatus, version: input.expectedVersion + 1 },
        },
        transaction,
      );
      return this.getById(databaseId, transaction);
    });
  }

  private sellableProductWhere(now: Date): Prisma.ProductWhereInput {
    const pricedActiveVariant = {
      status: PRODUCT_VARIANT_STATUS.ACTIVE,
      prices: { some: effectivePriceWhere(now) },
    } satisfies Prisma.ProductVariantWhereInput;
    return {
      OR: [
        {
          productType: PRODUCT_TYPE.STANDARD,
          variants: {
            some: { ...pricedActiveVariant, bundleDefinition: { is: null } },
          },
        },
        {
          productType: PRODUCT_TYPE.BUNDLE,
          variants: {
            some: {
              ...pricedActiveVariant,
              bundleDefinition: {
                is: {
                  status: PRODUCT_BUNDLE_STATUS.ACTIVE,
                  items: {
                    some: {},
                    every: {
                      componentVariant: {
                        status: PRODUCT_VARIANT_STATUS.ACTIVE,
                        product: { status: { not: PRODUCT_STATUS.ARCHIVED } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    };
  }

  private productInclude(now: Date, storefront: boolean) {
    return {
      brand: true,
      categories: {
        ...(storefront
          ? { where: { category: { status: CATALOG_REFERENCE_STATUS.ACTIVE } } }
          : {}),
        include: { category: true },
        orderBy: { sortOrder: 'asc' as const },
      },
      media: {
        where: { status: PRODUCT_VARIANT_STATUS.ACTIVE },
        include: { mediaAsset: true },
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
      },
      variants: {
        ...(storefront
          ? {
              where: {
                status: PRODUCT_VARIANT_STATUS.ACTIVE,
                prices: { some: effectivePriceWhere(now) },
              },
            }
          : {}),
        include: {
          prices: { where: effectivePriceWhere(now), orderBy: { startsAt: 'desc' as const }, take: 1 },
          bundleDefinition: {
            include: {
              items: {
                include: { componentVariant: { include: { product: true } } },
                orderBy: { sortOrder: 'asc' as const },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    } satisfies Prisma.ProductInclude;
  }

  private toSummary(
    row: Awaited<ReturnType<ProductsService['findProductForMapping']>>,
    storefront: boolean,
  ): ProductSummaryDto {
    const variants = storefront
      ? row.variants.filter((variant) =>
          this.isLoadedVariantSellable(row.productType as ProductType, variant),
        )
      : row.variants;
    // Quick-add phải dùng Sellable SKU thật. Offer rẻ nhất đồng thời sở hữu
    // minPrice và defaultVariantId để FE không tự chế ID từ product.id.
    const defaultOffer = variants
      .flatMap((variant) =>
        variant.prices.map(({ amount }) => ({ variant, amount })),
      )
      .sort((left, right) =>
        left.amount.comparedTo(right.amount) || left.variant.id.toString().localeCompare(right.variant.id.toString()),
      )[0];
    const primaryCategory = row.categories.find(({ isPrimary }) => isPrimary)?.category.name;
    const imageUrl = (row.media.find(({ isPrimary }) => isPrimary) ?? row.media[0])
      ?.mediaAsset.secureUrl;
    return {
      id: toEntityId(row.id),
      defaultVariantId: defaultOffer ? toEntityId(defaultOffer.variant.id) : null,
      defaultVariantSku: defaultOffer?.variant.sku ?? null,
      productNo: row.productNo,
      name: row.name,
      slug: row.slug,
      productType: row.productType as ProductType,
      ...(row.brand ? { brand: row.brand.name } : {}),
      ...(primaryCategory ? { primaryCategory } : {}),
      status: row.status as ProductSummaryDto['status'],
      isPublished: row.isPublished,
      version: Number(row.version),
      minPrice: defaultOffer?.amount.toFixed(2) ?? null,
      currency: PRODUCT_CURRENCY.VND,
      imageUrl: imageUrl ?? null,
    };
  }

  private toDetail(
    row: Awaited<ReturnType<ProductsService['findProductForMapping']>>,
    storefront: boolean,
  ): Omit<ProductDetailDto, 'specifications'> {
    const variants = storefront
      ? row.variants.filter((variant) =>
          this.isLoadedVariantSellable(row.productType as ProductType, variant),
        )
      : row.variants;
    return {
      ...this.toSummary(row, storefront),
      brandId: toOptionalEntityId(row.brandId),
      primaryCategoryId:
        toOptionalEntityId(row.categories.find(({ isPrimary }) => isPrimary)?.categoryId),
      ...(row.shortDescription ? { shortDescription: row.shortDescription } : {}),
      ...(row.description ? { description: row.description } : {}),
      categoryIds: row.categories.map(({ categoryId }) => toEntityId(categoryId)),
      categories: row.categories.map(({ categoryId, category, isPrimary }) => ({
        id: toEntityId(categoryId),
        name: category.name,
        isPrimary,
      })),
      variants: variants.map((variant) => ({
        id: toEntityId(variant.id),
        sku: variant.sku,
        ...(variant.barcode ? { barcode: variant.barcode } : {}),
        name: variant.name,
        weightGrams: variant.weightGrams,
        lengthMm: variant.lengthMm,
        widthMm: variant.widthMm,
        heightMm: variant.heightMm,
        status: variant.status as ProductDetailDto['variants'][number]['status'],
        version: Number(variant.version),
        effectivePrice: variant.prices[0]?.amount.toFixed(2) ?? null,
        effectivePriceId: toOptionalEntityId(variant.prices[0]?.id),
        effectivePriceVersion:
          variant.prices[0] === undefined ? null : Number(variant.prices[0].version),
        bundle: variant.bundleDefinition
          ? {
              bundleType: PRODUCT_BUNDLE_TYPE.FIXED_VIRTUAL,
              status: variant.bundleDefinition.status as 'ACTIVE' | 'INACTIVE',
              components: variant.bundleDefinition.items.map((item) => ({
                componentVariantId: toEntityId(item.componentVariantId),
                componentSku: item.componentVariant.sku,
                componentName: item.componentVariant.name,
                quantity: item.quantity,
              })),
            }
          : null,
      })),
      media: row.media.map((item) => ({
        id: toEntityId(item.id),
        mediaAssetId: toEntityId(item.mediaAssetId),
        variantId: toOptionalEntityId(item.variantId),
        secureUrl: item.mediaAsset.secureUrl,
        thumbnailUrl: item.mediaAsset.thumbnailUrl,
        altText: item.altText,
        sortOrder: item.sortOrder,
        isPrimary: item.isPrimary,
        status: item.status as ProductDetailDto['media'][number]['status'],
      })),
    };
  }

  private findProductForMapping() {
    return this.prisma.product.findFirstOrThrow({
      include: this.productInclude(new Date(), false),
    });
  }

  private isLoadedVariantSellable(productType: ProductType, variant: SellabilityVariant): boolean {
    if (
      variant.status !== PRODUCT_VARIANT_STATUS.ACTIVE ||
      variant.prices.length === 0
    ) {
      return false;
    }
    if (productType === PRODUCT_TYPE.STANDARD) return variant.bundleDefinition === null;
    const bundle = variant.bundleDefinition;
    return Boolean(
      bundle &&
        bundle.status === PRODUCT_BUNDLE_STATUS.ACTIVE &&
        bundle.items.length > 0 &&
        bundle.items.every(
          ({ componentVariant }) =>
            componentVariant.status === PRODUCT_VARIANT_STATUS.ACTIVE &&
            componentVariant.product.status !== PRODUCT_STATUS.ARCHIVED,
        ),
    );
  }

  /** Ảnh chính và tồn khả dụng của sản phẩm cho policy publish (đọc trong transaction của nơi gọi). */
  private async publishSnapshot(
    client: Prisma.TransactionClient | PrismaService,
    productId: bigint,
    status: string,
    productType: ProductType,
    activeVariants: ProductPublishSnapshot['activeVariants'],
  ): Promise<ProductPublishSnapshot> {
    const [primaryImages, stock] = await Promise.all([
      client.productMedia.count({
        where: { productId, status: PRODUCT_MEDIA_STATUS.ACTIVE, isPrimary: true },
      }),
      // Đọc tổng hợp tồn (chỉ đọc) để cảnh báo; Catalog không ghi bảng của Inventory.
      client.inventoryBalance.aggregate({
        where: { productVariant: { productId, status: PRODUCT_VARIANT_STATUS.ACTIVE } },
        _sum: { onHand: true, reserved: true },
      }),
    ]);
    return {
      status,
      productType,
      activeVariants,
      hasPrimaryImage: primaryImages > 0,
      availableStock: (stock._sum.onHand ?? 0) - (stock._sum.reserved ?? 0),
    };
  }

  /**
   * Checklist trước khi xuất bản cho Admin: điều gì còn chặn và điều gì chỉ là cảnh báo.
   * Dùng cùng `evaluatePublishReadiness` với `publish`.
   */
  async setupStatus(id: string): Promise<ProductSetupStatusDto> {
    const now = new Date();
    const product = await this.prisma.product.findFirst({
      where: { id: toDatabaseId(id) },
      include: {
        variants: {
          where: { status: PRODUCT_VARIANT_STATUS.ACTIVE },
          include: {
            prices: { where: effectivePriceWhere(now) },
            bundleDefinition: { include: { items: { include: { componentVariant: { include: { product: true } } } } } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
    const readiness = evaluatePublishReadiness(
      await this.publishSnapshot(this.prisma, product.id, product.status, product.productType as ProductType, product.variants),
    );
    return {
      productId: toEntityId(product.id),
      status: product.status as ProductStatus,
      ...readiness,
    };
  }

  private async lockProductIds(
    transaction: Prisma.TransactionClient,
    productIds: bigint[],
  ): Promise<void> {
    const orderedIds = [...new Set(productIds)].sort();
    if (orderedIds.length === 0) return;
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "products" WHERE "id" IN (${Prisma.join(
        orderedIds.map((id) => Prisma.sql`${id}`),
      )}) ORDER BY "id" FOR UPDATE`,
    );
  }

  private validateCategorySelection(categoryIds: string[], primaryCategoryId: string): void {
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new UnprocessableEntityException('Categories must be unique');
    }
    if (!categoryIds.includes(primaryCategoryId)) {
      throw new UnprocessableEntityException('Primary category must be included in categoryIds');
    }
  }

  private async validateReferences(
    transaction: Prisma.TransactionClient,
    brandId?: string | null,
    categoryIds?: string[],
  ): Promise<void> {
    if (brandId) {
      const brand = await transaction.brand.count({
        where: { id: toDatabaseId(brandId), status: CATALOG_REFERENCE_STATUS.ACTIVE },
      });
      if (!brand) throw new UnprocessableEntityException('Brand is not active');
    }
    if (categoryIds) {
      const count = await transaction.category.count({
        where: {
          id: { in: categoryIds.map(toDatabaseId) },
          status: CATALOG_REFERENCE_STATUS.ACTIVE,
        },
      });
      if (count !== categoryIds.length) throw new UnprocessableEntityException('Category is not active');
    }
  }

  private rethrowConstraint(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
