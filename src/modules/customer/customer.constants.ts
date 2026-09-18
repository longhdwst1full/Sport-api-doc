export const CUSTOMER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export const CUSTOMER_ADDRESS_TYPE = {
  SHIPPING: 'SHIPPING',
} as const;

export const CUSTOMER_COUNTRY = {
  VIETNAM: 'VN',
} as const;

/** Audit action ổn định cho các mutation chứa PII khách hàng. */
export const CUSTOMER_AUDIT_ACTION = {
  CREATE: 'customer.create',
  UPDATE: 'customer.update',
  ACTIVATE: 'customer.activate',
  DEACTIVATE: 'customer.deactivate',
  DELETE: 'customer.delete',
} as const;
