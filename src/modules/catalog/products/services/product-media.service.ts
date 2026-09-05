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
  toOptionalEntityId,
} from '../../../../common/identifiers/entity-id';
import { MutationContext } from '../../../../common/request/request-context';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditWriter } from '../../../audit/audit.writer';
import {
  AttachProductMediaDto,
  ProductMediaDto,
  ReorderProductMediaDto,
  UpdateProductMediaDto,
} from '../dto/product.dto';
import {
  PRODUCT_AUDIT_ACTION,
  PRODUCT_ERROR,
  PRODUCT_MEDIA_STATUS,
  PRODUCT_STATUS,
} from '../product.constants';

@Injectable()
export class ProductMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  attach(
    productId: string,
    input: AttachProductMediaDto,
    context: MutationContext,
  ): Promise<ProductMediaDto[]> {
    const databaseProductId = toDatabaseId(productId);
    const databaseVariantId = input.variantId ? toDatabaseId(input.variantId) : undefined;
    const databaseMediaAssetId = toDatabaseId(input.mediaAssetId);
    return this.prisma.$transaction(async (transaction) => {
      await this.claimProductVersion(transaction, databaseProductId, input.expectedProductVersion);
      const [asset, variant, duplicate, targetMedia, maxSort] = await Promise.all([
        transaction.mediaAsset.findFirst({
          where: { id: databaseMediaAssetId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
        }),
        input.variantId
          ? transaction.productVariant.findFirst({
              where: { id: databaseVariantId, productId: databaseProductId },
            })
          : Promise.resolve(undefined),
        transaction.productMedia.findFirst({
          where: {
            productId: databaseProductId,
            variantId: databaseVariantId ?? null,
            mediaAssetId: databaseMediaAssetId,
            status: PRODUCT_MEDIA_STATUS.ACTIVE,
          },
        }),
        transaction.productMedia.count({
          where: {
            productId: databaseProductId,
            variantId: databaseVariantId ?? null,
            status: PRODUCT_MEDIA_STATUS.ACTIVE,
          },
        }),
        transaction.productMedia.aggregate({
          where: { productId: databaseProductId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
          _max: { sortOrder: true },
        }),
      ]);
      if (!asset) throw new UnprocessableEntityException('Media asset is not finalized or active');
      if (input.variantId && !variant) {
        throw new UnprocessableEntityException('Variant must belong to the product');
      }
      if (duplicate) throw new ConflictException('Media asset is already attached to this target');

      const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
      const isPrimary = input.isPrimary || targetMedia === 0;
      if (isPrimary) {
        await this.clearPrimary(transaction, databaseProductId, databaseVariantId);
      }
      const media = await transaction.productMedia.create({
        data: {
          productId: databaseProductId,
          variantId: databaseVariantId,
          mediaAssetId: databaseMediaAssetId,
          altText: input.altText?.trim() || null,
          sortOrder,
          isPrimary,
        },
      });
      await this.writeAudit(
        transaction,
        context,
        PRODUCT_AUDIT_ACTION.MEDIA_ATTACH,
        media.id,
        undefined,
        { mediaAssetId: input.mediaAssetId, variantId: input.variantId ?? null, sortOrder },
      );
      return this.listActive(transaction, databaseProductId);
    });
  }

  update(
    productId: string,
    mediaId: string,
    input: UpdateProductMediaDto,
    context: MutationContext,
  ): Promise<ProductMediaDto[]> {
    const databaseProductId = toDatabaseId(productId);
    const databaseMediaId = toDatabaseId(mediaId);
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.productMedia.findFirst({
        where: { id: databaseMediaId, productId: databaseProductId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
      });
      if (!current) throw new NotFoundException('Product media not found');
      await this.claimProductVersion(transaction, databaseProductId, input.expectedProductVersion);
      if (input.isPrimary === true) {
        await this.clearPrimary(transaction, databaseProductId, current.variantId ?? undefined);
      }
      if (input.isPrimary === false && current.isPrimary) {
        throw new UnprocessableEntityException(
          'Set another media item as primary instead of clearing the current primary',
        );
      }
      const updated = await transaction.productMedia.update({
        where: { id: databaseMediaId },
        data: {
          ...(input.altText !== undefined ? { altText: input.altText?.trim() || null } : {}),
          ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
        },
      });
      await this.writeAudit(
        transaction,
        context,
        PRODUCT_AUDIT_ACTION.MEDIA_UPDATE,
        databaseMediaId,
        { altText: current.altText, isPrimary: current.isPrimary },
        { altText: updated.altText, isPrimary: updated.isPrimary },
      );
      return this.listActive(transaction, databaseProductId);
    });
  }

  reorder(
    productId: string,
    input: ReorderProductMediaDto,
    context: MutationContext,
  ): Promise<ProductMediaDto[]> {
    const databaseProductId = toDatabaseId(productId);
    return this.prisma.$transaction(async (transaction) => {
      const ids = input.items.map(({ id }) => id);
      const databaseIds = ids.map(toDatabaseId);
      const sortOrders = input.items.map(({ sortOrder }) => sortOrder).sort((a, b) => a - b);
      if (new Set(ids).size !== ids.length) {
        throw new UnprocessableEntityException('Media reorder items must be unique');
      }
      if (sortOrders.some((sortOrder, index) => sortOrder !== index)) {
        throw new UnprocessableEntityException(
          'Media sortOrder must be a unique zero-based sequence',
        );
      }
      const activeCount = await transaction.productMedia.count({
        where: { productId: databaseProductId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
      });
      const matchedCount = await transaction.productMedia.count({
        where: {
          productId: databaseProductId,
          id: { in: databaseIds },
          status: PRODUCT_MEDIA_STATUS.ACTIVE,
        },
      });
      if (matchedCount !== ids.length || matchedCount !== activeCount) {
        throw new UnprocessableEntityException('Reorder must include every active product media item');
      }
      await this.claimProductVersion(transaction, databaseProductId, input.expectedProductVersion);
      await Promise.all(input.items.map(({ id, sortOrder }) =>
        transaction.productMedia.update({ where: { id: toDatabaseId(id) }, data: { sortOrder } }),
      ));
      await this.writeAudit(
        transaction,
        context,
        PRODUCT_AUDIT_ACTION.MEDIA_REORDER,
        databaseProductId,
        undefined,
        { items: input.items.map(({ id, sortOrder }) => ({ id, sortOrder })) },
      );
      return this.listActive(transaction, databaseProductId);
    });
  }

  archive(
    productId: string,
    mediaId: string,
    expectedProductVersion: number,
    context: MutationContext,
  ): Promise<ProductMediaDto[]> {
    const databaseProductId = toDatabaseId(productId);
    const databaseMediaId = toDatabaseId(mediaId);
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.productMedia.findFirst({
        where: { id: databaseMediaId, productId: databaseProductId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
      });
      if (!current) throw new NotFoundException('Product media not found');
      await this.claimProductVersion(transaction, databaseProductId, expectedProductVersion);
      await transaction.productMedia.update({
        where: { id: databaseMediaId },
        data: { status: PRODUCT_MEDIA_STATUS.INACTIVE, isPrimary: false },
      });
      if (current.isPrimary) {
        const replacement = await transaction.productMedia.findFirst({
          where: {
            productId: databaseProductId,
            variantId: current.variantId,
            status: PRODUCT_MEDIA_STATUS.ACTIVE,
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        if (replacement) {
          await transaction.productMedia.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
        }
      }
      await this.writeAudit(
        transaction,
        context,
        PRODUCT_AUDIT_ACTION.MEDIA_ARCHIVE,
        databaseMediaId,
        { status: current.status, isPrimary: current.isPrimary },
        { status: PRODUCT_MEDIA_STATUS.INACTIVE, isPrimary: false },
      );
      return this.listActive(transaction, databaseProductId);
    });
  }

  private async claimProductVersion(
    transaction: Prisma.TransactionClient,
    productId: bigint,
    expectedVersion: number,
  ): Promise<void> {
    const updated = await transaction.product.updateMany({
      where: {
        id: productId,
        version: BigInt(expectedVersion),
        status: { not: PRODUCT_STATUS.ARCHIVED },
      },
      data: { version: { increment: 1 } },
    });
    if (updated.count === 1) return;
    const product = await transaction.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException(PRODUCT_ERROR.NOT_FOUND);
    if (product.status === PRODUCT_STATUS.ARCHIVED) {
      throw new UnprocessableEntityException('Archived product media cannot be changed');
    }
    throw new ConflictException(PRODUCT_ERROR.VERSION_CONFLICT);
  }

  private clearPrimary(
    transaction: Prisma.TransactionClient,
    productId: bigint,
    variantId?: bigint,
  ): Promise<Prisma.BatchPayload> {
    return transaction.productMedia.updateMany({
      where: {
        productId,
        variantId: variantId ?? null,
        status: PRODUCT_MEDIA_STATUS.ACTIVE,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  }

  private async listActive(
    transaction: Prisma.TransactionClient,
    productId: bigint,
  ): Promise<ProductMediaDto[]> {
    const rows = await transaction.productMedia.findMany({
      where: { productId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
      include: { mediaAsset: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map((item) => ({
      id: toEntityId(item.id),
      mediaAssetId: toEntityId(item.mediaAssetId),
      variantId: toOptionalEntityId(item.variantId),
      secureUrl: item.mediaAsset.secureUrl,
      thumbnailUrl: item.mediaAsset.thumbnailUrl,
      altText: item.altText,
      sortOrder: item.sortOrder,
      isPrimary: item.isPrimary,
      status: item.status as ProductMediaDto['status'],
    }));
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    context: MutationContext,
    action: string,
    entityId: string | bigint,
    before?: Prisma.InputJsonValue,
    after?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.audit.write(
      {
        requestId: context.requestId,
        sequenceNo: 1,
        actorType: 'USER',
        actorUserId: context.actorUserId,
        action,
        entityType: 'PRODUCT_MEDIA',
        entityId: typeof entityId === 'bigint' ? toEntityId(entityId) : entityId,
        before,
        after,
      },
      transaction,
    );
  }
}
