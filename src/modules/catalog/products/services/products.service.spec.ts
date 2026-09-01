import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditWriter } from '../../../audit/audit.writer';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const service = new ProductsService({} as PrismaService, {} as AuditWriter);

  it('rejects a primary category outside the selected categories before persistence', async () => {
    await expect(
      service.create(
        {
          productNo: 'SP-001',
          name: 'Tạ tay',
          slug: 'ta-tay',
          categoryIds: ['00000000-0000-7000-8000-000000000001'],
          primaryCategoryId: '00000000-0000-7000-8000-000000000002',
        },
        { requestId: 'unit-request', actorUserId: '00000000-0000-7000-8000-000000000010' },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects archiving a product that is already archived', async () => {
    const transaction = {
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'product-id', status: 'ARCHIVED' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const lifecycle = new ProductsService(prisma, {} as AuditWriter);

    await expect(
      lifecycle.archiveProduct(
        '00000000-0000-7000-8000-000000000001',
        { expectedVersion: 2 },
        { requestId: 'request', actorUserId: '00000000-0000-7000-8000-000000000002' },
      ),
    ).rejects.toThrow('Product cannot transition from ARCHIVED to ARCHIVED');
  });

  it('requires reactivating the product before reactivating one of its variants', async () => {
    const transaction = {
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-id',
          status: 'INACTIVE',
          product: { status: 'ARCHIVED' },
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const lifecycle = new ProductsService(prisma, {} as AuditWriter);

    await expect(
      lifecycle.reactivateVariant(
        '00000000-0000-7000-8000-000000000001',
        { expectedVersion: 1 },
        { requestId: 'request', actorUserId: '00000000-0000-7000-8000-000000000002' },
      ),
    ).rejects.toThrow('Reactivate the product before its variant');
  });

  it('protects a published combo from losing an active component variant', async () => {
    const transaction = {
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-id',
          productId: 'product-id',
          status: 'ACTIVE',
        }),
      },
      bundleItem: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const lifecycle = new ProductsService(prisma, {} as AuditWriter);

    await expect(
      lifecycle.archiveVariant(
        '00000000-0000-7000-8000-000000000001',
        { expectedVersion: 0 },
        { requestId: 'request', actorUserId: '00000000-0000-7000-8000-000000000002' },
      ),
    ).rejects.toThrow('archive the combo first');
  });
});
