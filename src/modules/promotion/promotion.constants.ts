export const FLASH_SALE_CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
} as const;

export type FlashSaleCampaignStatus =
  (typeof FLASH_SALE_CAMPAIGN_STATUS)[keyof typeof FLASH_SALE_CAMPAIGN_STATUS];

export const FLASH_SALE_ITEM_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export const FLASH_SALE_QUOTA_STATUS = {
  ACTIVE: 'ACTIVE',
  COMMITTED: 'COMMITTED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
} as const;

/**
 * Chuyển trạng thái hợp lệ của campaign. Không cho nhảy bước tùy ý:
 * đã ENDED/CANCELLED là terminal, không quay lại bán được.
 */
export const FLASH_SALE_CAMPAIGN_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: [FLASH_SALE_CAMPAIGN_STATUS.SCHEDULED, FLASH_SALE_CAMPAIGN_STATUS.CANCELLED],
  SCHEDULED: [
    FLASH_SALE_CAMPAIGN_STATUS.ACTIVE,
    FLASH_SALE_CAMPAIGN_STATUS.DRAFT,
    FLASH_SALE_CAMPAIGN_STATUS.CANCELLED,
  ],
  ACTIVE: [FLASH_SALE_CAMPAIGN_STATUS.ENDED, FLASH_SALE_CAMPAIGN_STATUS.CANCELLED],
  ENDED: [],
  CANCELLED: [],
};

/** Quota chỉ được giữ trong thời gian ngắn; hết hạn thì worker/checkout trả lại. */
export const FLASH_SALE_QUOTA_TTL_MINUTES = 15;
