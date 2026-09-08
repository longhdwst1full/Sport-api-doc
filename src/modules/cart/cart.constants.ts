export const CART_STATUS = {
  ACTIVE: 'ACTIVE',
  CONVERTED: 'CONVERTED',
  ABANDONED: 'ABANDONED',
  EXPIRED: 'EXPIRED',
} as const;

export const CART_CURRENCY = 'VND' as const;

export const CART_HEADER = {
  GUEST_TOKEN: 'x-cart-token',
} as const;
