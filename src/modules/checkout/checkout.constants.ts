export const CHECKOUT_STATUS = {
  QUOTED: 'QUOTED',
  AWAITING_SHIPPING_CONSULTATION: 'AWAITING_SHIPPING_CONSULTATION',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

/** Vì sao báo giá phải chờ nhân viên tư vấn; lưu trong `shipping_rule_snapshot.consultationReason`. */
export const CHECKOUT_CONSULTATION_REASON = {
  CUSTOMER_REQUESTED: 'CUSTOMER_REQUESTED',
  SHIPPING_RULE: 'SHIPPING_RULE',
  STOCK_SPLIT_ACROSS_BRANCHES: 'STOCK_SPLIT_ACROSS_BRANCHES',
} as const;

export type CheckoutConsultationReason =
  (typeof CHECKOUT_CONSULTATION_REASON)[keyof typeof CHECKOUT_CONSULTATION_REASON];

export const CHECKOUT_ERROR_CODE = {
  STOCK_NOT_TRANSFERRED: 'CHECKOUT_STOCK_NOT_TRANSFERRED',
} as const;

export const CHECKOUT_ITEM_TYPE = {
  STANDARD: 'STANDARD',
  BUNDLE: 'BUNDLE',
} as const;

export const INVENTORY_RESERVATION_STATUS = {
  ACTIVE: 'ACTIVE',
  COMMITTED: 'COMMITTED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
} as const;

export const CHECKOUT_AUDIT_ACTION = {
  QUOTE_CREATE: 'checkout.quote.create',
  QUOTE_MANUAL_UPDATE: 'checkout.quote.manual-update',
  RESERVATION_CONFIRM: 'checkout.reservation.confirm',
  RESERVATION_RELEASE: 'checkout.reservation.release',
  RESERVATION_EXPIRE: 'checkout.reservation.expire',
} as const;

export const RESERVATION_EXPIRY_REASON = {
  TTL_EXPIRED: 'RESERVATION_TTL_EXPIRED',
} as const;

export const CHECKOUT_PAYMENT_METHOD = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  COD: 'COD',
  VNPAY: 'VNPAY',
} as const;
