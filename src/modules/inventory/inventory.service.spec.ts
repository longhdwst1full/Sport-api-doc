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
    ).rejects.toMatchObject({ response: { code: 'INVENTORY_ADJUSTMENT_EMPTY' } });
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

  it('limits a branch-scoped adjustment decrease to 10 units per SKU', async () => {
    const prisma = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);
    const branchManager: AuthPrincipal = {
      ...owner,
      displayName: 'Branch Manager',
      scopes: [{ type: ScopeType.BRANCH, branchId: '1' }],
    };

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      reason: 'Giảm tồn vượt ngưỡng chi nhánh',
      items: [{ sku: 'RUN-X1', quantityDelta: -11 }],
    }, 'branch-limit', branchManager, 'request')).rejects.toMatchObject({ response: { code: 'INVENTORY_BRANCH_DECREASE_LIMIT' } });
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
    }, 'receipt-without-reference', owner, 'request')).rejects.toMatchObject({ response: { code: 'INVENTORY_RECEIPT_REFERENCE_REQUIRED' } });
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
    }, 'negative-opening', owner, 'request')).rejects.toMatchObject({ response: { code: 'INVENTORY_POSITIVE_QUANTITY_ONLY' } });
  });

  it('maps a PostgreSQL serialization conflict to a retryable inventory conflict', async () => {
    const transaction = jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      'Transaction write conflict',
      { code: 'P2034', clientVersion: '6.19.3' },
    ));
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      reason: 'Điều chỉnh đồng thời',
      items: [{ sku: 'RUN-X1', quantityDelta: 1 }],
    }, 'concurrent-adjustment', owner, 'request')).rejects.toMatchObject({ response: { code: 'INVENTORY_BALANCE_CHANGED' } });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('retries raw PostgreSQL serialization failures before returning the result', async () => {
    const result = {
      adjustmentNo: 'ADJ-20260921-RETRY',
      status: 'POSTED' as const,
      adjustmentType: 'CORRECTION',
      reasonCode: 'MANUAL',
      externalReference: null,
      sourceName: null,
      reason: 'Điều chỉnh đồng thời',
      balances: [],
      postedAt: '2026-09-21T00:00:00.000Z',
    };
    const serializationError = new Prisma.PrismaClientKnownRequestError(
      'Raw query failed with PostgreSQL serialization code',
      { code: 'P2010', clientVersion: '6.19.3', meta: { code: '40001' } },
    );
    const transaction = jest.fn()
      .mockRejectedValueOnce(serializationError)
      .mockRejectedValueOnce(serializationError)
      .mockResolvedValueOnce(result);
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      reason: 'Điều chỉnh đồng thời',
      items: [{ sku: 'RUN-X1', quantityDelta: 1 }],
    }, 'raw-serialization-retry', owner, 'request')).resolves.toEqual(result);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      }),
    );
  });

  it.each(['P2024', 'P2028'])('maps transient database error %s to service unavailable', async (code) => {
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockAdjustment: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
        'Transient database error',
        { code, clientVersion: '6.19.3' },
      )),
    } as unknown as PrismaService;
    const service = new InventoryService(prisma, {} as AuditWriter);

    await expect(service.adjust({
      warehouseCode: 'KHO-HCM-01',
      reason: 'Điều chỉnh khi kết nối bận',
      items: [{ sku: 'RUN-X1', quantityDelta: 1 }],
    }, `transient-${code}`, owner, 'request')).rejects.toThrow(
      'Kho dữ liệu tồn kho đang bận hoặc tạm thời mất kết nối',
    );
  });
});
