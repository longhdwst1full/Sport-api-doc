import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ObjectStorageClient, StoredImageAsset } from '../../integrations/object-storage/object-storage.client';
import { AuditWriter } from '../audit/audit.writer';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const verified: StoredImageAsset = {
    provider: 'CLOUDINARY',
    providerAssetId: 'asset-1',
    publicId: 'sport-sys/sport/image-1',
    secureUrl: 'https://res.cloudinary.com/demo/image/upload/image-1.webp',
    thumbnailUrl: 'https://res.cloudinary.com/demo/image/upload/w_320/image-1.webp',
    mimeType: 'image/webp',
    width: 1200,
    height: 800,
    sizeBytes: 1024,
    format: 'webp',
    version: 7,
  };

  it('persists verified provider metadata and writes audit in the same transaction', async () => {
    const createMediaAsset = jest.fn();
    const writeAudit = jest.fn();
    const created = {
      id: '00000000-0000-7000-8000-000000000001',
      ...verified,
      thumbnailUrl: verified.thumbnailUrl,
      sizeBytes: 1024n,
      status: 'ACTIVE',
      mimeType: verified.mimeType,
      format: verified.format,
    };
    const transaction = {
      mediaAsset: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: createMediaAsset.mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const storage = {
      verifyImageUpload: jest.fn().mockResolvedValue(verified),
    } as unknown as ObjectStorageClient;
    const audit = { write: writeAudit.mockResolvedValue({}) } as unknown as AuditWriter;
    const service = new MediaService(storage, {} as ConfigService, prisma, audit);

    const result = await service.finalizeUpload(
      { publicId: verified.publicId, version: 7, signature: 'provider-signature' },
      { requestId: 'request-1', actorUserId: '00000000-0000-7000-8000-000000000002' },
    );

    expect(result).toMatchObject({ id: created.id, providerVersion: 7, status: 'ACTIVE' });
    expect(createMediaAsset).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when the Cloudinary asset was already finalized', async () => {
    const createMediaAsset = jest.fn();
    const writeAudit = jest.fn();
    const existing = {
      id: '00000000-0000-7000-8000-000000000001',
      ...verified,
      sizeBytes: 1024n,
      status: 'ACTIVE',
    };
    const transaction = {
      mediaAsset: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: createMediaAsset,
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const storage = {
      verifyImageUpload: jest.fn().mockResolvedValue(verified),
    } as unknown as ObjectStorageClient;
    const audit = { write: writeAudit } as unknown as AuditWriter;
    const service = new MediaService(storage, {} as ConfigService, prisma, audit);

    await service.finalizeUpload(
      { publicId: verified.publicId, version: 7, signature: 'provider-signature' },
      { requestId: 'request-2', actorUserId: '00000000-0000-7000-8000-000000000002' },
    );

    expect(createMediaAsset).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('returns the winning asset when concurrent finalize hits the unique constraint', async () => {
    const existing = {
      id: '00000000-0000-7000-8000-000000000001',
      ...verified,
      sizeBytes: 1024n,
      status: 'ACTIVE',
    };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate asset', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      ),
      mediaAsset: { findUniqueOrThrow: jest.fn().mockResolvedValue(existing) },
    } as unknown as PrismaService;
    const storage = {
      verifyImageUpload: jest.fn().mockResolvedValue(verified),
    } as unknown as ObjectStorageClient;
    const service = new MediaService(
      storage,
      {} as ConfigService,
      prisma,
      { write: jest.fn() } as unknown as AuditWriter,
    );

    await expect(service.finalizeUpload(
      { publicId: verified.publicId, version: 7, signature: 'provider-signature' },
      { requestId: 'request-3', actorUserId: '00000000-0000-7000-8000-000000000002' },
    )).resolves.toMatchObject({ id: existing.id, providerVersion: 7 });
  });
});
