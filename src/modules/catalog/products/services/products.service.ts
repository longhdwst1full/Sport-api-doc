import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { MutationContext } from '../../../../common/request/request-context';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditWriter } from '../../../audit/audit.writer';
import {
  ChangeProductStatusDto,
  CreateBundleDto,
  CreatePriceDto,
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListResponseDto,
  ProductSummaryDto,
  UpdateProductDto,
} from '../dto/product.dto';

const effectivePriceWhere = (now: Date): Prisma.ProductPriceWhereInput => ({
  status: { in: ['ACTIVE', 'SCHEDULED'] },
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async list(query: ListProductsQueryDto, storefront: boolean): Promise<ProductListResponseDto> {
    const now = new Date();
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(storefront ? { status: 'PUBLISHED' } : query.status ? { status: query.status } : {}),
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
        ? { categories: { some: { category: { slug: query.category } } } }
        : {}),
      ...(storefront
        ? {
            variants: {
              some: {
                status: 'ACTIVE',
                prices: { some: effectivePriceWhere(now) },
              },
            },
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: this.productInclude(now),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toSummary(row)),
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
              status: 'PUBLISHED',
              variants: {
                some: {
                  status: 'ACTIVE',
                  prices: { some: effectivePriceWhere(now) },
                },
              },
            }
          : {}),
      },
      include: this.productInclude(now),
    });
    if (!row) throw new NotFoundException('Product not found');
    return this.toDetail(row);
  }

  async create(input: CreateProductDto, context: MutationContext): Promise<ProductDetailDto> {
    this.validateCategorySelection(input.categoryIds, input.primaryCategoryId);
    try {
      const productId = uuidv7();
      await this.prisma.$transaction(async (transaction) => {
        await this.validateReferences(transaction, input.brandId, input.categoryIds);
        await transaction.product.create({
          data: {
            id: productId,
            productNo: input.productNo,
            name: input.name,
            slug: input.slug,
            brandId: input.brandId,
            shortDescription: input.shortDescription,
            description: input.description,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });
        await transaction.productCategory.createMany({
          data: input.categoryIds.map((categoryId, sortOrder) => ({
            productId,
            categoryId,
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
            action: 'catalog.product.create',
            entityType: 'PRODUCT',
            entityId: productId,
            after: input as unknown as Prisma.InputJsonValue,
          },
          transaction,
        );
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
    const { expectedVersion, categoryIds, primaryCategoryId, ...fields } = input;
    if ((categoryIds && !primaryCategoryId) || (!categoryIds && primaryCategoryId)) {
      throw new UnprocessableEntityException('categoryIds and primaryCategoryId must be sent together');
    }
    if (categoryIds && primaryCategoryId) this.validateCategorySelection(categoryIds, primaryCategoryId);
    try {
      await this.prisma.$transaction(async (transaction) => {
        await this.validateReferences(transaction, fields.brandId, categoryIds);
        const updated = await transaction.product.updateMany({
          where: { id, version: BigInt(expectedVersion), status: { not: 'ARCHIVED' } },
          data: {
            ...fields,
            version: { increment: 1 },
            updatedBy: context.actorUserId,
          },
        });
        if (updated.count !== 1) throw new ConflictException('Product version conflict or product is archived');
        if (categoryIds && primaryCategoryId) {
          await transaction.productCategory.deleteMany({ where: { productId: id } });
          await transaction.productCategory.createMany({
            data: categoryIds.map((categoryId, sortOrder) => ({
              productId: id,
              categoryId,
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
            action: 'catalog.product.update',
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
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const product = await transaction.product.findFirst({
        where: { id },
        include: {
          variants: {
            where: { status: 'ACTIVE' },
            include: { prices: { where: effectivePriceWhere(now) } },
          },
        },
      });
      if (!product) throw new NotFoundException('Product not found');
      if (product.status !== 'DRAFT') throw new UnprocessableEntityException('Only DRAFT product can be published');
      if (!product.variants.some(({ prices }) => prices.length > 0)) {
        throw new UnprocessableEntityException('Published product requires an active variant and effective price');
      }
      const updated = await transaction.product.updateMany({
        where: { id, version: BigInt(input.expectedVersion), status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: now, version: { increment: 1 }, updatedBy: context.actorUserId },
      });
      if (updated.count !== 1) throw new ConflictException('Product version conflict');
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'catalog.product.publish',
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
      ['DRAFT', 'PUBLISHED'],
      'ARCHIVED',
      'catalog.product.archive',
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
      ['ARCHIVED'],
      'DRAFT',
      'catalog.product.reactivate',
    );
  }

  async archiveVariant(
    variantId: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    return this.prisma.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.findUnique({
        where: { id: variantId },
      });
      if (!variant) throw new NotFoundException('Variant not found');
      if (variant.status !== 'ACTIVE') {
        throw new UnprocessableEntityException('Only ACTIVE variant can be archived');
      }
      const activePublishedBundleUsage = await transaction.bundleItem.count({
        where: {
          componentVariantId: variantId,
          productBundle: {
            status: 'ACTIVE',
            bundleVariant: { product: { status: 'PUBLISHED' } },
          },
        },
      });
      if (activePublishedBundleUsage > 0) {
        throw new UnprocessableEntityException(
          'Variant is used by an active published combo; archive the combo first',
        );
      }
      const updated = await transaction.productVariant.updateMany({
        where: { id: variantId, version: BigInt(input.expectedVersion), status: 'ACTIVE' },
        data: { status: 'INACTIVE', version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('Variant version conflict');
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'catalog.variant.archive',
          entityType: 'PRODUCT_VARIANT',
          entityId: variantId,
          before: { status: 'ACTIVE', version: input.expectedVersion },
          after: { status: 'INACTIVE', version: input.expectedVersion + 1 },
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
    return this.prisma.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.findUnique({
        where: { id: variantId },
        include: { product: true },
      });
      if (!variant) throw new NotFoundException('Variant not found');
      if (variant.status !== 'INACTIVE') {
        throw new UnprocessableEntityException('Only INACTIVE variant can be reactivated');
      }
      if (variant.product.status === 'ARCHIVED') {
        throw new UnprocessableEntityException('Reactivate the product before its variant');
      }
      const updated = await transaction.productVariant.updateMany({
        where: { id: variantId, version: BigInt(input.expectedVersion), status: 'INACTIVE' },
        data: { status: 'ACTIVE', version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException('Variant version conflict');
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'catalog.variant.reactivate',
          entityType: 'PRODUCT_VARIANT',
          entityId: variantId,
          before: { status: 'INACTIVE', version: input.expectedVersion },
          after: { status: 'ACTIVE', version: input.expectedVersion + 1 },
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
    try {
      await this.prisma.$transaction(async (transaction) => {
        const product = await transaction.product.findFirst({ where: { id: productId, status: { not: 'ARCHIVED' } } });
        if (!product) throw new NotFoundException('Product not found');
        const variantId = uuidv7();
        await transaction.productVariant.create({ data: { id: variantId, productId, ...input } });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.variant.create',
            entityType: 'PRODUCT_VARIANT',
            entityId: variantId,
          },
          transaction,
        );
      });
      return this.getById(productId);
    } catch (error) {
      this.rethrowConstraint(error, 'SKU or barcode already exists');
    }
  }

  async createPrice(
    variantId: string,
    input: CreatePriceDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : undefined;
    if (endsAt && endsAt <= startsAt) throw new UnprocessableEntityException('endsAt must be after startsAt');
    try {
      const productId = await this.prisma.$transaction(async (transaction) => {
        const variant = await transaction.productVariant.findFirst({ where: { id: variantId } });
        if (!variant) throw new NotFoundException('Variant not found');
        const priceId = uuidv7();
        await transaction.productPrice.create({
          data: {
            id: priceId,
            productVariantId: variantId,
            amount: new Prisma.Decimal(input.amount),
            startsAt,
            endsAt,
            status: startsAt <= new Date() ? 'ACTIVE' : 'SCHEDULED',
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
          },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.price.create',
            entityType: 'PRODUCT_PRICE',
            entityId: priceId,
            after: { ...input, amount: input.amount },
          },
          transaction,
        );
        return variant.productId;
      });
      return this.getById(productId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        throw new ConflictException('Price effective window overlaps an existing price');
      }
      throw error;
    }
  }

  async createBundle(
    productId: string,
    input: CreateBundleDto,
    context: MutationContext,
  ): Promise<ProductDetailDto> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        const bundleVariant = await transaction.productVariant.findFirst({
          where: { id: input.bundleVariantId, productId },
        });
        if (!bundleVariant) throw new UnprocessableEntityException('Bundle variant must belong to product');
        const componentIds = input.items.map(({ componentVariantId }) => componentVariantId);
        if (new Set(componentIds).size !== componentIds.length) {
          throw new UnprocessableEntityException('Bundle components must be unique');
        }
        const componentCount = await transaction.productVariant.count({
          where: { id: { in: componentIds }, status: 'ACTIVE' },
        });
        if (componentCount !== componentIds.length) throw new UnprocessableEntityException('Bundle contains invalid component');
        const bundleId = uuidv7();
        await transaction.productBundle.create({
          data: {
            id: bundleId,
            bundleVariantId: input.bundleVariantId,
            createdBy: context.actorUserId,
            updatedBy: context.actorUserId,
            items: {
              create: input.items.map((item, sortOrder) => ({ id: uuidv7(), ...item, sortOrder })),
            },
          },
        });
        await this.audit.write(
          {
            requestId: context.requestId,
            sequenceNo: 1,
            actorType: 'USER',
            actorUserId: context.actorUserId,
            action: 'catalog.bundle.create',
            entityType: 'PRODUCT_BUNDLE',
            entityId: bundleId,
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
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ProductDetailDto> {
    const row = await client.product.findFirst({
      where: { id },
      include: this.productInclude(new Date()),
    });
    if (!row) throw new NotFoundException('Product not found');
    return this.toDetail(row);
  }

  private async changeProductStatus(
    id: string,
    input: ChangeProductStatusDto,
    context: MutationContext,
    allowedFrom: Array<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>,
    targetStatus: 'DRAFT' | 'ARCHIVED',
    action: string,
  ): Promise<ProductDetailDto> {
    return this.prisma.$transaction(async (transaction) => {
      const product = await transaction.product.findUnique({ where: { id } });
      if (!product) throw new NotFoundException('Product not found');
      if (!allowedFrom.includes(product.status as (typeof allowedFrom)[number])) {
        throw new UnprocessableEntityException(
          `Product cannot transition from ${product.status} to ${targetStatus}`,
        );
      }
      const updated = await transaction.product.updateMany({
        where: {
          id,
          version: BigInt(input.expectedVersion),
          status: { in: allowedFrom },
        },
        data: {
          status: targetStatus,
          ...(targetStatus === 'DRAFT' ? { publishedAt: null } : {}),
          version: { increment: 1 },
          updatedBy: context.actorUserId,
        },
      });
      if (updated.count !== 1) throw new ConflictException('Product version conflict');
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
      return this.getById(id, transaction);
    });
  }

  private productInclude(now: Date) {
    return {
      brand: true,
      categories: { include: { category: true }, orderBy: { sortOrder: 'asc' as const } },
      media: {
        where: { status: 'ACTIVE' },
        include: { mediaAsset: true },
        orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
      },
      variants: {
        include: {
          prices: { where: effectivePriceWhere(now), orderBy: { startsAt: 'desc' as const }, take: 1 },
          bundleDefinition: {
            include: { items: { include: { componentVariant: true }, orderBy: { sortOrder: 'asc' as const } } },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    } satisfies Prisma.ProductInclude;
  }

  private toSummary(row: Awaited<ReturnType<ProductsService['findProductForMapping']>>): ProductSummaryDto {
    const prices = row.variants.flatMap(({ prices: variantPrices }) => variantPrices.map(({ amount }) => amount));
    const minPrice = prices.sort((left, right) => left.comparedTo(right))[0];
    const primaryCategory = row.categories.find(({ isPrimary }) => isPrimary)?.category.name;
    const imageUrl = row.media[0]?.mediaAsset.secureUrl;
    return {
      id: row.id,
      productNo: row.productNo,
      name: row.name,
      slug: row.slug,
      ...(row.brand ? { brand: row.brand.name } : {}),
      ...(primaryCategory ? { primaryCategory } : {}),
      status: row.status as ProductSummaryDto['status'],
      version: Number(row.version),
      minPrice: minPrice?.toFixed(2) ?? null,
      currency: 'VND',
      imageUrl: imageUrl ?? null,
    };
  }

  private toDetail(row: Awaited<ReturnType<ProductsService['findProductForMapping']>>): ProductDetailDto {
    const bundle = row.variants.find(({ bundleDefinition }) => bundleDefinition)?.bundleDefinition;
    return {
      ...this.toSummary(row),
      ...(row.shortDescription ? { shortDescription: row.shortDescription } : {}),
      ...(row.description ? { description: row.description } : {}),
      categoryIds: row.categories.map(({ categoryId }) => categoryId),
      variants: row.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        ...(variant.barcode ? { barcode: variant.barcode } : {}),
        name: variant.name,
        status: variant.status as 'ACTIVE' | 'INACTIVE',
        version: Number(variant.version),
        effectivePrice: variant.prices[0]?.amount.toFixed(2) ?? null,
      })),
      ...(bundle
        ? {
            bundle: {
              bundleType: 'FIXED_VIRTUAL',
              components: bundle.items.map((item) => ({
                componentVariantId: item.componentVariantId,
                componentSku: item.componentVariant.sku,
                componentName: item.componentVariant.name,
                quantity: item.quantity,
              })),
            },
          }
        : {}),
    };
  }

  private findProductForMapping() {
    return this.prisma.product.findFirstOrThrow({ include: this.productInclude(new Date()) });
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
    brandId?: string,
    categoryIds?: string[],
  ): Promise<void> {
    if (brandId) {
      const brand = await transaction.brand.count({ where: { id: brandId, status: 'ACTIVE' } });
      if (!brand) throw new UnprocessableEntityException('Brand is not active');
    }
    if (categoryIds) {
      const count = await transaction.category.count({
        where: { id: { in: categoryIds }, status: 'ACTIVE' },
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
