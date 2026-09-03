import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditWriter } from '../../../audit/audit.writer';
import { ProductMediaService } from './product-media.service';

describe('ProductMediaService', () => {
  const context = {
    requestId: 'request-1',
    actorUserId: '00000000-0000-7000-8000-000000000002',
  };

  it('rejects attaching an asset that was not finalized as ACTIVE', async () => {
    const transaction = {
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
    const service = new ProductMediaService(prisma, {} as AuditWriter);

    await expect(service.attach(
      '00000000-0000-7000-8000-000000000010',
      {
        mediaAssetId: '00000000-0000-7000-8000-000000000011',
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
    const service = new ProductMediaService(prisma, {} as AuditWriter);

    await expect(service.attach(
      '00000000-0000-7000-8000-000000000010',
      {
        mediaAssetId: '00000000-0000-7000-8000-000000000011',
        expectedProductVersion: 1,
        isPrimary: false,
      },
      context,
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
