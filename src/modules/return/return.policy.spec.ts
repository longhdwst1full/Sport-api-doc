import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RETURN_ACTION, RETURN_ERROR_CODE, RETURN_STATUS } from './return.constants';
import {
  allowedRefundMethods,
  assertRefundMethod,
  assertRequestedLines,
  assertTransition,
  estimateRequestedRefund,
  evaluateEligibility,
  isWithinReturnWindow,
  lineRefundCap,
  refundableRemaining,
  resolveInspection,
  returnRefundCap,
  type RequestedLine,
} from './return.policy';

const D = (value: string | number) => new Prisma.Decimal(value);

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    const body = (error as ConflictException).getResponse() as { code?: string };
    return body.code;
  }
  return undefined;
}

describe('return transition matrix', () => {
  const statuses = Object.values(RETURN_STATUS);
  const allowed: Record<string, Record<string, string>> = {
    [RETURN_ACTION.APPROVE]: { REQUESTED: 'APPROVED' },
    [RETURN_ACTION.REJECT]: { REQUESTED: 'REJECTED' },
    [RETURN_ACTION.CANCEL]: { REQUESTED: 'CANCELLED', APPROVED: 'CANCELLED' },
    [RETURN_ACTION.RECEIVE]: { APPROVED: 'RECEIVED' },
    [RETURN_ACTION.REFUND_REQUEST]: { RECEIVED: 'RECEIVED' },
    [RETURN_ACTION.REFUND_CONFIRM]: { RECEIVED: 'RECEIVED' },
    [RETURN_ACTION.REFUND_FAIL]: { RECEIVED: 'RECEIVED' },
    [RETURN_ACTION.CLOSE]: { RECEIVED: 'CLOSED', REFUNDED: 'CLOSED' },
  };

  for (const [action, matrix] of Object.entries(allowed)) {
    for (const status of statuses) {
      const expected = matrix[status];
      it(`${action} from ${status} ${expected ? `→ ${expected}` : 'is rejected'}`, () => {
        const run = () => assertTransition(status, action as Parameters<typeof assertTransition>[1]);
        if (expected) expect(run()).toBe(expected);
        else expect(errorCode(run)).toBe(RETURN_ERROR_CODE.INVALID_TRANSITION);
      });
    }
  }
});

describe('return window (D54)', () => {
  const deliveredAt = new Date('2026-09-01T10:00:00Z');

  it('accepts a request on the last instant of the window', () => {
    expect(isWithinReturnWindow(deliveredAt, new Date('2026-09-08T10:00:00Z'), 7)).toBe(true);
  });

  it('rejects a request one millisecond after the window', () => {
    expect(isWithinReturnWindow(deliveredAt, new Date('2026-09-08T10:00:00.001Z'), 7)).toBe(false);
  });
});

describe('requested lines', () => {
  const line = (overrides: Partial<RequestedLine>): RequestedLine => ({
    orderItemId: '1',
    quantity: 1,
    purchasedQuantity: 3,
    alreadyReturnedQuantity: 0,
    isBundle: false,
    label: 'SKU-1',
    ...overrides,
  });

  it('allows a partial return of a standard line', () => {
    expect(() => assertRequestedLines([line({ quantity: 2 })])).not.toThrow();
  });

  it('counts quantities already on other returns', () => {
    expect(errorCode(() => assertRequestedLines([line({ quantity: 2, alreadyReturnedQuantity: 2 })])))
      .toBe(RETURN_ERROR_CODE.QUANTITY_EXCEEDED);
  });

  it('rejects a partial combo return', () => {
    expect(errorCode(() => assertRequestedLines([line({ isBundle: true, quantity: 1, purchasedQuantity: 2 })])))
      .toBe(RETURN_ERROR_CODE.PARTIAL_COMBO);
  });

  it('accepts a combo return of every remaining set', () => {
    expect(() =>
      assertRequestedLines([line({ isBundle: true, quantity: 1, purchasedQuantity: 2, alreadyReturnedQuantity: 1 })]),
    ).not.toThrow();
  });

  it('rejects an empty or duplicated request', () => {
    expect(() => assertRequestedLines([])).toThrow(BadRequestException);
    expect(() => assertRequestedLines([line({}), line({})])).toThrow(BadRequestException);
  });
});

describe('inspection', () => {
  it('always restocks SELLABLE', () => {
    expect(resolveInspection('SELLABLE')).toEqual({ disposition: 'RESTOCK', restock: true });
    expect(errorCode(() => resolveInspection('SELLABLE', 'HOLD'))).toBe(RETURN_ERROR_CODE.INVALID_INSPECTION);
  });

  it('never restocks DAMAGED and requires an explicit disposition', () => {
    expect(resolveInspection('DAMAGED', 'HOLD')).toEqual({ disposition: 'HOLD', restock: false });
    expect(resolveInspection('DAMAGED', 'WRITE_OFF')).toEqual({ disposition: 'WRITE_OFF', restock: false });
    expect(errorCode(() => resolveInspection('DAMAGED'))).toBe(RETURN_ERROR_CODE.INVALID_INSPECTION);
    expect(errorCode(() => resolveInspection('DAMAGED', 'RESTOCK'))).toBe(RETURN_ERROR_CODE.INVALID_INSPECTION);
  });

  it('writes MISSING off', () => {
    expect(resolveInspection('MISSING')).toEqual({ disposition: 'WRITE_OFF', restock: false });
  });
});

describe('refund caps', () => {
  it('uses the full line total when the whole line comes back', () => {
    expect(lineRefundCap(D('1000000'), 1, 1, 'SELLABLE').toFixed(2)).toBe('1000000.00');
  });

  it('rounds a partial line down so repeated returns never exceed the line total', () => {
    const first = lineRefundCap(D('100000'), 3, 1, 'SELLABLE');
    const second = lineRefundCap(D('100000'), 3, 2, 'SELLABLE');
    expect(first.toFixed(2)).toBe('33333.33');
    expect(first.add(second).lte(D('100000'))).toBe(true);
  });

  it('gives no money for an item that never came back', () => {
    expect(lineRefundCap(D('500000'), 1, 1, 'MISSING').toFixed(2)).toBe('0.00');
  });

  it('adds the original shipping fee once when the shop is at fault (D57)', () => {
    expect(returnRefundCap([D('100000')], 'SHOP', D('30000'), false).toFixed(2)).toBe('130000.00');
    expect(returnRefundCap([D('100000')], 'SHOP', D('30000'), true).toFixed(2)).toBe('100000.00');
    expect(returnRefundCap([D('100000')], 'CUSTOMER', D('30000'), false).toFixed(2)).toBe('100000.00');
  });

  it('caps by the returned items, not by what is left on the order', () => {
    // Trả một món 100.000đ trên đơn 1.000.000đ: không được hoàn phần dư của đơn.
    const remaining = refundableRemaining({
      returnRefundCap: D('100000'),
      countedOnReturn: D('0'),
      paymentReceivedAmount: D('1000000'),
      countedOnPayment: D('0'),
    });
    expect(remaining.toFixed(2)).toBe('100000.00');
  });

  it('caps by money still held from the customer across every return', () => {
    const remaining = refundableRemaining({
      returnRefundCap: D('600000'),
      countedOnReturn: D('0'),
      paymentReceivedAmount: D('1000000'),
      countedOnPayment: D('570000'),
    });
    expect(remaining.toFixed(2)).toBe('430000.00');
  });

  it('never reports a negative remainder', () => {
    const remaining = refundableRemaining({
      returnRefundCap: D('100'),
      countedOnReturn: D('200'),
      paymentReceivedAmount: D('100'),
      countedOnPayment: D('200'),
    });
    expect(remaining.toFixed(2)).toBe('0.00');
  });
});

describe('refund methods (D58)', () => {
  it('forces bank transfer for online payments', () => {
    expect(allowedRefundMethods('VNPAY')).toEqual(['BANK_TRANSFER']);
    expect(allowedRefundMethods('BANK_TRANSFER')).toEqual(['BANK_TRANSFER']);
    expect(errorCode(() => assertRefundMethod('VNPAY', 'CASH'))).toBe(RETURN_ERROR_CODE.REFUND_METHOD_NOT_ALLOWED);
  });

  it('allows cash or transfer for COD', () => {
    expect(allowedRefundMethods('COD')).toEqual(['CASH', 'BANK_TRANSFER']);
    // Đơn bán tại quầy trả tiền mặt: hoàn tiền mặt được (D58).
    expect(allowedRefundMethods('CASH')).toEqual(['CASH', 'BANK_TRANSFER']);
    expect(() => assertRefundMethod('COD', 'CASH')).not.toThrow();
  });
});

describe('return eligibility', () => {
  const base = {
    orderStatusAllowsReturn: true,
    deliveredAt: new Date('2026-09-20T00:00:00Z'),
    now: new Date('2026-09-24T00:00:00Z'),
    windowDays: 7,
    openReturnNo: null,
    canOverrideWindow: false,
    lines: [
      { orderItemId: '1', purchasedQuantity: 3, alreadyReturnedQuantity: 1, isBundle: false, blockedByCategory: false, lineTotal: D('300000') },
      { orderItemId: '2', purchasedQuantity: 1, alreadyReturnedQuantity: 0, isBundle: true, blockedByCategory: true, lineTotal: D('500000') },
    ],
  };

  it('reports returnable quantities, deadline and estimates for an eligible order', () => {
    const result = evaluateEligibility(base);
    expect(result).toMatchObject({ eligible: true, reason: null, withinWindow: true, windowOverrideRequired: false });
    expect(result.returnDeadline?.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(result.lines[0]).toMatchObject({ returnableQuantity: 2 });
    expect(result.lines[0].unitRefundEstimate.toFixed(2)).toBe('100000.00');
    expect(result.lines[0].maxRefundEstimate.toFixed(2)).toBe('200000.00');
    // Danh mục tắt đổi trả: không trả được dù còn số lượng.
    expect(result.lines[1]).toMatchObject({ returnableQuantity: 0 });
    expect(result.lines[1].maxRefundEstimate.toFixed(2)).toBe('0.00');
  });

  it('is not eligible before delivery', () => {
    expect(evaluateEligibility({ ...base, deliveredAt: null }).reason).toBe('ORDER_NOT_RETURNABLE');
    expect(evaluateEligibility({ ...base, orderStatusAllowsReturn: false }).reason).toBe('ORDER_NOT_RETURNABLE');
  });

  it('is not eligible while another return is open', () => {
    expect(evaluateEligibility({ ...base, openReturnNo: 'RMA-1' }).reason).toBe('OPEN_RETURN_EXISTS');
  });

  it('is not eligible when nothing is left to return', () => {
    const lines = [{ ...base.lines[0], alreadyReturnedQuantity: 3 }];
    expect(evaluateEligibility({ ...base, lines }).reason).toBe('NOTHING_RETURNABLE');
  });

  it('blocks an expired window unless the actor may override it', () => {
    const late = { ...base, now: new Date('2026-10-01T00:00:00Z') };
    expect(evaluateEligibility(late)).toMatchObject({ eligible: false, reason: 'WINDOW_EXPIRED' });
    expect(evaluateEligibility({ ...late, canOverrideWindow: true }))
      .toMatchObject({ eligible: true, reason: null, windowOverrideRequired: true });
  });

  it('estimates a requested return with shipping only once the shop is at fault', () => {
    const lines = [{ lineTotal: D('300000'), orderedQuantity: 3, returnedQuantity: 1 }];
    expect(estimateRequestedRefund(lines, null, D('30000')).toFixed(2)).toBe('100000.00');
    expect(estimateRequestedRefund(lines, 'SHOP', D('30000')).toFixed(2)).toBe('130000.00');
  });
});
