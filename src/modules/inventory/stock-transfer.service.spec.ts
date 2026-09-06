import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { StockTransferService } from './stock-transfer.service';

const principal: AuthPrincipal = {
  userId: '1',
  sessionId: 'session',
  displayName: 'Owner',
  permissionVersion: '1',
  permissions: [],
  scopes: [{ type: ScopeType.GLOBAL }],
  mustChangePassword: false,
};

const transferRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 10n,
  transferNo: 'TRF-TEST',
  fromWarehouseId: 1n,
  toWarehouseId: 2n,
  status: 'SHIPPED',
  reason: 'Điều chuyển phục vụ bán hàng',
  idempotencyKey: 'transfer-test',
  requestHash: 'hash',
  createdBy: 1n,
  submittedAt: new Date(),
  shippedBy: 1n,
  shippedAt: new Date(),
  receivedBy: null,
  receivedAt: null,
  version: 2n,
  createdAt: new Date(),
  updatedAt: new Date(),
  fromWarehouse: { id: 1n, code: 'KHO-HCM-01', branchId: 1n },
  toWarehouse: { id: 2n, code: 'KHO-HN-01', branchId: 2n },
  creator: { displayName: 'Owner' },
  shipper: { displayName: 'Owner' },
  receiver: null,
  items: [{
    id: 20n,
    stockTransferId: 10n,
    productVariantId: 30n,
    requestedQty: 5,
    shippedQty: 5,
    receivedQty: 0,
    damagedQty: 0,
    damageReason: null,
    productVariant: { sku: 'RUN-X1', product: { name: 'Giày chạy bộ' } },
  }],
  ...overrides,
});

describe('StockTransferService', () => {
  it('rejects duplicate SKU lines before opening a transaction', async () => {
    const prisma = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as PrismaService;
    const service = new StockTransferService(prisma, {} as AuditWriter);
    await expect(service.create({
      fromWarehouseCode: 'KHO-HCM-01',
      toWarehouseCode: 'KHO-HN-01',
      reason: 'Điều chuyển',
      items: [
        { sku: 'RUN-X1', requestedQuantity: 1 },
        { sku: 'run-x1', requestedQuantity: 2 },
      ],
    }, 'duplicate', principal, 'request')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces source branch scope when creating a transfer', async () => {
    const transaction = {
      warehouse: { findMany: jest.fn().mockResolvedValue([
        { id: 1n, code: 'KHO-HCM-01', branchId: 1n },
        { id: 2n, code: 'KHO-HN-01', branchId: 2n },
      ]) },
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockTransfer: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (value: unknown) => unknown) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new StockTransferService(prisma, {} as AuditWriter);
    await expect(service.create({
      fromWarehouseCode: 'KHO-HCM-01',
      toWarehouseCode: 'KHO-HN-01',
      reason: 'Điều chuyển',
      items: [{ sku: 'RUN-X1', requestedQuantity: 1 }],
    }, 'wrong-scope', { ...principal, scopes: [{ type: ScopeType.BRANCH, branchId: '99' }] }, 'request'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires received plus damaged quantity to equal the full shipment', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      stockTransfer: { findUnique: jest.fn().mockResolvedValue(transferRecord()) },
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      $transaction: jest.fn((callback: (value: unknown) => unknown) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new StockTransferService(prisma, {} as AuditWriter);
    await expect(service.receive('10', {
      version: '2',
      items: [{ sku: 'RUN-X1', receivedQuantity: 3, damagedQuantity: 1 }],
    }, principal, 'request')).rejects.toThrow(
      'receivedQuantity + damagedQuantity must equal shippedQuantity for RUN-X1',
    );
  });

  it('rejects shipping when source available stock is insufficient', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      stockTransfer: { findUnique: jest.fn().mockResolvedValue(transferRecord({ status: 'SUBMITTED', version: 1n })) },
      inventoryBalance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      $transaction: jest.fn((callback: (value: unknown) => unknown) => callback(transaction)),
    } as unknown as PrismaService;
    const service = new StockTransferService(prisma, {} as AuditWriter);
    await expect(service.ship('10', { version: '1' }, principal, 'request'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('adds only sellable received quantity to destination stock and records damage', async () => {
    const receivedRecord = transferRecord({
      status: 'RECEIVED',
      version: 3n,
      receivedBy: 1n,
      receivedAt: new Date(),
      receiver: { displayName: 'Owner' },
      items: [{
        ...transferRecord().items[0],
        receivedQty: 4,
        damagedQty: 1,
        damageReason: 'Vỡ hộp khi vận chuyển',
      }],
    });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      stockTransfer: {
        findUnique: jest.fn().mockResolvedValue(transferRecord()),
        update: jest.fn().mockResolvedValue(receivedRecord),
      },
      stockTransferItem: { update: jest.fn().mockResolvedValue({}) },
      inventoryBalance: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([{ id: 40n, productVariantId: 30n, onHand: 7, reserved: 0, version: 1n }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      $transaction: jest.fn((callback: (value: unknown) => unknown) => callback(transaction)),
    } as unknown as PrismaService;
    const audit = { write: jest.fn().mockResolvedValue(undefined) } as unknown as AuditWriter;
    const service = new StockTransferService(prisma, audit);

    const result = await service.receive('10', {
      version: '2',
      items: [{
        sku: 'RUN-X1',
        receivedQuantity: 4,
        damagedQuantity: 1,
        damageReason: 'Vỡ hộp khi vận chuyển',
      }],
    }, principal, 'request');

    const balanceCalls = transaction.inventoryBalance.updateMany.mock.calls as unknown as Array<[{
      data: { onHand: number };
    }]>;
    const movementCalls = transaction.inventoryMovement.create.mock.calls as unknown as Array<[{
      data: { movementType: string; quantityDelta: number; balanceAfter: number };
    }]>;
    const itemCalls = transaction.stockTransferItem.update.mock.calls as unknown as Array<[{
      data: { receivedQty: number; damagedQty: number };
    }]>;
    const balanceUpdate = balanceCalls[0][0];
    const movementCreate = movementCalls[0][0];
    const itemUpdate = itemCalls[0][0];
    expect(balanceUpdate.data.onHand).toBe(11);
    expect(movementCreate.data).toMatchObject({
      movementType: 'TRANSFER_IN', quantityDelta: 4, balanceAfter: 11,
    });
    expect(itemUpdate.data).toMatchObject({ receivedQty: 4, damagedQty: 1 });
    expect(result).toMatchObject({ status: 'RECEIVED', items: [{ receivedQuantity: 4, damagedQuantity: 1 }] });
  });

  it('maps a PostgreSQL serialization failure to a retryable transfer conflict', async () => {
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      $transaction: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
        'Transaction write conflict',
        { code: 'P2034', clientVersion: '6.19.3' },
      )),
    } as unknown as PrismaService;
    const service = new StockTransferService(prisma, {} as AuditWriter);

    await expect(service.ship('10', { version: '1' }, principal, 'request')).rejects.toThrow(
      'Inventory changed concurrently; retry the transfer command',
    );
  });
});
