import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { AuditWriter } from '../../audit/audit.writer';
import { PrismaService } from '../../../database/prisma.service';
import { CatalogMasterService } from './catalog-master.service';

describe('CatalogMasterService', () => {
  const context = { requestId: 'catalog-master-test', actorUserId: '99' };

  function createService(transaction: object): {
    service: CatalogMasterService;
    auditWrite: jest.Mock;
  } {
    const auditWrite = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn((callback: (client: object) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const audit = { write: auditWrite } as unknown as AuditWriter;
    return { service: new CatalogMasterService(prisma, audit), auditWrite };
  }

  it('updates a brand with optimistic versioning and audit', async () => {
    const current = {
      id: 1n,
      code: 'NIKE',
      name: 'Nike',
      slug: 'nike',
      description: null,
      logoAssetId: null,
      status: 'ACTIVE',
      version: 0n,
    };
    const updated = { ...current, name: 'Nike Việt Nam', version: 1n };
    const transaction = {
      brand: {
        findUnique: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
    };
    const { service, auditWrite } = createService(transaction);

    const result = await service.updateBrand(
      '1',
      { name: 'Nike Việt Nam', expectedVersion: 0 },
      context,
    );

    expect(result.name).toBe('Nike Việt Nam');
    expect(result.version).toBe(1);
    expect(transaction.brand.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1n, version: 0n } }),
    );
    expect(auditWrite).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale brand update', async () => {
    const transaction = {
      brand: {
        findUnique: jest.fn().mockResolvedValue({ id: 1n, version: 1n }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const { service } = createService(transaction);

    await expect(
      service.updateBrand('1', { name: 'Stale', expectedVersion: 0 }, context),
    ).rejects.toThrow(ConflictException);
  });

  it('requires child categories to be inactive before deactivating a parent', async () => {
    const transaction = {
      category: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2n,
          parentId: null,
          status: 'ACTIVE',
          version: 0n,
        }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const { service } = createService(transaction);

    await expect(
      service.changeCategoryStatus(
        '2',
        'INACTIVE',
        { expectedVersion: 0 },
        context,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
