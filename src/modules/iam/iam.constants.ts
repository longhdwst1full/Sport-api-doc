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

export const IAM_AUDIT_ACTION = {
  ASSIGNMENT_CREATE: 'iam.assignment.create',
  ASSIGNMENT_REVOKE: 'iam.assignment.revoke',
  USER_CREATE: 'iam.user.create',
  USER_LOCK: 'iam.user.lock',
  USER_UNLOCK: 'iam.user.unlock',
} as const;
