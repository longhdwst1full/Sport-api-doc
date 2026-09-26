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
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  version: 2n,
  createdAt: new Date(),
  updatedAt: new Date(),
  fromWarehouse: { id: 1n, code: 'KHO-HCM-01', branchId: 1n },
  toWarehouse: { id: 2n, code: 'KHO-HN-01', branchId: 2n },
  creator: { displayName: 'Owner' },
  shipper: { displayName: 'Owner' },
  receiver: null,
  canceller: null,
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
    }, principal, 'request')).rejects.toMatchObject({ response: { code: 'STOCK_TRANSFER_RECEIVE_QUANTITY_MISMATCH' } });
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

    await expect(service.ship('10', { version: '1' }, principal, 'request')).rejects.toMatchObject({ response: { code: 'STOCK_TRANSFER_CONCURRENT_UPDATE' } });
  });
});

describe('StockTransferService sửa và huỷ phiếu', () => {
  const draft = () => transferRecord({ status: 'DRAFT', submittedAt: null, shippedBy: null, shippedAt: null, shipper: null, version: 0n });

  function createService(record: ReturnType<typeof transferRecord>) {
    const update = jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
      ...record,
      ...data,
      version: record.version + 1n,
      canceller: data.cancelledBy ? { displayName: 'Owner' } : null,
    }));
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      stockTransfer: { findUnique: jest.fn().mockResolvedValue(record), update },
      stockTransferItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      productVariant: { findMany: jest.fn().mockResolvedValue([{ id: 31n, sku: 'RUN-X2', product: { name: 'Giày' } }]) },
    };
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      $transaction: jest.fn((callback: (value: unknown) => unknown) => callback(transaction)),
    } as unknown as PrismaService;
    const auditWrite = jest.fn().mockResolvedValue({});
    return { service: new StockTransferService(prisma, { write: auditWrite } as unknown as AuditWriter), transaction, update, auditWrite };
  }

  it('thay toàn bộ danh sách hàng của phiếu DRAFT và ghi audit before/after', async () => {
    const { service, transaction, update, auditWrite } = createService(draft());

    await service.update('10', { version: '0', items: [{ sku: 'run-x2', requestedQuantity: 4 }] }, principal, 'request');

    expect(transaction.stockTransferItem.deleteMany).toHaveBeenCalledWith({ where: { stockTransferId: 10n } });
    expect(transaction.stockTransferItem.createMany).toHaveBeenCalledWith({
      data: [{ productVariantId: 31n, requestedQty: 4, stockTransferId: 10n }],
    });
    expect((update.mock.calls[0] as unknown as [{ data: unknown }])[0].data).toEqual({ version: { increment: 1 } });
    expect(auditWrite).toHaveBeenCalledWith(expect.objectContaining({
      action: 'inventory.stock_transfer.update',
      before: expect.objectContaining({ items: [{ sku: 'RUN-X1', requestedQuantity: 5 }] }) as unknown,
    }), transaction);
  });

  it('không sửa phiếu đã gửi duyệt', async () => {
    const { service, update } = createService(transferRecord({ status: 'SUBMITTED', shippedAt: null, version: 1n }));

    await expect(service.update('10', { version: '1', reason: 'Lý do mới' }, principal, 'request'))
      .rejects.toMatchObject({ response: { code: 'STOCK_TRANSFER_INVALID_STATUS' } });
    expect(update).not.toHaveBeenCalled();
  });

  it('từ chối lệnh sửa rỗng trước khi mở transaction', async () => {
    const { service, transaction } = createService(draft());

    await expect(service.update('10', { version: '0' }, principal, 'request'))
      .rejects.toMatchObject({ response: { code: 'STOCK_TRANSFER_UPDATE_EMPTY' } });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('submit được phiếu vừa tạo (version 0)', async () => {
    const { service, update } = createService(draft());

    await expect(service.submit('10', { version: '0' }, principal, 'request')).resolves.toMatchObject({ status: 'SUBMITTED' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('từ chối version cũ khi sửa', async () => {
    const { service } = createService(draft());

    await expect(service.update('10', { version: '5', reason: 'Lý do mới' }, principal, 'request'))
      .rejects.toMatchObject({ response: { code: 'STOCK_TRANSFER_VERSION_STALE' } });
  });

  it.each(['DRAFT', 'SUBMITTED'])('huỷ được phiếu %s mà không đụng tồn kho', async (status) => {
    const record = status === 'DRAFT' ? draft() : transferRecord({ status, shippedBy: null, shippedAt: null, version: 0n });
    const { service, update } = createService(record);

    await expect(service.cancel('10', { version: '0', reason: 'Tạo nhầm kho nhận' }, principal, 'request'))
      .resolves.toMatchObject({ status: 'CANCELLED', cancelReason: 'Tạo nhầm kho nhận', cancelledByDisplayName: 'Owner' });
    expect((update.mock.calls[0] as unknown as [{ data: unknown }])[0].data).toMatchObject({ status: 'CANCELLED', cancelledBy: 1n, cancelReason: 'Tạo nhầm kho nhận' });
  });

  it.each(['SHIPPED', 'RECEIVED'])('không huỷ phiếu %s', async (status) => {
    const { service, update } = createService(transferRecord({ status }));

    await expect(service.cancel('10', { version: '2', reason: 'Huỷ muộn' }, principal, 'request'))
      .rejects.toMatchObject({ response: { code: 'STOCK_TRANSFER_CANCEL_AFTER_SHIPPED' } });
    expect(update).not.toHaveBeenCalled();
  });

  it('huỷ lặp lại trả trạng thái hiện tại, không ghi thêm', async () => {
    const { service, update } = createService(transferRecord({
      status: 'CANCELLED', shippedBy: null, shippedAt: null, cancelledBy: 1n, cancelledAt: new Date(),
      cancelReason: 'Tạo nhầm', canceller: { displayName: 'Owner' }, version: 1n,
    }));

    await expect(service.cancel('10', { version: '0', reason: 'Tạo nhầm' }, principal, 'request'))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('không cho chi nhánh khác huỷ phiếu', async () => {
    const { service } = createService(draft());

    await expect(service.cancel('10', { version: '0', reason: 'Tạo nhầm' }, {
      ...principal, scopes: [{ type: ScopeType.BRANCH, branchId: '99' }],
    }, 'request')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
