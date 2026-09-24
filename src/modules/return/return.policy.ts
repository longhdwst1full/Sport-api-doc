import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PAYMENT_METHOD } from '../payment/payment.constants';
import {
  REFUND_METHOD,
  RETURN_ACTION,
  RETURN_ERROR_CODE,
  RETURN_FAULT,
  RETURN_ITEM_CONDITION,
  RETURN_ITEM_DISPOSITION,
  RETURN_STATUS,
  type RefundMethod,
  type ReturnAction,
  type ReturnItemDisposition,
  type ReturnStatus,
} from './return.constants';

/**
 * Luật nghiệp vụ Return/Refund ở dạng hàm thuần: không đọc database, không biết HTTP.
 *
 * Service gọi các hàm này SAU KHI đã khoá dữ liệu trong transaction, nên đầu vào phản ánh trạng
 * thái đã được tuần tự hoá. Test đơn vị chạy trực tiếp trên file này.
 */

const conflict = (code: string, message: string) => new ConflictException({ code, message });

/**
 * Ma trận chuyển trạng thái. Trạng thái đích `undefined` nghĩa là hành động không đổi trạng thái
 * (ví dụ tạo lượt hoàn tiền), nhưng vẫn chỉ được làm ở trạng thái nguồn liệt kê.
 */
const TRANSITIONS: Record<Exclude<ReturnAction, 'CREATE'>, { from: readonly ReturnStatus[]; to?: ReturnStatus }> = {
  [RETURN_ACTION.APPROVE]: { from: [RETURN_STATUS.REQUESTED], to: RETURN_STATUS.APPROVED },
  [RETURN_ACTION.REJECT]: { from: [RETURN_STATUS.REQUESTED], to: RETURN_STATUS.REJECTED },
  [RETURN_ACTION.CANCEL]: {
    from: [RETURN_STATUS.REQUESTED, RETURN_STATUS.APPROVED],
    to: RETURN_STATUS.CANCELLED,
  },
  [RETURN_ACTION.RECEIVE]: { from: [RETURN_STATUS.APPROVED], to: RETURN_STATUS.RECEIVED },
  [RETURN_ACTION.REFUND_REQUEST]: { from: [RETURN_STATUS.RECEIVED] },
  // Trạng thái đích (RECEIVED hay REFUNDED) tuỳ số tiền còn lại; service quyết định sau khi tính.
  [RETURN_ACTION.REFUND_CONFIRM]: { from: [RETURN_STATUS.RECEIVED] },
  [RETURN_ACTION.REFUND_FAIL]: { from: [RETURN_STATUS.RECEIVED] },
  [RETURN_ACTION.CLOSE]: { from: [RETURN_STATUS.RECEIVED, RETURN_STATUS.REFUNDED], to: RETURN_STATUS.CLOSED },
};

export function assertTransition(current: string, action: Exclude<ReturnAction, 'CREATE'>): ReturnStatus {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(current as ReturnStatus)) {
    throw conflict(
      RETURN_ERROR_CODE.INVALID_TRANSITION,
      `Không thể thực hiện ${action} khi phiếu trả đang ở trạng thái ${current}`,
    );
  }
  return rule.to ?? (current as ReturnStatus);
}

/** D54: hạn trả tính từ lúc giao thành công, theo số ngày trong tham số hệ thống. */
export function isWithinReturnWindow(deliveredAt: Date, now: Date, windowDays: number): boolean {
  const deadline = deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000;
  return now.getTime() <= deadline;
}

export interface RequestedLine {
  orderItemId: string;
  quantity: number;
  purchasedQuantity: number;
  /** Số lượng đã nằm trên các phiếu khác chưa bị từ chối/huỷ. */
  alreadyReturnedQuantity: number;
  isBundle: boolean;
  label: string;
}

/**
 * INVARIANT: tổng số lượng trả của một dòng đơn, cộng dồn qua mọi phiếu còn hiệu lực, không vượt số
 * đã mua. Combo chỉ trả NGUYÊN phần còn lại của dòng (D09, D32) — trả lẻ một thành phần làm combo
 * còn lại không bán được và giá hoàn không xác định.
 */
export function assertRequestedLines(lines: readonly RequestedLine[]): void {
  if (lines.length === 0) {
    throw new BadRequestException('Phiếu trả phải có ít nhất một sản phẩm');
  }
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.orderItemId)) {
      throw new BadRequestException(`Sản phẩm ${line.label} bị lặp trong phiếu trả`);
    }
    seen.add(line.orderItemId);
    const remaining = line.purchasedQuantity - line.alreadyReturnedQuantity;
    if (line.quantity > remaining) {
      throw conflict(
        RETURN_ERROR_CODE.QUANTITY_EXCEEDED,
        `${line.label}: chỉ còn ${Math.max(remaining, 0)} sản phẩm có thể trả`,
      );
    }
    if (line.isBundle && line.quantity !== remaining) {
      throw conflict(
        RETURN_ERROR_CODE.PARTIAL_COMBO,
        `${line.label}: combo phải trả nguyên ${remaining} bộ còn lại, không trả lẻ`,
      );
    }
  }
}

export interface InspectionResult {
  disposition: ReturnItemDisposition;
  restock: boolean;
}

/**
 * INVARIANT: chỉ hàng SELLABLE được nhập lại tồn bán. SELLABLE luôn RESTOCK, MISSING luôn WRITE_OFF;
 * DAMAGED do người kiểm chọn giữ lại (HOLD) hay huỷ (WRITE_OFF), và không bao giờ tăng tồn.
 */
export function resolveInspection(condition: string, disposition?: string): InspectionResult {
  switch (condition) {
    case RETURN_ITEM_CONDITION.SELLABLE:
      if (disposition && disposition !== RETURN_ITEM_DISPOSITION.RESTOCK) {
        throw conflict(RETURN_ERROR_CODE.INVALID_INSPECTION, 'Hàng còn bán được phải nhập lại kho');
      }
      return { disposition: RETURN_ITEM_DISPOSITION.RESTOCK, restock: true };
    case RETURN_ITEM_CONDITION.DAMAGED:
      if (disposition !== RETURN_ITEM_DISPOSITION.HOLD && disposition !== RETURN_ITEM_DISPOSITION.WRITE_OFF) {
        throw conflict(
          RETURN_ERROR_CODE.INVALID_INSPECTION,
          'Hàng hỏng phải chọn giữ lại (HOLD) hoặc huỷ (WRITE_OFF); không được nhập lại tồn bán',
        );
      }
      return { disposition, restock: false };
    case RETURN_ITEM_CONDITION.MISSING:
      if (disposition && disposition !== RETURN_ITEM_DISPOSITION.WRITE_OFF) {
        throw conflict(RETURN_ERROR_CODE.INVALID_INSPECTION, 'Hàng không nhận được chỉ có thể ghi WRITE_OFF');
      }
      return { disposition: RETURN_ITEM_DISPOSITION.WRITE_OFF, restock: false };
    default:
      throw new BadRequestException(`Tình trạng hàng không hợp lệ: ${condition}`);
  }
}

/**
 * Trần tiền hoàn của một dòng: phần giá khách đã trả cho số lượng trả, làm tròn XUỐNG tới đồng
 * để cộng dồn nhiều lần trả không bao giờ vượt thành tiền của dòng. Hàng không nhận được là 0.
 */
export function lineRefundCap(
  lineTotal: Prisma.Decimal,
  orderedQuantity: number,
  returnedQuantity: number,
  condition: string,
): Prisma.Decimal {
  if (condition === RETURN_ITEM_CONDITION.MISSING) return new Prisma.Decimal(0);
  if (returnedQuantity === orderedQuantity) return new Prisma.Decimal(lineTotal);
  return new Prisma.Decimal(lineTotal)
    .mul(returnedQuantity)
    .div(orderedQuantity)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

/**
 * D57: trần của phiếu là tổng trần các dòng, cộng phí giao ban đầu khi lỗi thuộc shop. Phí giao chỉ
 * được cộng MỘT lần cho mỗi đơn, nên phiếu sau không cộng lại khi phiếu trước đã cộng.
 */
export function returnRefundCap(
  lineCaps: readonly Prisma.Decimal[],
  fault: string,
  shippingTotal: Prisma.Decimal,
  shippingAlreadyCovered: boolean,
): Prisma.Decimal {
  const items = lineCaps.reduce((sum, cap) => sum.add(cap), new Prisma.Decimal(0));
  if (fault !== RETURN_FAULT.SHOP || shippingAlreadyCovered) return items;
  return items.add(shippingTotal);
}

export interface RefundableInput {
  returnRefundCap: Prisma.Decimal;
  /** Tổng PENDING + SUCCEEDED trên phiếu này. */
  countedOnReturn: Prisma.Decimal;
  paymentReceivedAmount: Prisma.Decimal;
  /** Tổng PENDING + SUCCEEDED trên toàn bộ payment (mọi phiếu của đơn). */
  countedOnPayment: Prisma.Decimal;
}

/**
 * Số tiền còn được hoàn = min(phần còn lại của trần phiếu, phần còn lại của số tiền đã thu).
 *
 * Chặn ở hai tầng vì chỉ chặn theo đơn thì một món 100.000đ vẫn hoàn được cả phần dư của đơn, còn
 * chỉ chặn theo phiếu thì nhiều phiếu cộng lại có thể vượt tiền khách đã trả.
 */
export function refundableRemaining(input: RefundableInput): Prisma.Decimal {
  const byReturn = input.returnRefundCap.sub(input.countedOnReturn);
  const byPayment = input.paymentReceivedAmount.sub(input.countedOnPayment);
  const remaining = Prisma.Decimal.min(byReturn, byPayment);
  return remaining.isNegative() ? new Prisma.Decimal(0) : remaining;
}

/**
 * D58: khách trả online (chuyển khoản, VNPay) chỉ được hoàn chuyển khoản — không hoàn qua cổng khi
 * chưa tích hợp. COD/tiền mặt hoàn tiền mặt tại quầy, hoặc chuyển khoản nếu hai bên thoả thuận.
 */
export function allowedRefundMethods(paymentMethod: string): readonly RefundMethod[] {
  if (paymentMethod === PAYMENT_METHOD.COD) return [REFUND_METHOD.CASH, REFUND_METHOD.BANK_TRANSFER];
  return [REFUND_METHOD.BANK_TRANSFER];
}

export function assertRefundMethod(paymentMethod: string, method: string): void {
  if (!allowedRefundMethods(paymentMethod).includes(method as RefundMethod)) {
    throw conflict(
      RETURN_ERROR_CODE.REFUND_METHOD_NOT_ALLOWED,
      `Đơn thanh toán ${paymentMethod} không được hoàn bằng ${method}`,
    );
  }
}

export const RETURN_INELIGIBLE_REASON = {
  ORDER_NOT_RETURNABLE: 'ORDER_NOT_RETURNABLE',
  OPEN_RETURN_EXISTS: 'OPEN_RETURN_EXISTS',
  WINDOW_EXPIRED: 'WINDOW_EXPIRED',
  NOTHING_RETURNABLE: 'NOTHING_RETURNABLE',
} as const;

export type ReturnIneligibleReason = (typeof RETURN_INELIGIBLE_REASON)[keyof typeof RETURN_INELIGIBLE_REASON];

export interface EligibilityLineInput {
  orderItemId: string;
  purchasedQuantity: number;
  alreadyReturnedQuantity: number;
  isBundle: boolean;
  blockedByCategory: boolean;
  lineTotal: Prisma.Decimal;
}

export interface EligibilityInput {
  orderStatusAllowsReturn: boolean;
  deliveredAt: Date | null;
  now: Date;
  windowDays: number;
  openReturnNo: string | null;
  canOverrideWindow: boolean;
  lines: readonly EligibilityLineInput[];
}

export interface EligibilityLineResult extends EligibilityLineInput {
  returnableQuantity: number;
  unitRefundEstimate: Prisma.Decimal;
  maxRefundEstimate: Prisma.Decimal;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: ReturnIneligibleReason | null;
  returnDeadline: Date | null;
  withinWindow: boolean;
  windowOverrideRequired: boolean;
  lines: EligibilityLineResult[];
}

/**
 * Cùng luật với lúc tạo phiếu nhưng TRẢ VỀ kết quả thay vì ném lỗi, để FE bật/tắt nút và giới hạn
 * số lượng mà không chép lại luật. Lệnh tạo phiếu vẫn kiểm lại trong transaction đã khoá: kết quả
 * ở đây chỉ là ảnh chụp tại thời điểm đọc.
 *
 * Số tiền ở đây là ƯỚC TÍNH theo giá khách đã trả, giả định hàng về còn bán được; số chính thức
 * chỉ có sau khi nhận và kiểm hàng.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const lines = input.lines.map((line) => {
    const remaining = Math.max(line.purchasedQuantity - line.alreadyReturnedQuantity, 0);
    const returnableQuantity = line.blockedByCategory ? 0 : remaining;
    return {
      ...line,
      returnableQuantity,
      unitRefundEstimate: lineRefundCap(line.lineTotal, line.purchasedQuantity, 1, RETURN_ITEM_CONDITION.SELLABLE),
      maxRefundEstimate: returnableQuantity > 0
        ? lineRefundCap(line.lineTotal, line.purchasedQuantity, returnableQuantity, RETURN_ITEM_CONDITION.SELLABLE)
        : new Prisma.Decimal(0),
    };
  });
  const returnDeadline = input.deliveredAt
    ? new Date(input.deliveredAt.getTime() + input.windowDays * 24 * 60 * 60 * 1000)
    : null;
  const withinWindow = input.deliveredAt ? isWithinReturnWindow(input.deliveredAt, input.now, input.windowDays) : false;

  const result = (reason: ReturnIneligibleReason | null, windowOverrideRequired = false): EligibilityResult => ({
    eligible: reason === null,
    reason,
    returnDeadline,
    withinWindow,
    windowOverrideRequired,
    lines,
  });
  if (!input.orderStatusAllowsReturn || !input.deliveredAt) return result(RETURN_INELIGIBLE_REASON.ORDER_NOT_RETURNABLE);
  if (input.openReturnNo) return result(RETURN_INELIGIBLE_REASON.OPEN_RETURN_EXISTS);
  if (!lines.some((line) => line.returnableQuantity > 0)) return result(RETURN_INELIGIBLE_REASON.NOTHING_RETURNABLE);
  if (!withinWindow) {
    return input.canOverrideWindow
      ? result(null, true)
      : result(RETURN_INELIGIBLE_REASON.WINDOW_EXPIRED);
  }
  return result(null);
}

/**
 * Ước tính tiền hoàn của phiếu CHƯA nhận hàng: giá khách đã trả cho số lượng yêu cầu, cộng phí giao
 * khi đã chốt lỗi shop. Không trừ trường hợp phí giao đã được phiếu trước cộng (hiếm, chỉ khi một đơn
 * có nhiều phiếu lỗi shop); trần chính thức lúc nhận hàng mới xử lý chính xác.
 */
export function estimateRequestedRefund(
  lines: readonly { lineTotal: Prisma.Decimal; orderedQuantity: number; returnedQuantity: number }[],
  fault: string | null,
  shippingTotal: Prisma.Decimal,
): Prisma.Decimal {
  const caps = lines.map((line) =>
    lineRefundCap(line.lineTotal, line.orderedQuantity, line.returnedQuantity, RETURN_ITEM_CONDITION.SELLABLE),
  );
  return returnRefundCap(caps, fault ?? RETURN_FAULT.CUSTOMER, shippingTotal, false);
}
