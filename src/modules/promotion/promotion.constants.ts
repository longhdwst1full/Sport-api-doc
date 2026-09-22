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

/**
 * Mã lỗi suất flash, trả trong `ErrorResponseDto.code`.
 *
 * Người gọi cần phân biệt được hai tình huống để xử lý khác nhau: campaign kết thúc thì giá quay
 * về giá gốc cho mọi khách, còn hết suất thì chỉ dòng đó mất giá giảm. Bắt theo chuỗi thông báo là
 * cách để một lần sửa câu chữ làm hỏng cả Admin và Storefront.
 *
 * `details[].field` mang **entity id của biến thể** bị ảnh hưởng, để màn hình quầy và giỏ hàng chỉ
 * đúng dòng cần cập nhật thay vì bắt dựng lại toàn bộ.
 */
export const FLASH_SALE_ERROR_CODE = {
  CAMPAIGN_ENDED: 'FLASH_SALE_CAMPAIGN_ENDED',
  QUOTA_EXHAUSTED: 'FLASH_SALE_QUOTA_EXHAUSTED',
  PER_CUSTOMER_LIMIT: 'FLASH_SALE_PER_CUSTOMER_LIMIT_REACHED',
  /** Riêng quầy: đã dọn phiên bán và trả kèm giá gốc để nhân viên xác nhận lại. */
  POS_REPRICED: 'POS_FLASH_SALE_REPRICED',
} as const;

export type FlashSaleErrorCode =
  (typeof FLASH_SALE_ERROR_CODE)[keyof typeof FLASH_SALE_ERROR_CODE];

