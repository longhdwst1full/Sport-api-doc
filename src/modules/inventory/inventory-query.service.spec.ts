import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { InventoryQueryService } from './inventory-query.service';

const owner: AuthPrincipal = {
  userId: '1',
  sessionId: 'session',
  displayName: 'Owner',
  permissionVersion: '1',
  permissions: ['inventory.stock.view'],
  scopes: [{ type: ScopeType.GLOBAL }],
  mustChangePassword: false,
};

describe('InventoryQueryService', () => {
  it('paginates durable balances and derives available stock without Product.quantity', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      id: 1n,
      onHand: 12,
      reserved: 2,
      reorderPoint: 3,
      warehouse: { code: 'KHO-HCM-01' },
      productVariant: { sku: 'RUN-X1', product: { name: 'Máy chạy bộ' } },
    }]);
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      inventoryBalance: { findMany, count: jest.fn().mockResolvedValue(1) },
    } as unknown as PrismaService;
    const service = new InventoryQueryService(prisma);

    await expect(service.listBalances({ page: 1, limit: 25 }, owner)).resolves.toEqual({
      total: 1,
      page: 1,
      limit: 25,
      items: [expect.objectContaining({ onHand: 12, reserved: 2, available: 10, status: 'IN_STOCK' })],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {}, skip: 0, take: 25 }));
  });

  it('applies branch scope to movement queries', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      inventoryMovement: { findMany },
    } as unknown as PrismaService;
    const service = new InventoryQueryService(prisma);
    const manager = { ...owner, scopes: [{ type: ScopeType.BRANCH, branchId: '8' }] };

    await service.listMovements({ limit: 25 }, manager);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { warehouse: { branchId: { in: [8n] } } },
    }));
  });

  it('rejects inventory queries without global or branch scope', async () => {
    const service = new InventoryQueryService({
      isEnabled: jest.fn().mockReturnValue(true),
    } as unknown as PrismaService);
    await expect(service.listMovements({ limit: 25 }, { ...owner, scopes: [] }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a malformed ledger cursor before querying', async () => {
    const service = new InventoryQueryService({
      isEnabled: jest.fn().mockReturnValue(true),
    } as unknown as PrismaService);
    await expect(service.listMovements({ limit: 25, cursor: 'invalid' }, owner))
      .rejects.toThrow('Inventory cursor is invalid');
  });

  it('rejects an inverted inventory date range', async () => {
    const service = new InventoryQueryService({
      isEnabled: jest.fn().mockReturnValue(true),
    } as unknown as PrismaService);

    await expect(service.listMovements({
      limit: 25,
      from: '2026-09-06T00:00:00.000Z',
      to: '2026-09-05T00:00:00.000Z',
    }, owner)).rejects.toThrow('Inventory date range is invalid');
  });

  it('lists adjustment history with a stable cursor and branch scope', async () => {
    const postedAt = new Date('2026-09-05T12:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 2n,
        adjustmentNo: 'ADJ-0002',
        adjustmentType: 'MANUAL_ADJUSTMENT',
        reasonCode: 'COUNT_CORRECTION',
        reason: 'Kiểm kê lệch',
        status: 'POSTED',
        createdBy: 1n,
        postedAt,
        warehouse: { code: 'KHO-HCM-01' },
        creator: { displayName: 'Owner' },
        _count: { items: 1 },
      },
      {
        id: 1n,
        adjustmentNo: 'ADJ-0001',
        adjustmentType: 'MANUAL_ADJUSTMENT',
        reasonCode: 'COUNT_CORRECTION',
        reason: 'Dư tồn',
        status: 'POSTED',
        createdBy: 1n,
        postedAt,
        warehouse: { code: 'KHO-HCM-01' },
        creator: { displayName: 'Owner' },
        _count: { items: 1 },
      },
    ]);
    const service = new InventoryQueryService({
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: { findMany },
    } as unknown as PrismaService);
    const manager = { ...owner, scopes: [{ type: ScopeType.BRANCH, branchId: '8' }] };

    const result = await service.listAdjustments({ limit: 1 }, manager);

    expect(result.items).toEqual([expect.objectContaining({ id: '2', itemCount: 1 })]);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { warehouse: { branchId: { in: [8n] } } },
      take: 2,
    }));
  });

  it('returns adjustment detail with item and actor snapshots', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 4n,
      adjustmentNo: 'ADJ-0004',
      adjustmentType: 'MANUAL_ADJUSTMENT',
      reasonCode: 'COUNT_CORRECTION',
      reason: 'Điều chỉnh kiểm kê',
      status: 'POSTED',
      createdBy: 1n,
      postedAt: new Date('2026-09-05T13:00:00.000Z'),
      warehouse: { code: 'KHO-HCM-01' },
      creator: { displayName: 'Owner' },
      _count: { items: 1 },
      items: [{
        id: 5n,
        quantityDelta: -2,
        expectedOnHand: 10,
        actualOnHand: 8,
        note: null,
        productVariant: { sku: 'RUN-X1', product: { name: 'Máy chạy bộ' } },
      }],
    });
    const service = new InventoryQueryService({
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: { findFirst },
    } as unknown as PrismaService);

    await expect(service.getAdjustment('4', owner)).resolves.toEqual(expect.objectContaining({
      id: '4',
      createdBy: '1',
      items: [expect.objectContaining({ id: '5', sku: 'RUN-X1', quantityDelta: -2 })],
    }));
  });
});

/**
 * Ba thẻ trên màn tồn kho trước đây đếm trên `items` của trang hiện tại (25 dòng), nên "12 dòng
 * sắp hết" thực chất là "12 dòng sắp hết trong 25 dòng đang hiện".
 */
describe('InventoryQueryService tổng hợp tồn kho', () => {
  const branchManager: AuthPrincipal = {
    ...owner,
    scopes: [{ type: ScopeType.BRANCH, branchId: '7' }],
  };

  function createService(rows: Array<{ onHand: number; reserved: number; reorderPoint: number }>) {
    const findMany = jest
      .fn<Promise<unknown[]>, [Record<string, unknown>]>()
      .mockResolvedValue(rows);
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      inventoryBalance: { findMany, count: jest.fn().mockResolvedValue(rows.length) },
    } as unknown as PrismaService;
    return { service: new InventoryQueryService(prisma), findMany };
  }

  it('đếm theo toàn bộ dòng khớp bộ lọc và cộng đúng ba tổng', async () => {
    const { service } = createService([
      { onHand: 12, reserved: 2, reorderPoint: 3 }, // available 10 → IN_STOCK
      { onHand: 5, reserved: 2, reorderPoint: 3 }, // available 3 → LOW_STOCK (chạm ngưỡng)
      { onHand: 4, reserved: 4, reorderPoint: 3 }, // available 0 → OUT_OF_STOCK
      { onHand: 9, reserved: 0, reorderPoint: 0 }, // available 9 → IN_STOCK
    ]);

    await expect(service.summarizeBalances({ page: 1, limit: 25 }, owner)).resolves.toEqual({
      trackedBalances: 4,
      inStock: 2,
      lowStock: 1,
      outOfStock: 1,
      totalOnHand: 30,
      totalReserved: 8,
      totalAvailable: 22,
    });
  });

  /** Hết hàng bán là `available = 0`, không phải `onHand = 0`: hàng đang giữ vẫn nằm trong kho. */
  it('phân loại hết hàng theo tồn khả dụng, không theo tồn vật lý', async () => {
    const { service } = createService([{ onHand: 20, reserved: 20, reorderPoint: 5 }]);

    const summary = await service.summarizeBalances({ page: 1, limit: 25 }, owner);

    expect(summary.outOfStock).toBe(1);
    expect(summary.totalOnHand).toBe(20);
    expect(summary.totalAvailable).toBe(0);
  });

  /** Thẻ số liệu và bảng bên dưới phải dùng CÙNG bộ lọc, kể cả phạm vi chi nhánh. */
  it('áp cùng bộ lọc và phạm vi chi nhánh như danh sách', async () => {
    const { service, findMany } = createService([]);

    await service.summarizeBalances(
      { page: 1, limit: 25, search: 'run', warehouseCode: 'kho-hcm-01' },
      branchManager,
    );

    const where = findMany.mock.calls[0]?.[0].where as Record<string, unknown>;
    expect(where.warehouse).toEqual({ branchId: { in: [7n] }, code: 'KHO-HCM-01' });
    expect(where.productVariant).toEqual({
      OR: [
        { sku: { contains: 'run', mode: 'insensitive' } },
        { product: { name: { contains: 'run', mode: 'insensitive' } } },
      ],
    });
  });

  it('không phân trang: tổng không được phụ thuộc trang đang xem', async () => {
    const { service, findMany } = createService([]);

    await service.summarizeBalances({ page: 3, limit: 25 }, owner);

    const call = findMany.mock.calls[0]?.[0];
    expect(call.skip).toBeUndefined();
    expect(call.take).toBeUndefined();
  });
});
