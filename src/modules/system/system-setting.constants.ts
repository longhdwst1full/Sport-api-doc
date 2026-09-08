export const SYSTEM_SETTING_KEY = {
  CHECKOUT_RESERVATION_TTL_MINUTES: 'checkout.reservation_ttl_minutes',
} as const;

export const CHECKOUT_RESERVATION_TTL = {
  DEFAULT_MINUTES: 30,
  MIN_MINUTES: 5,
  MAX_MINUTES: 24 * 60,
} as const;

export const SYSTEM_SETTING_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export const SYSTEM_SETTING_VALUE_TYPE = {
  INTEGER: 'INTEGER',
} as const;
