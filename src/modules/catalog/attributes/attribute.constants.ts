/** Khớp CHECK `attributes_data_type_check` trong migration 20260925200000. */
export const ATTRIBUTE_DATA_TYPE = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  OPTION: 'OPTION',
} as const;

export type AttributeDataType = (typeof ATTRIBUTE_DATA_TYPE)[keyof typeof ATTRIBUTE_DATA_TYPE];

export const ATTRIBUTE_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type AttributeStatus = (typeof ATTRIBUTE_STATUS)[keyof typeof ATTRIBUTE_STATUS];

export const ATTRIBUTE_LIMIT = {
  CODE_PATTERN: /^[A-Z][A-Z0-9_]{1,63}$/,
  OPTION_CODE_PATTERN: /^[A-Z0-9][A-Z0-9_-]{0,63}$/,
  MAX_OPTIONS: 100,
  MAX_VALUES_PER_ATTRIBUTE: 20,
  MAX_SPECIFICATIONS_PER_PRODUCT: 60,
  MAX_TEXT_LENGTH: 255,
} as const;

export const ATTRIBUTE_AUDIT_ACTION = {
  CREATE: 'catalog.attribute.create',
  UPDATE: 'catalog.attribute.update',
  PRODUCT_SPECIFICATIONS_REPLACE: 'catalog.product.specifications.replace',
} as const;

export const ATTRIBUTE_ERROR_CODE = {
  IN_USE: 'ATTRIBUTE_IN_USE',
  VERSION_CONFLICT: 'ATTRIBUTE_VERSION_CONFLICT',
  INVALID_SPECIFICATION: 'PRODUCT_SPECIFICATION_INVALID',
} as const;
