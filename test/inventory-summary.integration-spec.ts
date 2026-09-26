import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import type { AuthPrincipal } from '../src/modules/auth/auth.types';
import { ScopeType } from '../src/modules/iam/iam.types';
import { classifyInventoryBalance } from '../src/modules/inventory/inventory.constants';
import { InventoryQueryService } from '../src/modules/inventory/inventory-query.service';

/**
 * Tổng hợp tồn kho gộp bằng SQL; bài test này chứng minh trên PostgreSQL thật rằng số liệu gộp khớp
 * từng dòng phân loại bằng `classifyInventoryBalance` và cùng bộ lọc với danh sách.
 */
describe('Inventory balance summary aggregates in PostgreSQL', () => {
  const cleanup = new PrismaClient();
  const marker = `invsum${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      return undefined;
    }),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const service = new InventoryQueryService(prisma);
  const rows = [
    { onHand: 12, reserved: 2, reorderPoint: 3 }, // IN_STOCK
    { onHand: 5, reserved: 2, reorderPoint: 3 }, // LOW_STOCK (chạm ngưỡng)
    { onHand: 4, reserved: 4, reorderPoint: 3 }, // OUT_OF_STOCK dù on_hand > 0
    { onHand: 9, reserved: 0, reorderPoint: 0 }, // IN_STOCK
    { onHand: 0, reserved: 0, reorderPoint: 0 }, // OUT_OF_STOCK
  ];

  let branchId = 0n;
  let warehouseId = 0n;
  let productId = 0n;
  const variantIds: bigint[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    branchId = (await cleanup.branch.create({
      data: { code: marker.toUpperCase().slice(0, 32), name: 'Inventory summary branch', addressJson: {} },
    })).id;
    warehouseId = (await cleanup.warehouse.create({
      data: { branchId, code: `${marker}wh`.toUpperCase().slice(0, 32), name: 'Inventory summary warehouse' },
    })).id;
    productId = (await cleanup.product.create({
      data: { productNo: `${marker}p`.toUpperCase().slice(0, 32), name: `Summary ${marker}`, slug: marker },
    })).id;
    for (const [index, row] of rows.entries()) {
      const variant = await cleanup.productVariant.create({
        data: { productId, sku: `${marker}-${index}`.toUpperCase(), name: `v${index}` },
      });
      variantIds.push(variant.id);
      await cleanup.inventoryBalance.create({ data: { warehouseId, productVariantId: variant.id, ...row } });
    }
  });

  afterAll(async () => {
    await cleanup.inventoryBalance.deleteMany({ where: { productVariantId: { in: variantIds } } });
    await cleanup.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    if (productId) await cleanup.product.delete({ where: { id: productId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  const principal = (scopes: AuthPrincipal['scopes']) => ({
    userId: '1', sessionId: 'integration', displayName: 'Integration', permissionVersion: '1',
    permissions: [], scopes, mustChangePassword: false,
  }) as AuthPrincipal;

  it('matches per-row classification and the list filter', async () => {
    const query = { page: 1, limit: 100, search: marker };
    const owner = principal([{ type: ScopeType.GLOBAL }]);
    const expected = { inStock: 0, lowStock: 0, outOfStock: 0 };
    for (const row of rows) {
      const status = classifyInventoryBalance(row);
      if (status === 'IN_STOCK') expected.inStock += 1;
      if (status === 'LOW_STOCK') expected.lowStock += 1;
      if (status === 'OUT_OF_STOCK') expected.outOfStock += 1;
    }

    const summary = await service.summarizeBalances(query, owner);
    const list = await service.listBalances(query, owner);

    expect(summary).toEqual({
      trackedBalances: rows.length,
      ...expected,
      totalOnHand: 30,
      totalReserved: 8,
      totalAvailable: 22,
    });
    expect(list.total).toBe(summary.trackedBalances);
  });

  it('counts nothing outside the assigned branch', async () => {
    const otherBranch = principal([{ type: ScopeType.BRANCH, branchId: String(branchId + 1_000_000n) }]);

    await expect(service.summarizeBalances({ page: 1, limit: 100, search: marker }, otherBranch))
      .resolves.toMatchObject({ trackedBalances: 0, totalOnHand: 0 });
  });
});
