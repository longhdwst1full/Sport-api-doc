import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { InventoryService } from './inventory.service';

const owner: AuthPrincipal = {
  userId: '00000000-0000-7000-8000-000000000010',
  sessionId: 'session',
  displayName: 'Owner',
  permissionVersion: '1',
  permissions: ['inventory.stock.view', 'inventory.stock.adjust'],
  scopes: [{ type: ScopeType.GLOBAL }],
  mustChangePassword: false,
};

describe('InventoryService', () => {
  it('lists durable balances and derives available/status without Product.quantity', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      id: 'balance',
      onHand: 12,
      reserved: 2,
      reorderPoint: 3,
      warehouse: { code: 'KHO-HCM-01' },
      productVariant: { sku: 'RUN-X1', product: { name: 'Máy chạy bộ' } },
    }]);
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      inventoryBalance: { findMany },
    } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.list(owner)).resolves.toEqual({
      total: 1,
      items: [expect.objectContaining({ onHand: 12, reserved: 2, available: 10, status: 'IN_STOCK' })],
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('replays the exact stored result for the same idempotency key and payload', async () => {
    const result = {
      adjustmentNo: 'ADJ-20260903-ABCDEF12',
      status: 'POSTED',
      reason: 'Nhập tồn đầu kỳ',
      balances: [],
      postedAt: '2026-09-03T00:00:00.000Z',
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: {
        findUnique: jest.fn().mockResolvedValue({
          requestHash: 'e567a853d22adc902a5a83ec1fb4966becb622a18393b67979f69e310f32326f',
          resultJson: result,
        }),
      },
    } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      reason: 'Nhập tồn đầu kỳ',
      items: [{ sku: 'RUN-X1', quantityDelta: 3 }],
    }, 'initial-run-x1', owner, 'request')).resolves.toEqual(result);
  });

  it('rejects an adjustment without items before opening a transaction', async () => {
    const prisma = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);
    await expect(
      service.adjust(
        { warehouseCode: 'KHO-HCM-01', reason: 'Kiểm kê', items: [] },
        'inventory-empty-items',
        owner,
        'request-empty-items',
      ),
    ).rejects.toThrow('Adjustment must contain at least one item');
  });

  it('rejects duplicate SKU lines before persistence mutation', async () => {
    const prisma = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);
    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      reason: 'Kiểm kê',
      items: [
        { sku: 'RUN-X1', quantityDelta: 1 },
        { sku: 'run-x1', quantityDelta: 2 },
      ],
    }, 'duplicate', owner, 'request')).rejects.toBeInstanceOf(BadRequestException);
  });
});
