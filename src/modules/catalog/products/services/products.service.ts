import {
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
import { AuditWriter } from '../../../audit/audit.writer';
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
} from '../dto/product.dto';
import {
  PRODUCT_AUDIT_ACTION,
  PRODUCT_BUNDLE_STATUS,
  PRODUCT_BUNDLE_TYPE,
  PRODUCT_CURRENCY,
  PRODUCT_ERROR,
  PRODUCT_PRICE_STATUS,
  PRODUCT_PRICE_TYPE,
  PRODUCT_SALES_CHANNEL,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_VARIANT_STATUS,
  ProductStatus,
  ProductType,
} from '../product.constants';

const effectivePriceWhere = (now: Date): Prisma.ProductPriceWhereInput => ({
  status: { in: [PRODUCT_PRICE_STATUS.ACTIVE, PRODUCT_PRICE_STATUS.SCHEDULED] },
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
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
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({
        where,
        orderBy: [{ sku: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
        select: { id: true, sku: true, name: true },
      }),
      this.prisma.productVariant.count({ where }),
    ]);
    return {
      items: rows.map(({ id, sku, name }) => ({ id: toEntityId(id), code: sku, label: name })),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        hasMore: skip + query.limit < total,
      },
    };
  }

  async list(query: ListProductsQueryDto, storefront: boolean): Promise<ProductListResponseDto> {
    const now = new Date();
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(storefront
        ? { status: PRODUCT_STATUS.PUBLISHED, ...this.sellableProductWhere(now) }
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
      ...(query.category
        ? {
            categories: {
              some: {
                category: {
                  slug: query.category,
                  ...(storefront ? { status: PRODUCT_VARIANT_STATUS.ACTIVE } : {}),
                },
              },
            },
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: this.productInclude(now, storefront),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toSummary(row, storefront)),
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
      where: {
        slug,
        ...(storefront
          ? {
              status: PRODUCT_STATUS.PUBLISHED,
              ...this.sellableProductWhere(now),
            }
          : {}),
      },
      include: this.productInclude(now, storefront),
    });
    if (!row) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
    return this.toDetail(row, storefront);
  }

  async create(input: CreateProductDto, context: MutationContext): Promise<ProductDetailDto> {
    this.validateCategorySelection(input.categoryIds, input.primaryCategoryId);
    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        await this.validateReferences(transaction, input.brandId, input.categoryIds);
        const product = await transaction.product.create({
          data: {
            productType: input.productType ?? PRODUCT_TYPE.STANDARD,
            productNo: input.productNo,
            name: input.name,
            slug: input.slug,
            brandId: toOptionalDatabaseId(input.brandId),
            shortDescription: input.shortDescription,
            description: input.description,
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
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: PRODUCT_AUDIT_ACTION.CREATE,
            entityType: 'PRODUCT',
            entityId: toEntityId(product.id),
            after: input as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
        return product.id;
      });
      return this.getById(productId);
    } catch (error) {
      this.rethrowConstraint(error, 'Product number or slug already exists');
    }
  }

  async update(
    id: string,
    input: UpdateProductDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const databaseId = toDatabaseId(id);
    const { expectedVersion, categoryIds, primaryCategoryId, brandId, ...fields } = input;
    if ((categoryIds && !primaryCategoryId) || (!categoryIds && primaryCategoryId)) {
      throw new UnprocessableEntityException('categoryIds and primaryCategoryId must be sent together');
    }
    if (categoryIds && primaryCategoryId) this.validateCategorySelection(categoryIds, primaryCategoryId);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.lockProductIds(transaction, [databaseId]);
        const current = await transaction.product.findUnique({
          where: { id: databaseId },
          select: { productType: true, _count: { select: { variants: true } } },
        });
        if (!current) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
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
        const updated = await transaction.product.updateMany({
          where: {
            id: databaseId,
            version: BigInt(expectedVersion),
            status: { not: PRODUCT_STATUS.ARCHIVED },
          },
          data: {
            ...fields,
            ...(brandId !== undefined ? { brandId: toOptionalDatabaseId(brandId) } : {}),
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
            after: input as unknown as Prisma.InputJsonValue,
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
      this.assertPublishable(product.productType as ProductType, product.variants);
      const updated = await transaction.product.updateMany({
        where: {
          id: databaseId,
          version: BigInt(input.expectedVersion),
          status: PRODUCT_STATUS.DRAFT,
        },
        data: {
          status: PRODUCT_STATUS.PUBLISHED,
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
        const variant = await transaction.productVariant.create({
          data: { productId: databaseProductId, ...input },
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
    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        const variant = await transaction.productVariant.findFirst({ where: { id: databaseVariantId } });
        if (!variant) throw new NotFoundException(PRODUCT_ERROR.VARIANT_NOT_FOUND);
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
            after: { ...input, amount: input.amount },
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
    return this.toDetail(row, false);
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
    const prices = variants.flatMap(({ prices: variantPrices }) =>
      variantPrices.map(({ amount }) => amount),
    );
    const minPrice = prices.sort((left, right) => left.comparedTo(right))[0];
    const primaryCategory = row.categories.find(({ isPrimary }) => isPrimary)?.category.name;
    const imageUrl = (row.media.find(({ isPrimary }) => isPrimary) ?? row.media[0])
      ?.mediaAsset.secureUrl;
    return {
      id: toEntityId(row.id),
      productNo: row.productNo,
      name: row.name,
      slug: row.slug,
      productType: row.productType as ProductType,
      ...(row.brand ? { brand: row.brand.name } : {}),
      ...(primaryCategory ? { primaryCategory } : {}),
      status: row.status as ProductSummaryDto['status'],
      version: Number(row.version),
      minPrice: minPrice?.toFixed(2) ?? null,
      currency: PRODUCT_CURRENCY.VND,
      imageUrl: imageUrl ?? null,
    };
  }

  private toDetail(
    row: Awaited<ReturnType<ProductsService['findProductForMapping']>>,
    storefront: boolean,
  ): ProductDetailDto {
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

  private isLoadedVariantSellable(
    productType: ProductType,
    variant: Awaited<ReturnType<ProductsService['findProductForMapping']>>['variants'][number],
  ): boolean {
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

  private assertPublishable(
    productType: ProductType,
    variants: Array<{
      prices: unknown[];
      bundleDefinition: null | {
        status: string;
        items: Array<{
          componentVariant: { status: string; product: { status: string } };
        }>;
      };
    }>,
  ): void {
    if (variants.length === 0 || !variants.some(({ prices }) => prices.length > 0)) {
      throw new UnprocessableEntityException(
        'Published product requires an active variant and effective price',
      );
    }
    if (productType === PRODUCT_TYPE.STANDARD) {
      if (variants.some(({ bundleDefinition }) => bundleDefinition !== null)) {
        throw new UnprocessableEntityException(
          'STANDARD product cannot contain a bundle variant',
        );
      }
      return;
    }
    if (
      variants.some(
        ({ prices, bundleDefinition }) =>
          prices.length === 0 ||
          !bundleDefinition ||
          bundleDefinition.status !== PRODUCT_BUNDLE_STATUS.ACTIVE ||
          bundleDefinition.items.length === 0 ||
          bundleDefinition.items.some(
            ({ componentVariant }) =>
              componentVariant.status !== PRODUCT_VARIANT_STATUS.ACTIVE ||
              componentVariant.product.status === PRODUCT_STATUS.ARCHIVED,
          ),
      )
    ) {
      throw new UnprocessableEntityException(
        'Every active BUNDLE variant requires an active non-empty definition, effective price and active components',
      );
    }
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
