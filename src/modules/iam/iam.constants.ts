export const USER_TYPE = {
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  SYSTEM: 'SYSTEM',
} as const;

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  LOCKED: 'LOCKED',
  INACTIVE: 'INACTIVE',
} as const;

export const ROLE_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export const ROLE_ASSIGNMENT_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;

export const IAM_SECURITY_DEFAULTS = {
  INITIAL_STAFF_PASSWORD: 'Aa@123456',
} as const;

