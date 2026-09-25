import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { ObjectStorageClient } from '../../../../integrations/object-storage/object-storage.client';
import { AuditWriter } from '../../../audit/audit.writer';
import { ProductMediaService } from './product-media.service';

describe('ProductMediaService', () => {
  const context = {
    requestId: 'request-1',
    actorUserId: '2',
  };

  it('rejects attaching an asset that was not finalized as ACTIVE', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11n }]),
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mediaAsset: { findFirst: jest.fn().mockResolvedValue(null) },
      productVariant: { findFirst: jest.fn() },
      productMedia: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const service = new ProductMediaService(
      prisma,
      {} as AuditWriter,
      {} as ObjectStorageClient,
    );

    await expect(service.attach(
      '10',
      {
        mediaAssetId: '11',
        expectedProductVersion: 0,
        isPrimary: false,
      },
      context,
    )).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('detects concurrent product media changes through product version', async () => {
    const transaction = {
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ status: 'DRAFT', version: 2n }),
      },
      mediaAsset: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
      productMedia: {
        findFirst: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const service = new ProductMediaService(
      prisma,
      {} as AuditWriter,
      {} as ObjectStorageClient,
    );

    await expect(service.attach(
      '10',
      {
        mediaAssetId: '11',
        expectedProductVersion: 1,
        isPrimary: false,
      },
      context,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('xóa asset Cloudinary khi ảnh chỉ được dùng bởi liên kết sản phẩm hiện tại', async () => {
    const current = {
      id: 12n,
      productId: 10n,
      variantId: null,
      mediaAssetId: 11n,
      status: 'ACTIVE',
      isPrimary: false,
      mediaAsset: {
        id: 11n,
        publicId: 'sport-sys/sport/product-1',
        status: 'ACTIVE',
      },
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11n }]),
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mediaAsset: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productMedia: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ mediaAssetId: 11n })
          .mockResolvedValueOnce(current),
        update: jest.fn().mockResolvedValue(current),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      brand: { count: jest.fn().mockResolvedValue(0) },
      category: { count: jest.fn().mockResolvedValue(0) },
      contentPost: { count: jest.fn().mockResolvedValue(0) },
      paymentEvidence: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const audit = { write: jest.fn().mockResolvedValue(undefined) } as unknown as AuditWriter;
    const deleteImage = jest.fn().mockResolvedValue(undefined);
    const objectStorage = { deleteImage } as unknown as ObjectStorageClient;
    const service = new ProductMediaService(prisma, audit, objectStorage);

    await expect(service.delete('10', '12', 0, context)).resolves.toEqual([]);

    expect(deleteImage).toHaveBeenCalledWith('sport-sys/sport/product-1');
    expect(transaction.mediaAsset.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 11n, status: 'ACTIVE' },
      data: { status: 'DELETE_PENDING', version: { increment: 1 } },
    });
    expect(transaction.mediaAsset.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 11n, status: 'DELETE_PENDING' },
      data: { status: 'INACTIVE', version: { increment: 1 } },
    });
  });

  it('không xóa Cloudinary khi asset còn được nghiệp vụ khác sử dụng', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11n }]),
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mediaAsset: { updateMany: jest.fn() },
      productMedia: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ mediaAssetId: 11n })
          .mockResolvedValueOnce({
            id: 12n,
            mediaAssetId: 11n,
            status: 'ACTIVE',
            mediaAsset: { publicId: 'sport-sys/sport/product-1', status: 'ACTIVE' },
          }),
        count: jest.fn().mockResolvedValue(1),
      },
      brand: { count: jest.fn().mockResolvedValue(0) },
      category: { count: jest.fn().mockResolvedValue(0) },
      contentPost: { count: jest.fn().mockResolvedValue(0) },
      paymentEvidence: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const deleteImage = jest.fn();
    const objectStorage = { deleteImage } as unknown as ObjectStorageClient;
    const service = new ProductMediaService(prisma, {} as AuditWriter, objectStorage);

    await expect(service.delete('10', '12', 0, context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('khôi phục liên kết và tăng version khi Cloudinary xóa lỗi', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11n }]),
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 10n }),
      },
      mediaAsset: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ status: 'DELETE_PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 11n, status: 'ACTIVE' }),
      },
      productMedia: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ mediaAssetId: 11n })
          .mockResolvedValueOnce({
            id: 12n,
            productId: 10n,
            variantId: null,
            mediaAssetId: 11n,
            status: 'ACTIVE',
            isPrimary: false,
            mediaAsset: {
              id: 11n,
              publicId: 'sport-sys/sport/product-1',
              status: 'ACTIVE',
            },
          }),
        update: jest.fn().mockResolvedValue({ id: 12n }),
        count: jest.fn().mockResolvedValue(0),
      },
      brand: { count: jest.fn().mockResolvedValue(0) },
      category: { count: jest.fn().mockResolvedValue(0) },
      contentPost: { count: jest.fn().mockResolvedValue(0) },
      paymentEvidence: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const audit = { write: jest.fn().mockResolvedValue(undefined) } as unknown as AuditWriter;
    const deleteImage = jest.fn().mockRejectedValue(new Error('Cloudinary timeout'));
    const service = new ProductMediaService(
      prisma,
      audit,
      { deleteImage } as unknown as ObjectStorageClient,
    );

    await expect(service.delete('10', '12', 0, context)).rejects.toMatchObject({
      response: {
        code: 'MEDIA_PROVIDER_DELETE_FAILED',
      },
    });
    expect(transaction.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 11n },
      data: { status: 'ACTIVE', version: { increment: 1 } },
    });
    expect(transaction.productMedia.update).toHaveBeenLastCalledWith({
      where: { id: 12n },
      data: { status: 'ACTIVE', isPrimary: false },
    });
    expect(transaction.product.update).toHaveBeenCalledWith({
      where: { id: 10n },
      data: { version: { increment: 1 } },
    });
  });
});

describe('ProductMediaService.attachInitialMedia', () => {
  const build = (activeCount: number) => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      mediaAsset: { count: jest.fn().mockResolvedValue(activeCount) },
      productMedia: { create: jest.fn().mockImplementation(({ data }: { data: { sortOrder: number } }) => Promise.resolve({ id: BigInt(100 + data.sortOrder) })) },
    };
    const write = jest.fn().mockResolvedValue(undefined);
    const service = new ProductMediaService({} as PrismaService, { write } as unknown as AuditWriter, {} as ObjectStorageClient);
    return { service, transaction, write };
  };
  const context = { requestId: 'req-media', actorUserId: '2' };

  it('links assets in order with the first one primary, inside the caller transaction', async () => {
    const { service, transaction, write } = build(2);

    await service.attachInitialMedia(transaction as never, 1n, [{ mediaAssetId: '9' }, { mediaAssetId: '5', altText: ' Mặt bên ' }], context);

    const created = (transaction.productMedia.create.mock.calls as Array<[{ data: Record<string, unknown> }]>).map(([call]) => call.data);
    expect(created).toEqual([
      expect.objectContaining({ productId: 1n, mediaAssetId: 9n, sortOrder: 0, isPrimary: true, altText: null }),
      expect.objectContaining({ productId: 1n, mediaAssetId: 5n, sortOrder: 1, isPrimary: false, altText: 'Mặt bên' }),
    ]);
    // Khoá theo thứ tự id (5 rồi 9) để hai lần tạo song song dùng chung ảnh không deadlock.
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('fails the whole create when an asset is not ACTIVE', async () => {
    const { service, transaction } = build(1);

    await expect(
      service.attachInitialMedia(transaction as never, 1n, [{ mediaAssetId: '9' }, { mediaAssetId: '5' }], context),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction.productMedia.create).not.toHaveBeenCalled();
  });
});
