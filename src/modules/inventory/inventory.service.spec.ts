import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  it('replays the exact stored result for the same idempotency key and payload', async () => {
    const result = {
      adjustmentNo: 'ADJ-20260903-ABCDEF12',
      status: 'POSTED',
      adjustmentType: 'CORRECTION',
      reasonCode: 'MANUAL',
      externalReference: null,
      sourceName: null,
      reason: 'Nhập tồn đầu kỳ',
      balances: [],
      postedAt: '2026-09-03T00:00:00.000Z',
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: {
        findUnique: jest.fn().mockResolvedValue({
          requestHash: '56729759076e36da7b2c06184e208dbc1a09d099883a460f61d7f1a2b9a16ad3',
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

  it('requires one external document reference for a manual receipt', async () => {
    const prisma = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      adjustmentType: 'MANUAL_RECEIPT',
      reasonCode: 'EXTERNAL_RECEIPT',
      reason: 'Nhập hàng từ nhà cung cấp',
      items: [{ sku: 'RUN-X1', quantityDelta: 3 }],
    }, 'receipt-without-reference', owner, 'request')).rejects.toThrow(
      'MANUAL_RECEIPT requires externalReference',
    );
  });

  it('never accepts a negative opening or receipt quantity', async () => {
    const prisma = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      adjustmentType: 'OPENING_BALANCE',
      reasonCode: 'INITIAL_STOCK',
      reason: 'Tồn đầu kỳ',
      items: [{ sku: 'RUN-X1', quantityDelta: -1 }],
    }, 'negative-opening', owner, 'request')).rejects.toThrow(
      'OPENING_BALANCE only accepts positive quantities',
    );
  });

  it('maps a PostgreSQL serialization conflict to a retryable inventory conflict', async () => {
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
        'Transaction write conflict',
        { code: 'P2034', clientVersion: '6.19.3' },
      )),
    } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      reason: 'Điều chỉnh đồng thời',
      items: [{ sku: 'RUN-X1', quantityDelta: 1 }],
    }, 'concurrent-adjustment', owner, 'request')).rejects.toThrow(
      'Inventory changed concurrently; retry with the same key',
    );
  });
});
