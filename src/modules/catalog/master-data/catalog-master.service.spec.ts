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

  /**
   * Gỡ một danh mục giữa cây phải nâng nhánh con lên, không được chặn thao tác. Trước đây service
   * từ chối khi còn con, buộc người dùng gỡ thủ công từ dưới lên và dễ để lại nhánh mồ côi.
   */
  it('nâng danh mục con lên cha khi gỡ danh mục ở giữa cây', async () => {
    const updateCategory = jest.fn(
      (args: { where: { id: bigint }; data: Record<string, unknown> }): Promise<object> => {
        void args;
        return Promise.resolve({});
      },
    );
    const executeRaw = jest.fn().mockResolvedValue(1);
    const transaction = {
      category: {
        findUnique: jest
          .fn()
          // Lần đầu nạp danh mục bị gỡ, lần sau nạp cha mới để dựng lại path.
          .mockResolvedValueOnce({ id: 5n, parentId: 1n, status: 'ACTIVE', version: 0n })
          .mockResolvedValueOnce({ path: '1', depth: 0 }),
        findMany: jest.fn().mockResolvedValue([{ id: 12n, path: '1/5/12', depth: 2 }]),
        update: updateCategory,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 5n,
          code: 'C',
          name: 'C',
          slug: 'c',
          path: '1/5',
          depth: 1,
          description: null,
          imageAssetId: null,
          sortOrder: 0,
          status: 'INACTIVE',
          version: 1n,
          parentId: 1n,
        }),
      },
      $executeRaw: executeRaw,
    };
    const { service } = createService(transaction);

    await service.changeCategoryStatus('5', 'INACTIVE', { expectedVersion: 0 }, context);

    // Con trực tiếp đổi cha sang ông nội.
    const reparented = updateCategory.mock.calls[0]?.[0];
    expect(reparented?.where.id).toBe(12n);
    expect(reparented?.data.parentId).toBe(1n);
    // Và cả nhánh dưới nó được viết lại path/depth trong cùng transaction.
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('gỡ danh mục gốc thì con của nó trở thành gốc', async () => {
    const updateCategory = jest.fn(
      (args: { where: { id: bigint }; data: Record<string, unknown> }): Promise<object> => {
        void args;
        return Promise.resolve({});
      },
    );
    const transaction = {
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 2n, parentId: null, status: 'ACTIVE', version: 0n }),
        findMany: jest.fn().mockResolvedValue([{ id: 9n, path: '2/9', depth: 1 }]),
        update: updateCategory,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 2n,
          code: 'R',
          name: 'R',
          slug: 'r',
          path: '2',
          depth: 0,
          description: null,
          imageAssetId: null,
          sortOrder: 0,
          status: 'INACTIVE',
          version: 1n,
          parentId: null,
        }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const { service } = createService(transaction);

    await service.changeCategoryStatus('2', 'INACTIVE', { expectedVersion: 0 }, context);

    expect(updateCategory.mock.calls[0]?.[0].data.parentId).toBeNull();
  });

  it('vẫn chặn kích hoạt lại danh mục khi cha đang ngừng', async () => {
    const transaction = {
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 3n, parentId: 1n, status: 'INACTIVE', version: 0n }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const { service } = createService(transaction);

    await expect(
      service.changeCategoryStatus('3', 'ACTIVE', { expectedVersion: 0 }, context),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
