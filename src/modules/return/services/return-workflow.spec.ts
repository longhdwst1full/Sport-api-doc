import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../database/prisma.service';
import type { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ScopeType } from '../../iam/iam.types';
import type { OutboxWriter } from '../../notification/outbox.writer';
import type { LoadedReturn } from './return-store';
import { ReturnStore } from './return-store';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { SystemParameterService } from '../../system/parameters/system-parameter.service';
import { RETURN_ERROR_CODE } from '../return.constants';
import { RefundService } from './refund.service';
import { ReturnService } from './return.service';

/** Spec use case Return/Refund trên Prisma giả: kiểm luật trong transaction, không kiểm SQL thật. */
const D = (value: string | number) => new Prisma.Decimal(value);

function principalWith(permissions: string[]): AuthPrincipal {
  return {
    userId: '10',
    sessionId: '1',
    displayName: 'Nhân viên',
    permissionVersion: '1',
    permissions,
    scopes: [{ type: ScopeType.GLOBAL }],
    mustChangePassword: false,
  };
}

type RefundRow = LoadedReturn['refunds'][number];

function refundRow(overrides: Partial<RefundRow>): RefundRow {
  return {
    id: 70n,
    refundNo: 'RF-20260924-000070',
    returnRequestId: 1n,
    paymentId: 50n,
    method: 'BANK_TRANSFER',
    amount: D('100000'),
    currencyCode: 'VND',
    status: 'PENDING',
    externalRef: null,
    note: null,
    idempotencyKey: 'k',
    requestHash: 'h',
    requestedBy: 10n,
    processedBy: null,
    processedAt: null,
    failureReason: null,
    version: 0n,
    createdAt: new Date('2026-09-24T01:00:00Z'),
    updatedAt: new Date('2026-09-24T01:00:00Z'),
    ...overrides,
  };
}

function loadedReturn(overrides: {
  status?: string;
  version?: bigint;
  fault?: string | null;
  refundCap?: Prisma.Decimal | null;
  refunds?: RefundRow[];
  paymentRefunds?: { id: bigint; amount: Prisma.Decimal; status: string }[];
  payment?: { method?: string; status?: string; receivedAmount?: Prisma.Decimal } | null;
  history?: { idempotencyKey: string | null; requestHash: string | null }[];
  items?: LoadedReturn['items'];
} = {}): LoadedReturn {
  const now = new Date('2026-09-24T01:00:00Z');
  const refunds = overrides.refunds ?? [];
  const payment = overrides.payment === null
    ? null
    : {
        id: 50n,
        method: overrides.payment?.method ?? 'BANK_TRANSFER',
        status: overrides.payment?.status ?? 'SUCCESS',
        receivedAmount: overrides.payment?.receivedAmount ?? D('1030000'),
        version: 1n,
        refunds: overrides.paymentRefunds ?? refunds.map(({ id, amount, status }) => ({ id, amount, status })),
      };
  return {
    id: 1n,
    returnNo: 'RMA-20260924-000001',
    orderId: 9n,
    customerId: 3n,
    branchId: 2n,
    warehouseId: 4n,
    status: overrides.status ?? 'RECEIVED',
    channel: 'ADMIN',
    reasonCode: 'DEFECTIVE',
    description: null,
    evidenceUrls: null,
    fault: overrides.fault === undefined ? 'SHOP' : overrides.fault,
    deliveredAt: now,
    windowOverrideBy: null,
    windowOverrideNote: null,
    refundCap: overrides.refundCap === undefined ? D('530000') : overrides.refundCap,
    idempotencyKey: 'create-key',
    requestHash: 'create-hash',
    createdBy: 10n,
    decidedBy: 10n,
    decidedAt: now,
    decisionNote: null,
    receivedBy: 10n,
    receivedAt: now,
    closedAt: null,
    version: overrides.version ?? 3n,
    createdAt: now,
    updatedAt: now,
    order: {
      id: 9n,
      orderNo: 'DH-0009',
      shippingTotal: D('30000'),
      addresses: [
        {
          id: 1n,
          orderId: 9n,
          addressType: 'SHIPPING',
          recipientName: 'Nguyễn Văn A',
          recipientPhone: '0912345678',
          recipientEmail: 'a@example.com',
          addressLine: '12 Nguyễn Trãi',
          wardCode: null,
          wardName: null,
          districtCode: null,
          districtName: null,
          provinceCode: '79',
          provinceName: 'TP HCM',
          postalCode: null,
          countryCode: 'VN',
        },
      ],
      payment,
    },
    items: overrides.items ?? [],
    refunds,
    history: (overrides.history ?? []).map((entry, index) => ({
      id: BigInt(index + 1),
      returnRequestId: 1n,
      sequenceNo: index + 1,
      action: 'CREATE',
      fromStatus: null,
      toStatus: 'REQUESTED',
      reason: null,
      actorType: 'USER',
      actorId: 10n,
      requestId: 'r',
      idempotencyKey: entry.idempotencyKey,
      requestHash: entry.requestHash,
      createdAt: now,
    })),
  };
}

function returnItem(overrides: {
  id: bigint;
  quantity: number;
  orderQuantity: number;
  lineTotal: string;
  itemType?: string;
  variantId?: bigint;
  components?: { componentVariantId: bigint; quantityPerBundle: number }[];
}): LoadedReturn['items'][number] {
  return {
    id: overrides.id,
    returnRequestId: 1n,
    orderItemId: overrides.id + 100n,
    quantity: overrides.quantity,
    condition: null,
    disposition: null,
    restockQty: 0,
    refundCap: null,
    note: null,
    orderItem: {
      id: overrides.id + 100n,
      productVariantId: overrides.variantId ?? 7n,
      itemType: overrides.itemType ?? 'STANDARD',
      skuSnapshot: `SKU-${overrides.id}`,
      productNameSnapshot: 'Vợt cầu lông',
      variantNameSnapshot: 'Mặc định',
      quantity: overrides.orderQuantity,
      finalUnitPrice: D(overrides.lineTotal).div(overrides.orderQuantity),
      lineTotal: D(overrides.lineTotal),
      components: overrides.components ?? [],
    },
  };
}

/**
 * Prisma giả: `$transaction` chạy callback với cùng một client; `returnRequest.findFirst` và
 * `findUniqueOrThrow` trả phiếu hiện tại. Mọi lệnh ghi là jest.fn để spec kiểm tra.
 */
function buildStore(current: LoadedReturn, extra: Record<string, unknown> = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    returnRequest: {
      findFirst: jest.fn().mockResolvedValue(current),
      findUniqueOrThrow: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue(current),
      count: jest.fn().mockResolvedValue(0),
    },
    returnStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    returnItem: { update: jest.fn().mockResolvedValue({}) },
    refund: {
      create: jest.fn().mockResolvedValue({ id: 71n }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payment: { update: jest.fn().mockResolvedValue({}) },
    order: { update: jest.fn().mockResolvedValue({}) },
    inventoryBalance: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    ...extra,
  };
  const prisma = {
    isEnabled: () => true,
    $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    ...tx,
  } as unknown as PrismaService;
  const audit = { write: jest.fn().mockResolvedValue({}) };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  const store = new ReturnStore(prisma, audit as unknown as AuditWriter, outbox as unknown as OutboxWriter);
  return { store, tx, audit, outbox, prisma };
}

function codeOf(error: unknown): string | undefined {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return typeof response === 'object' && response !== null ? (response as { code?: string }).code : undefined;
}

type WriteCall = [{ where?: { id?: bigint }; data: Record<string, unknown> }];

/** Đối số `data` của lần gọi thứ `index` tới một lệnh ghi Prisma giả. */
function written(mock: jest.Mock, index = 0): Record<string, unknown> {
  return (mock.mock.calls as WriteCall[])[index][0].data;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected rejection');
}

const refundPermissions = principalWith(['payment.refund.request', 'payment.refund.approve']);

describe('RefundService.request', () => {
  const input = { expectedVersion: '3', method: 'BANK_TRANSFER', amount: '100000' };

  it('creates a pending refund within the remaining amount', async () => {
    const { store, tx, audit } = buildStore(loadedReturn());
    await new RefundService(store).request('1', input, 'refund-key-01', 'req-1', refundPermissions);

    expect(tx.refund.create).toHaveBeenCalledTimes(1);
    expect(written(tx.refund.create)).toMatchObject({ method: 'BANK_TRANSFER', paymentId: 50n });
    expect(written(tx.returnStatusHistory.create)).toMatchObject({
      action: 'REFUND_REQUEST',
      idempotencyKey: 'refund-key-01',
    });
    expect(audit.write).toHaveBeenCalledTimes(1);
  });

  it('rejects an amount above the return cap minus refunds already counted', async () => {
    const current = loadedReturn({ refunds: [refundRow({ status: 'SUCCEEDED', amount: D('500000') })] });
    const { store, tx } = buildStore(current);
    const error = await rejection(
      new RefundService(store).request('1', { ...input, amount: '30000.01' }, 'refund-key-02', 'req', refundPermissions),
    );
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.REFUND_EXCEEDS_REMAINING);
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('rejects a second pending refund on the same return', async () => {
    const { store } = buildStore(loadedReturn({ refunds: [refundRow({ status: 'PENDING' })] }));
    const error = await rejection(new RefundService(store).request('1', input, 'refund-key-03', 'req', refundPermissions));
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.REFUND_PENDING_EXISTS);
  });

  it('refuses to refund an order whose payment was never collected', async () => {
    const { store } = buildStore(loadedReturn({ payment: { method: 'COD', status: 'AWAITING_CONFIRMATION' } }));
    const error = await rejection(
      new RefundService(store).request('1', { ...input, method: 'CASH' }, 'refund-key-04', 'req', refundPermissions),
    );
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.REFUND_PAYMENT_NOT_SUCCESS);
  });

  it('refuses cash for a VNPay order (D58)', async () => {
    const { store } = buildStore(loadedReturn({ payment: { method: 'VNPAY' } }));
    const error = await rejection(
      new RefundService(store).request('1', { ...input, method: 'CASH' }, 'refund-key-05', 'req', refundPermissions),
    );
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.REFUND_METHOD_NOT_ALLOWED);
  });

  it('replays the same key and payload without creating another refund', async () => {
    const probe = buildStore(loadedReturn());
    const hash = probe.store.intent('refund-key-06', 'REFUND_REQUEST', '1', input).hash;
    const { store, tx } = buildStore(loadedReturn({ history: [{ idempotencyKey: 'refund-key-06', requestHash: hash }] }));

    const result = await new RefundService(store).request('1', input, 'refund-key-06', 'req', refundPermissions);

    expect(result.returnNo).toBe('RMA-20260924-000001');
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('rejects the same key with a different payload', async () => {
    const { store, tx } = buildStore(
      loadedReturn({ history: [{ idempotencyKey: 'refund-key-07', requestHash: 'other-payload-hash' }] }),
    );
    const error = await rejection(new RefundService(store).request('1', input, 'refund-key-07', 'req', refundPermissions));
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.IDEMPOTENCY_CONFLICT);
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('rejects a stale version', async () => {
    const { store } = buildStore(loadedReturn({ version: 4n }));
    const error = await rejection(new RefundService(store).request('1', input, 'refund-key-08', 'req', refundPermissions));
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.VERSION_CONFLICT);
  });

  it('only refunds after the goods were received', async () => {
    const { store } = buildStore(loadedReturn({ status: 'APPROVED', refundCap: null }));
    const error = await rejection(new RefundService(store).request('1', input, 'refund-key-09', 'req', refundPermissions));
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.INVALID_TRANSITION);
  });
});

describe('RefundService.confirm', () => {
  it('requires a bank reference for a transfer', async () => {
    const { store, tx } = buildStore(loadedReturn({ refunds: [refundRow({})] }));
    const error = await rejection(
      new RefundService(store).confirm('1', '70', { expectedVersion: '3' }, 'confirm-key-1', 'req', refundPermissions),
    );
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.REFUND_REFERENCE_REQUIRED);
    expect(tx.refund.update).not.toHaveBeenCalled();
  });

  it('requires the cashier to confirm cash was handed over', async () => {
    const { store } = buildStore(
      loadedReturn({ payment: { method: 'COD' }, refunds: [refundRow({ method: 'CASH' })] }),
    );
    const error = await rejection(
      new RefundService(store).confirm('1', '70', { expectedVersion: '3' }, 'confirm-key-2', 'req', refundPermissions),
    );
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.REFUND_REFERENCE_REQUIRED);
  });

  it('rejects a bank reference already used by another refund', async () => {
    const { store } = buildStore(loadedReturn({ refunds: [refundRow({})] }));
    (store.client as unknown as { refund: { findFirst: jest.Mock } }).refund.findFirst.mockResolvedValue({
      refundNo: 'RF-20260920-000011',
    });
    const error = await rejection(
      new RefundService(store).confirm('1', '70', { expectedVersion: '3', externalRef: 'FT123' }, 'confirm-key-3', 'req', refundPermissions),
    );
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.REFUND_REFERENCE_USED);
  });

  it('marks the return REFUNDED and the payment REFUNDED once everything was paid back', async () => {
    const current = loadedReturn({
      refundCap: D('1030000'),
      payment: { receivedAmount: D('1030000') },
      refunds: [refundRow({ amount: D('1030000') })],
    });
    const { store, tx, outbox } = buildStore(current);

    await new RefundService(store).confirm('1', '70', { expectedVersion: '3', externalRef: 'FT123' }, 'confirm-key-4', 'req', refundPermissions);

    expect(written(tx.refund.update)).toMatchObject({ status: 'SUCCEEDED', externalRef: 'FT123' });
    expect(written(tx.returnRequest.update)).toMatchObject({ status: 'REFUNDED' });
    expect(written(tx.payment.update)).toMatchObject({ status: 'REFUNDED' });
    expect(written(tx.order.update)).toMatchObject({ paymentStatus: 'REFUNDED' });
    expect(outbox.append).toHaveBeenCalledTimes(1);
  });

  it('keeps the payment SUCCESS after a partial refund', async () => {
    const { store, tx } = buildStore(loadedReturn({ refunds: [refundRow({ amount: D('100000') })] }));

    await new RefundService(store).confirm('1', '70', { expectedVersion: '3', externalRef: 'FT124' }, 'confirm-key-5', 'req', refundPermissions);

    expect(written(tx.returnRequest.update)).toMatchObject({ status: 'RECEIVED' });
    expect(tx.payment.update).not.toHaveBeenCalled();
  });
});

describe('ReturnService.receive', () => {
  const receiver = principalWith(['return.receive']);
  const parameters = { getInteger: jest.fn().mockResolvedValue(7) } as unknown as SystemParameterService;

  it('restocks SELLABLE combo components and never DAMAGED lines', async () => {
    const current = loadedReturn({
      status: 'APPROVED',
      refundCap: null,
      items: [
        returnItem({
          id: 1n, quantity: 1, orderQuantity: 1, lineTotal: '500000', itemType: 'BUNDLE',
          components: [{ componentVariantId: 21n, quantityPerBundle: 2 }, { componentVariantId: 22n, quantityPerBundle: 1 }],
        }),
        returnItem({ id: 2n, quantity: 1, orderQuantity: 2, lineTotal: '60000', variantId: 23n }),
      ],
    });
    const { store, tx } = buildStore(current);
    tx.inventoryBalance.findMany.mockResolvedValue([
      { id: 1n, productVariantId: 21n, onHand: 5 },
      { id: 2n, productVariantId: 22n, onHand: 5 },
    ]);

    await new ReturnService(store, parameters).receive('1', {
      expectedVersion: '3',
      items: [
        { returnItemId: '1', condition: 'SELLABLE' },
        { returnItemId: '2', condition: 'DAMAGED', disposition: 'HOLD' },
      ],
    }, 'receive-key-1', 'req', receiver);

    const movements = (tx.inventoryMovement.create.mock.calls as WriteCall[]).map((call) => call[0].data);
    expect(movements).toEqual([
      expect.objectContaining({ productVariantId: 21n, quantityDelta: 2, movementType: 'RETURN_RESTOCK', warehouseId: 4n }),
      expect.objectContaining({ productVariantId: 22n, quantityDelta: 1, movementType: 'RETURN_RESTOCK', warehouseId: 4n }),
    ]);
    const damaged = (tx.returnItem.update.mock.calls as WriteCall[]).find((call) => call[0].where?.id === 2n)?.[0].data;
    expect(damaged).toMatchObject({ disposition: 'HOLD', restockQty: 0 });
    // Trần: combo 500.000 + nửa dòng 60.000 = 30.000 + phí giao 30.000 vì lỗi shop.
    expect((written(tx.returnRequest.update).refundCap as Prisma.Decimal).toFixed(2)).toBe('560000.00');
  });

  it('requires an inspection result for every line', async () => {
    const current = loadedReturn({
      status: 'APPROVED',
      refundCap: null,
      items: [
        returnItem({ id: 1n, quantity: 1, orderQuantity: 1, lineTotal: '100000' }),
        returnItem({ id: 2n, quantity: 1, orderQuantity: 1, lineTotal: '100000' }),
      ],
    });
    const { store, tx } = buildStore(current);
    const error = await rejection(new ReturnService(store, parameters).receive('1', {
      expectedVersion: '3',
      items: [{ returnItemId: '1', condition: 'SELLABLE' }],
    }, 'receive-key-2', 'req', receiver));
    expect(codeOf(error)).toBe(RETURN_ERROR_CODE.INVALID_INSPECTION);
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe('ReturnService.createAdmin guards', () => {
  const parameters = { getInteger: jest.fn().mockResolvedValue(7) } as unknown as SystemParameterService;
  const input = {
    orderId: '9',
    reasonCode: 'DEFECTIVE',
    items: [{ orderItemId: '101', quantity: 1 }],
  };

  function storeWithOrder() {
    const built = buildStore(loadedReturn(), { order: { findFirst: jest.fn().mockResolvedValue({ id: 9n }) } });
    return built.store;
  }

  it('forbids a window override without the override permission', async () => {
    const error = await rejection(new ReturnService(storeWithOrder(), parameters).createAdmin(
      { ...input, windowOverrideNote: 'Khách quen, lỗi sản xuất' },
      'create-key-1',
      'req',
      principalWith(['return.create']),
    ));
    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('requires a fault when the creator can approve (D56 auto-approval)', async () => {
    const error = await rejection(new ReturnService(storeWithOrder(), parameters).createAdmin(
      input,
      'create-key-2',
      'req',
      principalWith(['return.create', 'return.decide']),
    ));
    expect(error).toBeInstanceOf(BadRequestException);
  });
});
