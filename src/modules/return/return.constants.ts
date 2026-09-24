/**
 * Hằng số Return/Refund. Mỗi họ trạng thái có CHECK tương ứng trong migration
 * `20260924120000_return_refund_foundation`; đổi chuỗi ở đây phải đổi CHECK bằng migration mới.
 */
export const RETURN_STATUS = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RECEIVED: 'RECEIVED',
  REFUNDED: 'REFUNDED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

export type ReturnStatus = (typeof RETURN_STATUS)[keyof typeof RETURN_STATUS];

/** Phiếu ở các trạng thái này đã kết thúc; không tính vào ràng buộc "một phiếu mở mỗi đơn". */
export const RETURN_TERMINAL_STATUSES: readonly ReturnStatus[] = [
  RETURN_STATUS.REJECTED,
  RETURN_STATUS.CANCELLED,
  RETURN_STATUS.CLOSED,
];

/** Phiếu bị từ chối/huỷ không giữ số lượng; số lượng đã trả của dòng đơn chỉ tính các phiếu còn lại. */
export const RETURN_QUANTITY_RELEASED_STATUSES: readonly ReturnStatus[] = [
  RETURN_STATUS.REJECTED,
  RETURN_STATUS.CANCELLED,
];

export const RETURN_ACTION = {
  CREATE: 'CREATE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL',
  RECEIVE: 'RECEIVE',
  REFUND_REQUEST: 'REFUND_REQUEST',
  REFUND_CONFIRM: 'REFUND_CONFIRM',
  REFUND_FAIL: 'REFUND_FAIL',
  CLOSE: 'CLOSE',
} as const;

export type ReturnAction = (typeof RETURN_ACTION)[keyof typeof RETURN_ACTION];

export const RETURN_CHANNEL = {
  ACCOUNT: 'ACCOUNT',
  ADMIN: 'ADMIN',
} as const;

export const RETURN_REASON_CODE = {
  DEFECTIVE: 'DEFECTIVE',
  WRONG_ITEM: 'WRONG_ITEM',
  NOT_AS_DESCRIBED: 'NOT_AS_DESCRIBED',
  WRONG_SIZE: 'WRONG_SIZE',
  CHANGED_MIND: 'CHANGED_MIND',
  OTHER: 'OTHER',
} as const;

/** D57: lỗi thuộc shop thì hoàn thêm phí giao ban đầu. */
export const RETURN_FAULT = {
  SHOP: 'SHOP',
  CUSTOMER: 'CUSTOMER',
} as const;

export type ReturnFault = (typeof RETURN_FAULT)[keyof typeof RETURN_FAULT];

/** Cùng bộ giá trị với `RETURN_CONDITION` của giao hàng thất bại: cùng một khái niệm kiểm hàng. */
export { RETURN_CONDITION as RETURN_ITEM_CONDITION } from '../fulfillment/fulfillment.constants';

export const RETURN_ITEM_DISPOSITION = {
  RESTOCK: 'RESTOCK',
  HOLD: 'HOLD',
  WRITE_OFF: 'WRITE_OFF',
} as const;

export type ReturnItemDisposition =
  (typeof RETURN_ITEM_DISPOSITION)[keyof typeof RETURN_ITEM_DISPOSITION];

export const REFUND_METHOD = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;

export type RefundMethod = (typeof REFUND_METHOD)[keyof typeof REFUND_METHOD];

export const REFUND_STATUS = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

/** Lượt hoàn đang giữ tiền: PENDING chưa trả nhưng đã trừ vào phần còn được hoàn. */
export const REFUND_COUNTED_STATUSES: readonly string[] = [
  REFUND_STATUS.PENDING,
  REFUND_STATUS.SUCCEEDED,
];

export const RETURN_ERROR_CODE = {
  ORDER_NOT_RETURNABLE: 'RETURN_ORDER_NOT_RETURNABLE',
  WINDOW_EXPIRED: 'RETURN_WINDOW_EXPIRED',
  OPEN_RETURN_EXISTS: 'RETURN_OPEN_RETURN_EXISTS',
  QUANTITY_EXCEEDED: 'RETURN_QUANTITY_EXCEEDED',
  PARTIAL_COMBO: 'RETURN_PARTIAL_COMBO',
  ITEM_NOT_RETURNABLE: 'RETURN_ITEM_NOT_RETURNABLE',
  INVALID_TRANSITION: 'RETURN_INVALID_TRANSITION',
  INVALID_INSPECTION: 'RETURN_INVALID_INSPECTION',
  VERSION_CONFLICT: 'RETURN_VERSION_CONFLICT',
  IDEMPOTENCY_CONFLICT: 'RETURN_IDEMPOTENCY_CONFLICT',
  REFUND_EXCEEDS_REMAINING: 'REFUND_EXCEEDS_REMAINING',
  REFUND_PENDING_EXISTS: 'REFUND_PENDING_EXISTS',
  REFUND_PAYMENT_NOT_SUCCESS: 'REFUND_PAYMENT_NOT_SUCCESS',
  REFUND_METHOD_NOT_ALLOWED: 'REFUND_METHOD_NOT_ALLOWED',
  REFUND_REFERENCE_REQUIRED: 'REFUND_REFERENCE_REQUIRED',
  REFUND_REFERENCE_USED: 'REFUND_REFERENCE_USED',
  EVIDENCE_INVALID: 'RETURN_EVIDENCE_INVALID',
} as const;

export const RETURN_PERMISSION = {
  VIEW: 'return.view',
  CREATE: 'return.create',
  DECIDE: 'return.decide',
  RECEIVE: 'return.receive',
  WINDOW_OVERRIDE: 'return.window.override',
  REFUND_REQUEST: 'payment.refund.request',
  REFUND_APPROVE: 'payment.refund.approve',
} as const;

export const RETURN_AUDIT_ENTITY = 'RETURN_REQUEST';

export const RETURN_LIMITS = {
  MAX_EVIDENCE_IMAGES: 5,
  MAX_ITEMS: 50,
} as const;

/**
 * Ảnh minh chứng: mỗi đơn một thư mục con trên Cloudinary. Chữ ký upload chỉ cấp cho thư mục của
 * đơn, và lúc tạo phiếu server chỉ nhận ảnh nằm trong thư mục đó — ảnh của đơn khác hay ảnh sản
 * phẩm không gắn được vào phiếu.
 */
export const RETURN_EVIDENCE = {
  FOLDER: 'return-evidence',
  REFUND_PROOF_FOLDER: 'refund-proof',
  UPLOAD_TTL_SECONDS: 15 * 60,
} as const;

export const RETURN_TRANSACTION = {
  MAX_WAIT_MS: 10_000,
  TIMEOUT_MS: 30_000,
  MAX_SERIALIZATION_RETRIES: 3,
} as const;
