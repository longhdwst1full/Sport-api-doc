export const MEDIA_ASSET_STATUS = {
  ACTIVE: 'ACTIVE',
  DELETE_PENDING: 'DELETE_PENDING',
  INACTIVE: 'INACTIVE',
} as const;

export type MediaAssetStatus =
  (typeof MEDIA_ASSET_STATUS)[keyof typeof MEDIA_ASSET_STATUS];
