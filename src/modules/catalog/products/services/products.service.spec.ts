import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditReader } from '../../../audit/audit.reader';
import { AuditWriter } from '../../../audit/audit.writer';
import { CreateProductDto } from '../dto/product.dto';
import { ProductMediaService } from './product-media.service';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const service = new ProductsService({} as PrismaService, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

  it('maps minPrice and quick-add identifiers from the same sellable offer', () => {
    const row = {
      id: 10n,
      productNo: 'PRD-10',
      name: 'Tạ tay',
      slug: 'ta-tay-prd-10',
      productType: 'STANDARD',
      status: 'PUBLISHED',
      version: 1,
      brand: null,
      categories: [],
      media: [],
      variants: [
        { id: 21n, sku: 'SKU-HIGH', status: 'ACTIVE', prices: [{ amount: new Prisma.Decimal('200000') }], bundleDefinition: null },
        { id: 22n, sku: 'SKU-LOW', status: 'ACTIVE', prices: [{ amount: new Prisma.Decimal('150000') }], bundleDefinition: null },
      ],
    };

    const summary = (service as unknown as {
      toSummary: (value: unknown, storefront: boolean) => {
        defaultVariantId?: string | null;
        defaultVariantSku?: string | null;
        minPrice?: string | null;
      };
    }).toSummary(row, false);

    expect(summary).toMatchObject({
      defaultVariantId: '22',
      defaultVariantSku: 'SKU-LOW',
      minPrice: '150000.00',
    });
  });

  it('rejects a primary category outside the selected categories before persistence', async () => {
    await expect(
      service.create(
        {
          name: 'Tạ tay',
          categoryIds: ['1'],
          primaryCategoryId: '2',
          variants: [{ name: 'Mặc định' }],
        },
        { requestId: 'unit-request', actorUserId: '10' },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('creates product, category links and every initial SKU in one transaction', async () => {
    const productCreate = jest.fn().mockResolvedValue({ id: 1n });
    const productCategoryCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const productVariantCreate = jest.fn()
      .mockResolvedValueOnce({ id: 11n })
      .mockResolvedValueOnce({ id: 12n });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      brand: { count: jest.fn() },
      category: { count: jest.fn().mockResolvedValue(1) },
      product: { create: productCreate },
      productCategory: { createMany: productCategoryCreateMany },
      productVariant: { create: productVariantCreate },
    };
    const prismaTransaction = jest.fn(
      (work: (client: typeof transaction) => unknown) => work(transaction),
    );
    const prisma = {
      $transaction: prismaTransaction,
    } as unknown as PrismaService;
    const auditWrite = jest.fn().mockResolvedValue(undefined);
    const audit = { write: auditWrite } as unknown as AuditWriter;
    const auditReader = { findByRequestId: jest.fn().mockResolvedValue([]) } as unknown as AuditReader;
    const catalog = new ProductsService(prisma, audit, auditReader, {} as ProductMediaService);
    const catalogInternals = catalog as unknown as {
      getById(id: bigint): Promise<unknown>;
    };
    jest.spyOn(catalogInternals, 'getById').mockResolvedValue({
      id: '1',
      variants: [{ id: '11' }, { id: '12' }],
    });

    await catalog.create(
      {
        name: 'Giày chạy bộ',
        categoryIds: ['1'],
        primaryCategoryId: '1',
        variants: [
          { name: 'Đen - 40', weightGrams: 850 },
          { name: 'Đen - 41', lengthMm: 300 },
        ],
      },
      { requestId: 'request-create-product', actorUserId: '2' },
    );

    expect(prismaTransaction).toHaveBeenCalledTimes(1);
    expect(productCreate).toHaveBeenCalledTimes(1);
    expect(productCategoryCreateMany).toHaveBeenCalledTimes(1);
    expect(productVariantCreate).toHaveBeenCalledTimes(2);
    const variantCreateCalls = productVariantCreate.mock.calls as unknown as Array<[
      { data: { productId: bigint; name: string; weightGrams?: number } },
    ]>;
    expect(variantCreateCalls[0]?.[0]).toMatchObject({
      data: { productId: 1n, name: 'Đen - 40', weightGrams: 850 },
    });
    expect(auditWrite).toHaveBeenCalledTimes(3);
  });

  it('keeps a published product slug immutable', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: {
        findUnique: jest.fn().mockResolvedValue({
          productType: 'STANDARD',
          status: 'PUBLISHED',
          slug: 'giay-chay-bo-prd-a1',
          _count: { variants: 1 },
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const catalog = new ProductsService(prisma, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

    await expect(
      catalog.update(
        '1',
        { slug: 'slug-moi', expectedVersion: 1 },
        { requestId: 'request', actorUserId: '2' },
      ),
    ).rejects.toThrow('Product slug cannot change after publish');
  });

  it('rejects retroactive price windows before accessing persistence', async () => {
    await expect(
      service.createPrice(
        '1',
        { amount: '100000.00', startsAt: '2020-01-01T00:00:00.000Z' },
        { requestId: 'request', actorUserId: '2' },
      ),
    ).rejects.toThrow('cannot be in the past');
  });

  it('requires a reason when a price is reduced by more than 20 percent', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      productVariant: { findFirst: jest.fn().mockResolvedValue({ productId: 1n }) },
      productPrice: {
        findFirst: jest.fn().mockResolvedValue({ amount: new Prisma.Decimal('100000.00') }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const pricing = new ProductsService(prisma, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

    await expect(
      pricing.createPrice(
        '1',
        { amount: '79000.00', startsAt: new Date(Date.now() + 60_000).toISOString() },
        { requestId: 'request', actorUserId: '2' },
      ),
    ).rejects.toThrow('A reason is required when reducing price by more than 20%');
  });

  it('rejects archiving a product that is already archived', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 1n, status: 'ARCHIVED' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const lifecycle = new ProductsService(prisma, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

    await expect(
      lifecycle.archiveProduct(
        '1',
        { expectedVersion: 2 },
        { requestId: 'request', actorUserId: '2' },
      ),
    ).rejects.toThrow('Product cannot transition from ARCHIVED to ARCHIVED');
  });

  it('requires reactivating the product before reactivating one of its variants', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      productVariant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ productId: 1n })
          .mockResolvedValueOnce({
            id: 2n,
            status: 'INACTIVE',
            product: { status: 'ARCHIVED' },
          }),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const lifecycle = new ProductsService(prisma, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

    await expect(
      lifecycle.reactivateVariant(
        '2',
        { expectedVersion: 1 },
        { requestId: 'request', actorUserId: '2' },
      ),
    ).rejects.toThrow('Reactivate the product before its variant');
  });

  it('protects a published combo from losing an active component variant', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      productVariant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ productId: 1n })
          .mockResolvedValueOnce({
            id: 2n,
            productId: 1n,
            status: 'ACTIVE',
          }),
      },
      bundleItem: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
    } as unknown as PrismaService;
    const lifecycle = new ProductsService(prisma, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

    await expect(
      lifecycle.archiveVariant(
        '2',
        { expectedVersion: 0 },
        { requestId: 'request', actorUserId: '2' },
      ),
    ).rejects.toThrow('archive the combo first');
  });

  it('returns only sellable variants and excludes an inactive SKU from storefront minPrice', async () => {
    const row = {
      id: 1n,
      brandId: null,
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
          id: 2n,
          sku: 'INACTIVE-SKU',
          barcode: null,
          name: 'Inactive cheap SKU',
          status: 'INACTIVE',
          version: 0n,
          prices: [{ id: 1n, amount: new Prisma.Decimal('1.00'), version: 0n }],
          bundleDefinition: null,
        },
        {
          id: 3n,
          sku: 'ACTIVE-SKU',
          barcode: null,
          name: 'Active SKU',
          status: 'ACTIVE',
          version: 0n,
          prices: [{ id: 2n, amount: new Prisma.Decimal('500000.00'), version: 0n }],
          bundleDefinition: null,
        },
      ],
    };
    const product = {
      findMany: jest.fn().mockResolvedValue([row]),
      count: jest.fn().mockResolvedValue(1),
    };
    const transactionSpy = jest.fn((operations: Promise<unknown>[]) => Promise.all(operations));
    const prisma = {
      product,
      $transaction: transactionSpy,
    } as unknown as PrismaService;
    const storefront = new ProductsService(prisma, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

    const result = await storefront.list({ page: 1, limit: 12 }, true);

    expect(result.items[0]).toMatchObject({ minPrice: '500000.00' });
    expect(product.findMany).toHaveBeenCalledTimes(1);
    // List đọc độc lập; không giữ transaction của Supabase pooler chỉ để đếm dòng.
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('rejects publishing a combo when one component variant is inactive', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1n,
          variants: [
            {
              bundleDefinition: {
                items: [{ componentVariant: { productId: 2n } }],
              },
            },
          ],
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 1n,
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
    const lifecycle = new ProductsService(prisma, {} as AuditWriter, {} as AuditReader, {} as ProductMediaService);

    await expect(
      lifecycle.publish(
        '1',
        { expectedVersion: 0 },
        { requestId: 'request', actorUserId: '2' },
      ),
    ).rejects.toThrow('Every active BUNDLE variant requires');
  });

  describe('createAdminProduct idempotency (x-request-id + audit)', () => {
    const payload = (): CreateProductDto => ({
      name: 'Trụ bóng chuyền TD-02',
      categoryIds: ['1'],
      primaryCategoryId: '1',
      variants: [{ name: 'TD-02', weightGrams: 160000 }],
    });
    type AuditEntry = Awaited<ReturnType<AuditReader['findByRequestId']>>[number];

    const harness = (entries: AuditEntry[] = []) => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        brand: { count: jest.fn() },
        category: { count: jest.fn().mockResolvedValue(1) },
        product: { create: jest.fn().mockResolvedValue({ id: 1n }) },
        productCategory: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        productVariant: { create: jest.fn().mockResolvedValue({ id: 11n }) },
      };
      const prisma = {
        $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
      } as unknown as PrismaService;
      const auditWrite = jest.fn().mockResolvedValue(undefined);
      const findByRequestId = jest.fn().mockResolvedValue(entries);
      const attachInitialMedia = jest.fn().mockResolvedValue(undefined);
      const service = new ProductsService(
        prisma,
        { write: auditWrite } as unknown as AuditWriter,
        { findByRequestId } as unknown as AuditReader,
        { attachInitialMedia } as unknown as ProductMediaService,
      );
      const getById = jest
        .spyOn(service as unknown as { getById(id: bigint): Promise<unknown> }, 'getById')
        .mockResolvedValue({ id: '1' });
      return { service, transaction, auditWrite, findByRequestId, getById };
    };

    /** Tạo một lần để lấy audit sản phẩm (có dấu vân tay) mà lần gửi lại sẽ đọc được. */
    const firstCreateAudit = async (input: CreateProductDto, actorUserId = '2') => {
      const first = harness();
      await first.service.create(input, { requestId: 'req-product-1', actorUserId });
      const calls = first.auditWrite.mock.calls as unknown as Array<[{ action: string; after: unknown }]>;
      const productAudit = calls.find(([entry]) => entry.action === 'catalog.product.create')?.[0];
      return {
        first,
        entry: {
          action: 'catalog.product.create',
          entityType: 'PRODUCT',
          entityId: '1',
          actorUserId,
          after: productAudit?.after,
          createdAt: new Date(),
        } as AuditEntry,
      };
    };

    it('locks by request id and stores the fingerprint on the product audit', async () => {
      const { first, entry } = await firstCreateAudit(payload());

      expect(first.transaction.$queryRaw).toHaveBeenCalledTimes(1);
      expect(first.findByRequestId).toHaveBeenCalledWith('req-product-1', first.transaction);
      const fingerprint = (entry.after as { idempotency: { fingerprintVersion: number; requestHash: string } })
        .idempotency;
      expect(fingerprint.fingerprintVersion).toBe(1);
      expect(fingerprint.requestHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('replays the created product for the same key, actor and payload without writing again', async () => {
      const { entry } = await firstCreateAudit(payload());
      const retry = harness([entry]);

      await retry.service.create(payload(), { requestId: 'req-product-1', actorUserId: '2' });

      expect(retry.transaction.product.create).not.toHaveBeenCalled();
      expect(retry.auditWrite).not.toHaveBeenCalled();
      expect(retry.getById).toHaveBeenCalledWith(1n);
    });

    it('treats reordered object keys as the same payload', async () => {
      const { entry } = await firstCreateAudit(payload());
      const retry = harness([entry]);
      const reordered = {
        variants: [{ weightGrams: 160000, name: 'TD-02' }],
        primaryCategoryId: '1',
        categoryIds: ['1'],
        name: 'Trụ bóng chuyền TD-02',
      } as CreateProductDto;

      await retry.service.create(reordered, { requestId: 'req-product-1', actorUserId: '2' });

      expect(retry.transaction.product.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a different payload', { ...payload(), name: 'Trụ bóng chuyền TD-03' }, '2'],
      ['a different actor', payload(), '99'],
    ])('rejects the same key with %s as PRODUCT_IDEMPOTENCY_CONFLICT', async (_case, input, actorUserId) => {
      const { entry } = await firstCreateAudit(payload());
      const retry = harness([entry]);

      const attempt = retry.service.create(input, { requestId: 'req-product-1', actorUserId });

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({
        response: { code: 'PRODUCT_IDEMPOTENCY_CONFLICT' },
      });
      expect(retry.transaction.product.create).not.toHaveBeenCalled();
    });

    it('rejects a key already bound to another operation', async () => {
      const retry = harness([
        { action: 'catalog.price.create', entityType: 'PRODUCT_PRICE', entityId: '5', actorUserId: '2', after: {}, createdAt: new Date() },
      ]);

      await expect(
        retry.service.create(payload(), { requestId: 'req-product-1', actorUserId: '2' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(retry.transaction.product.create).not.toHaveBeenCalled();
    });

    it('rejects a fingerprint written by another hash version instead of guessing', async () => {
      const { entry } = await firstCreateAudit(payload());
      const after = entry.after as { idempotency: { fingerprintVersion: number } };
      const retry = harness([
        { ...entry, after: { ...after, idempotency: { ...after.idempotency, fingerprintVersion: 0 } } },
      ]);

      await expect(
        retry.service.create(payload(), { requestId: 'req-product-1', actorUserId: '2' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a request id longer than the audit column before persistence', async () => {
      const { service, transaction } = harness();

      await expect(
        service.create(payload(), { requestId: 'x'.repeat(101), actorUserId: '2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('createAdminProduct with initial prices and media (one transaction)', () => {
    const build = () => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        brand: { count: jest.fn() },
        category: { count: jest.fn().mockResolvedValue(1) },
        product: { create: jest.fn().mockResolvedValue({ id: 1n }) },
        productCategory: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        productVariant: { create: jest.fn().mockResolvedValueOnce({ id: 11n }).mockResolvedValueOnce({ id: 12n }) },
        productPrice: { create: jest.fn().mockResolvedValue({ id: 70n }) },
      };
      const prisma = {
        $transaction: jest.fn((work: (client: typeof transaction) => unknown) => work(transaction)),
      } as unknown as PrismaService;
      const attachInitialMedia = jest.fn().mockResolvedValue(undefined);
      const service = new ProductsService(
        prisma,
        { write: jest.fn().mockResolvedValue(undefined) } as unknown as AuditWriter,
        { findByRequestId: jest.fn().mockResolvedValue([]) } as unknown as AuditReader,
        { attachInitialMedia } as unknown as ProductMediaService,
      );
      jest.spyOn(service as unknown as { getById(id: bigint): Promise<unknown> }, 'getById').mockResolvedValue({ id: '1' });
      return { service, transaction, attachInitialMedia };
    };

    it('creates the price of each priced SKU and attaches media inside the create transaction', async () => {
      const { service, transaction, attachInitialMedia } = build();

      await service.create({
        name: 'Trụ bóng chuyền TD-02',
        categoryIds: ['1'],
        primaryCategoryId: '1',
        variants: [{ name: 'TD-02', initialPriceAmount: '7800000' }, { name: 'TD-02 Pro' }],
        media: [{ mediaAssetId: '5' }, { mediaAssetId: '6', altText: 'Mặt bên' }],
      }, { requestId: 'req-setup', actorUserId: '2' });

      const variantCalls = transaction.productVariant.create.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>;
      expect(variantCalls[0][0].data).not.toHaveProperty('initialPriceAmount');
      expect(transaction.productPrice.create).toHaveBeenCalledTimes(1);
      expect(transaction.productPrice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productVariantId: 11n, status: 'ACTIVE' }) as unknown,
      });
      expect(attachInitialMedia).toHaveBeenCalledWith(
        transaction,
        1n,
        [{ mediaAssetId: '5' }, { mediaAssetId: '6', altText: 'Mặt bên' }],
        expect.objectContaining({ requestId: 'req-setup' }),
      );
      expect(prismaTransactions(service)).toBe(1);
    });

    it('rejects duplicated media assets before opening a transaction', async () => {
      const { service, transaction } = build();

      await expect(service.create({
        name: 'x', categoryIds: ['1'], primaryCategoryId: '1',
        variants: [{ name: 'x' }], media: [{ mediaAssetId: '5' }, { mediaAssetId: '5' }],
      }, { requestId: 'req-dup', actorUserId: '2' })).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(transaction.product.create).not.toHaveBeenCalled();
    });

    const prismaTransactions = (service: ProductsService) =>
      ((service as unknown as { prisma: { $transaction: jest.Mock } }).prisma.$transaction).mock.calls.length;
  });
});
