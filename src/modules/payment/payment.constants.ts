export const PAYMENT_METHOD = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  COD: 'COD',
  VNPAY: 'VNPAY',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  NEED_REVIEW: 'NEED_REVIEW',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

export const PAYMENT_EVIDENCE_STATUS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export const PAYMENT_TRANSACTION_TYPE = {
  CREATED: 'CREATED',
  EVIDENCE_SUBMITTED: 'EVIDENCE_SUBMITTED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  COD_COLLECTED: 'COD_COLLECTED',
  EXPIRED: 'EXPIRED',
} as const;

export const PAYMENT_PROVIDER = {
  MANUAL_BANK_TRANSFER: 'MANUAL_BANK_TRANSFER',
  INTERNAL_COD: 'INTERNAL_COD',
  VNPAY: 'VNPAY',
} as const;

/** Mã nghiệp vụ VNPay dùng ở IPN. '00' là thành công, mọi mã khác coi là thất bại. */
export const VNPAY_RESPONSE_CODE = {
  SUCCESS: '00',
} as const;

/** Mã trả về cho VNPay ở endpoint IPN, theo đúng đặc tả tích hợp. */
export const VNPAY_IPN_RESPONSE = {
  SUCCESS: { RspCode: '00', Message: 'Confirm Success' },
  ORDER_NOT_FOUND: { RspCode: '01', Message: 'Order not found' },
  ALREADY_CONFIRMED: { RspCode: '02', Message: 'Order already confirmed' },
  INVALID_AMOUNT: { RspCode: '04', Message: 'Invalid amount' },
  INVALID_SIGNATURE: { RspCode: '97', Message: 'Invalid signature' },
  UNKNOWN_ERROR: { RspCode: '99', Message: 'Unknown error' },
} as const;

export const PAYMENT_TRANSACTION = {
  MAX_WAIT_MS: 10_000,
  TIMEOUT_MS: 30_000,
  MAX_SERIALIZATION_RETRIES: 3,
} as const;
