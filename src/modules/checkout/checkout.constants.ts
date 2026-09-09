export const CHECKOUT_STATUS = {
  QUOTED: 'QUOTED',
  AWAITING_SHIPPING_CONSULTATION: 'AWAITING_SHIPPING_CONSULTATION',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
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
} as const;
