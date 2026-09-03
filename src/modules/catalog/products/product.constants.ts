export const PRODUCT_TYPE = {
  STANDARD: 'STANDARD',
  BUNDLE: 'BUNDLE',
} as const;

export type ProductType = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

export const PRODUCT_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const PRODUCT_VARIANT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type ProductVariantStatus =
  (typeof PRODUCT_VARIANT_STATUS)[keyof typeof PRODUCT_VARIANT_STATUS];

export const PRODUCT_MEDIA_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type ProductMediaStatus =
  (typeof PRODUCT_MEDIA_STATUS)[keyof typeof PRODUCT_MEDIA_STATUS];

export const PRODUCT_BUNDLE_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export const PRODUCT_BUNDLE_TYPE = {
  FIXED_VIRTUAL: 'FIXED_VIRTUAL',
} as const;

export const PRODUCT_PRICE_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;

export const PRODUCT_PRICE_TYPE = {
  REGULAR: 'REGULAR',
} as const;

export const PRODUCT_SALES_CHANNEL = {
  ONLINE: 'ONLINE',
} as const;

export const PRODUCT_CURRENCY = {
  VND: 'VND',
} as const;

export const PRODUCT_AUDIT_ACTION = {
  CREATE: 'catalog.product.create',
  UPDATE: 'catalog.product.update',
  PUBLISH: 'catalog.product.publish',
  ARCHIVE: 'catalog.product.archive',
  REACTIVATE: 'catalog.product.reactivate',
  VARIANT_CREATE: 'catalog.variant.create',
  VARIANT_UPDATE: 'catalog.variant.update',
  VARIANT_ARCHIVE: 'catalog.variant.archive',
  VARIANT_REACTIVATE: 'catalog.variant.reactivate',
  MEDIA_ATTACH: 'catalog.product-media.attach',
  MEDIA_UPDATE: 'catalog.product-media.update',
  MEDIA_REORDER: 'catalog.product-media.reorder',
  MEDIA_ARCHIVE: 'catalog.product-media.archive',
  PRICE_CREATE: 'catalog.price.create',
  PRICE_REPLACE: 'catalog.price.replace',
  BUNDLE_CREATE: 'catalog.bundle.create',
} as const;

export const PRODUCT_ERROR = {
  NOT_FOUND: 'Product not found',
  VARIANT_NOT_FOUND: 'Variant not found',
  VERSION_CONFLICT: 'Product version conflict',
  VARIANT_VERSION_CONFLICT: 'Variant version conflict',
  PRICE_OVERLAP: 'Price effective window overlaps an existing price',
} as const;
