import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
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
import { ObjectStorageClient } from '../../../../integrations/object-storage/object-storage.client';
import { AuditWriter } from '../../../audit/audit.writer';
import { MEDIA_ASSET_STATUS } from '../../../media/media.constants';
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
    private readonly objectStorage: ObjectStorageClient,
  ) {}

  /**
   * Gắn ảnh cấp sản phẩm ngay trong transaction tạo sản phẩm (createAdminProduct).
   *
   * TRANSACTION: chạy trong transaction của nơi gọi, nên asset không hợp lệ làm rollback cả sản phẩm,
   * SKU và giá — không còn sản phẩm dở dang thiếu ảnh. Khoá asset theo thứ tự id để hai lần tạo song
   * song dùng chung ảnh không deadlock. Không claim version: sản phẩm vừa tạo trong chính transaction.
   */
  async attachInitialMedia(
    transaction: Prisma.TransactionClient,
    productId: bigint,
    items: ReadonlyArray<{ mediaAssetId: string; altText?: string }>,
    context: MutationContext,
  ): Promise<void> {
    const assetIds = items.map(({ mediaAssetId }) => toDatabaseId(mediaAssetId));
    for (const id of [...assetIds].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
      await this.lockMediaAsset(transaction, id);
    }
    const activeCount = await transaction.mediaAsset.count({
      where: { id: { in: assetIds }, status: MEDIA_ASSET_STATUS.ACTIVE },
    });
    if (activeCount !== new Set(assetIds.map(String)).size) {
      throw new UnprocessableEntityException('Media asset is not finalized or active');
    }
    for (const [sortOrder, item] of items.entries()) {
      const media = await transaction.productMedia.create({
        data: {
          productId,
          mediaAssetId: assetIds[sortOrder],
          altText: item.altText?.trim() || null,
          sortOrder,
          isPrimary: sortOrder === 0,
        },
      });
      await this.writeAudit(transaction, context, PRODUCT_AUDIT_ACTION.MEDIA_ATTACH, media.id, undefined, {
        mediaAssetId: item.mediaAssetId,
        variantId: null,
        sortOrder,
      });
    }
  }

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
      await this.lockMediaAsset(transaction, databaseMediaAssetId);
      const [asset, variant, duplicate, targetMedia, maxSort] = await Promise.all([
        transaction.mediaAsset.findFirst({
          where: { id: databaseMediaAssetId, status: MEDIA_ASSET_STATUS.ACTIVE },
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

  /**
   * Xóa liên kết Product Media và asset Cloudinary khi asset không còn được aggregate khác dùng.
   * Provider call nằm ngoài DB transaction; trạng thái DELETE_PENDING chặn attach mới và cho phép
   * compensation khôi phục liên kết nếu Cloudinary trả lỗi.
   */
  async delete(
    productId: string,
    mediaId: string,
    expectedProductVersion: number,
    context: MutationContext,
  ): Promise<ProductMediaDto[]> {
    const databaseProductId = toDatabaseId(productId);
    const databaseMediaId = toDatabaseId(mediaId);
    const prepared = await this.prepareProviderDeletion(
      databaseProductId,
      databaseMediaId,
      expectedProductVersion,
      context,
    );

    try {
      // PROVIDER: invalidate=true nằm trong Cloudinary adapter để xóa cả bản CDN đã cache.
      await this.objectStorage.deleteImage(prepared.publicId);
    } catch (error) {
      await this.restoreFailedProviderDeletion(prepared, context, error);
      throw new ServiceUnavailableException({
        code: 'MEDIA_PROVIDER_DELETE_FAILED',
        message: 'Không thể xóa ảnh trên Cloudinary. Liên kết ảnh đã được khôi phục, vui lòng thử lại.',
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const finalized = await transaction.mediaAsset.updateMany({
        where: {
          id: prepared.mediaAssetId,
          status: MEDIA_ASSET_STATUS.DELETE_PENDING,
        },
        data: {
          status: MEDIA_ASSET_STATUS.INACTIVE,
          version: { increment: 1 },
        },
      });
      if (finalized.count !== 1) {
        throw new ConflictException('Trạng thái ảnh đã thay đổi trong lúc xóa; vui lòng tải lại.');
      }
      await this.writeAudit(
        transaction,
        context,
        PRODUCT_AUDIT_ACTION.MEDIA_DELETE,
        databaseMediaId,
        { mediaAssetStatus: MEDIA_ASSET_STATUS.DELETE_PENDING },
        {
          mediaAssetId: toEntityId(prepared.mediaAssetId),
          mediaAssetStatus: MEDIA_ASSET_STATUS.INACTIVE,
          providerDeleted: true,
        },
        2,
      );
      return this.listActive(transaction, databaseProductId);
    });
  }

  private async prepareProviderDeletion(
    productId: bigint,
    mediaId: bigint,
    expectedProductVersion: number,
    context: MutationContext,
  ): Promise<{
    productId: bigint;
    mediaId: bigint;
    mediaAssetId: bigint;
    publicId: string;
    variantId: bigint | null;
    wasPrimary: boolean;
  }> {
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.productMedia.findFirst({
        where: { id: mediaId, productId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
        select: { mediaAssetId: true },
      });
      if (!candidate) throw new NotFoundException('Product media not found');

      // TRANSACTION: mọi mutation Product khóa Product trước, MediaAsset sau để tránh deadlock.
      await this.claimProductVersion(transaction, productId, expectedProductVersion);
      await this.lockMediaAsset(transaction, candidate.mediaAssetId);

      const current = await transaction.productMedia.findFirst({
        where: { id: mediaId, productId, status: PRODUCT_MEDIA_STATUS.ACTIVE },
        include: { mediaAsset: true },
      });
      if (!current) throw new ConflictException('Ảnh sản phẩm vừa thay đổi; vui lòng tải lại.');
      if (current.mediaAsset.status !== MEDIA_ASSET_STATUS.ACTIVE) {
        throw new ConflictException('Ảnh đang được xử lý bởi một yêu cầu khác.');
      }
      await this.assertAssetIsNotShared(transaction, current.mediaAssetId, current.id);

      const claimed = await transaction.mediaAsset.updateMany({
        where: { id: current.mediaAssetId, status: MEDIA_ASSET_STATUS.ACTIVE },
        data: {
          status: MEDIA_ASSET_STATUS.DELETE_PENDING,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Ảnh đang được xử lý bởi một yêu cầu khác.');
      }

      await transaction.productMedia.update({
        where: { id: mediaId },
        data: { status: PRODUCT_MEDIA_STATUS.INACTIVE, isPrimary: false },
      });
      if (current.isPrimary) {
        const replacement = await transaction.productMedia.findFirst({
          where: {
            productId,
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
        PRODUCT_AUDIT_ACTION.MEDIA_DELETE_REQUEST,
        mediaId,
        {
          status: current.status,
          isPrimary: current.isPrimary,
          mediaAssetStatus: current.mediaAsset.status,
        },
        {
          status: PRODUCT_MEDIA_STATUS.INACTIVE,
          isPrimary: false,
          mediaAssetStatus: MEDIA_ASSET_STATUS.DELETE_PENDING,
        },
      );
      return {
        productId,
        mediaId,
        mediaAssetId: current.mediaAssetId,
        publicId: current.mediaAsset.publicId,
        variantId: current.variantId,
        wasPrimary: current.isPrimary,
      };
    });
  }

  private async restoreFailedProviderDeletion(
    prepared: {
      productId: bigint;
      mediaId: bigint;
      mediaAssetId: bigint;
      variantId: bigint | null;
      wasPrimary: boolean;
    },
    context: MutationContext,
    providerError: unknown,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockMediaAsset(transaction, prepared.mediaAssetId);
      const asset = await transaction.mediaAsset.findUnique({
        where: { id: prepared.mediaAssetId },
        select: { status: true },
      });
      if (asset?.status !== MEDIA_ASSET_STATUS.DELETE_PENDING) return;

      await transaction.mediaAsset.update({
        where: { id: prepared.mediaAssetId },
        data: {
          status: MEDIA_ASSET_STATUS.ACTIVE,
          version: { increment: 1 },
        },
      });
      let restorePrimary = false;
      if (prepared.wasPrimary) {
        const activePrimary = await transaction.productMedia.count({
          where: {
            productId: prepared.productId,
            variantId: prepared.variantId,
            status: PRODUCT_MEDIA_STATUS.ACTIVE,
            isPrimary: true,
          },
        });
        restorePrimary = activePrimary === 0;
      }
      await transaction.productMedia.update({
        where: { id: prepared.mediaId },
        data: {
          status: PRODUCT_MEDIA_STATUS.ACTIVE,
          isPrimary: restorePrimary,
        },
      });
      // CONCURRENCY: compensation cũng tăng version để mọi client đang giữ snapshot cũ phải reload.
      await transaction.product.update({
        where: { id: prepared.productId },
        data: { version: { increment: 1 } },
      });
      await this.writeAudit(
        transaction,
        context,
        PRODUCT_AUDIT_ACTION.MEDIA_DELETE_FAILED,
        prepared.mediaId,
        { mediaAssetStatus: MEDIA_ASSET_STATUS.DELETE_PENDING },
        {
          mediaAssetStatus: MEDIA_ASSET_STATUS.ACTIVE,
          productMediaStatus: PRODUCT_MEDIA_STATUS.ACTIVE,
          providerError: providerError instanceof Error ? providerError.name : 'UnknownError',
        },
        2,
      );
    });
  }

  private async assertAssetIsNotShared(
    transaction: Prisma.TransactionClient,
    mediaAssetId: bigint,
    currentProductMediaId: bigint,
  ): Promise<void> {
    const usages = await Promise.all([
      transaction.productMedia.count({
        where: {
          mediaAssetId,
          id: { not: currentProductMediaId },
          status: PRODUCT_MEDIA_STATUS.ACTIVE,
        },
      }),
      transaction.brand.count({ where: { logoAssetId: mediaAssetId } }),
      transaction.category.count({ where: { imageAssetId: mediaAssetId } }),
      transaction.contentPost.count({ where: { coverAssetId: mediaAssetId } }),
      transaction.paymentEvidence.count({ where: { mediaAssetId } }),
    ]);
    if (usages.some((count) => count > 0)) {
      throw new ConflictException(
        'Ảnh đang được sử dụng ở sản phẩm hoặc nghiệp vụ khác nên không thể xóa khỏi Cloudinary.',
      );
    }
  }

  private async lockMediaAsset(
    transaction: Prisma.TransactionClient,
    mediaAssetId: bigint,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM media_assets WHERE id = ${mediaAssetId} FOR UPDATE`,
    );
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
    sequenceNo = 1,
  ): Promise<void> {
    await this.audit.write(
      {
        requestId: context.requestId,
        sequenceNo,
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
