import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  it('rejects retroactive price windows before accessing persistence', async () => {
    await expect(
      service.createPrice(
        '00000000-0000-7000-8000-000000000001',
        { amount: '100000.00', startsAt: '2020-01-01T00:00:00.000Z' },
        { requestId: 'request', actorUserId: '00000000-0000-7000-8000-000000000002' },
      ),
    ).rejects.toThrow('cannot be in the past');
  });

  it('requires a reason when a price is reduced by more than 20 percent', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      productVariant: { findFirst: jest.fn().mockResolvedValue({ productId: 'product-id' }) },
      productPrice: {
        findFirst: jest.fn().mockResolvedValue({ amount: new Prisma.Decimal('100000.00') }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const pricing = new ProductsService(prisma, {} as AuditWriter);

    await expect(
      pricing.createPrice(
        '00000000-0000-7000-8000-000000000001',
        { amount: '79000.00', startsAt: new Date(Date.now() + 60_000).toISOString() },
        { requestId: 'request', actorUserId: '00000000-0000-7000-8000-000000000002' },
      ),
    ).rejects.toThrow('A reason is required when reducing price by more than 20%');
  });

  it('rejects archiving a product that is already archived', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
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
      $queryRaw: jest.fn().mockResolvedValue([]),
      productVariant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ productId: 'product-id' })
          .mockResolvedValueOnce({
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
      $queryRaw: jest.fn().mockResolvedValue([]),
      productVariant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ productId: 'product-id' })
          .mockResolvedValueOnce({
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

  it('returns only sellable variants and excludes an inactive SKU from storefront minPrice', async () => {
    const row = {
      id: 'product-id',
      productType: 'STANDARD',
      productNo: 'SP-001',
      name: 'Running shoes',
      slug: 'running-shoes',
      brand: null,
      status: 'PUBLISHED',
      version: 1n,
      shortDescription: null,
      description: null,
      categories: [],
      media: [],
      variants: [
        {
          id: 'inactive-variant',
          sku: 'INACTIVE-SKU',
          barcode: null,
          name: 'Inactive cheap SKU',
          status: 'INACTIVE',
          version: 0n,
          prices: [{ id: 'price-1', amount: new Prisma.Decimal('1.00'), version: 0n }],
          bundleDefinition: null,
        },
        {
          id: 'active-variant',
          sku: 'ACTIVE-SKU',
          barcode: null,
          name: 'Active SKU',
          status: 'ACTIVE',
          version: 0n,
          prices: [{ id: 'price-2', amount: new Prisma.Decimal('500000.00'), version: 0n }],
          bundleDefinition: null,
        },
      ],
    };
    const product = {
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      product,
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const storefront = new ProductsService(prisma, {} as AuditWriter);

    const result = await storefront.list({ page: 1, limit: 12 }, true);

    expect(result.items[0]).toMatchObject({ minPrice: '500000.00' });
    expect(product.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects publishing a combo when one component variant is inactive', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'combo-product-id',
          variants: [
            {
              bundleDefinition: {
                items: [{ componentVariant: { productId: 'component-product-id' } }],
              },
            },
          ],
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'combo-product-id',
          productType: 'BUNDLE',
          status: 'DRAFT',
          variants: [
            {
              prices: [{}],
              bundleDefinition: {
                status: 'ACTIVE',
                items: [
                  {
                    componentVariant: {
                      status: 'INACTIVE',
                      product: { status: 'PUBLISHED' },
                    },
                  },
                ],
              },
            },
          ],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const lifecycle = new ProductsService(prisma, {} as AuditWriter);

    await expect(
      lifecycle.publish(
        '00000000-0000-7000-8000-000000000001',
        { expectedVersion: 0 },
        { requestId: 'request', actorUserId: '00000000-0000-7000-8000-000000000002' },
      ),
    ).rejects.toThrow('Every active BUNDLE variant requires');
  });
});
