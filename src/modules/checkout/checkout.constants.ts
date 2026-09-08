export const CHECKOUT_STATUS = {
  QUOTED: 'QUOTED',
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
  RESERVATION_CONFIRM: 'checkout.reservation.confirm',
  RESERVATION_RELEASE: 'checkout.reservation.release',
} as const;
