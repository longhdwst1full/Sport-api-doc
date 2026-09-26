export const FULFILLMENT_STATUS = {
  PENDING: 'PENDING',
  PICKING: 'PICKING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  RETURNING_TO_WAREHOUSE: 'RETURNING_TO_WAREHOUSE',
  RETURNED_TO_WAREHOUSE: 'RETURNED_TO_WAREHOUSE',
  CANCELLED: 'CANCELLED',
} as const;

export const FULFILLMENT_ACTION = {
  PICK: 'PICK',
  PACK: 'PACK',
  SHIP: 'SHIP',
  DELIVER: 'DELIVER',
  FAIL_DELIVERY: 'FAIL_DELIVERY',
  RECEIVE_RETURN: 'RECEIVE_RETURN',
} as const;

export const RETURN_CONDITION = {
  SELLABLE: 'SELLABLE',
  DAMAGED: 'DAMAGED',
  MISSING: 'MISSING',
} as const;

export const FULFILLMENT_TRANSACTION = {
  MAX_WAIT_MS: 10_000,
  TIMEOUT_MS: 30_000,
  MAX_SERIALIZATION_RETRIES: 3,
} as const;

/**
 * Vòng đời vận đơn GHN tự tạo, tách khỏi `FULFILLMENT_STATUS` vì hai trục độc lập: kho có thể đang
 * PICKING trong khi vận đơn đã CREATED, hoặc PACKED mà vận đơn còn CREATE_FAILED.
 * `null` trên fulfillment = không áp dụng (không báo giá qua GHN, POS, đơn cũ) → giữ luồng tạo lúc ship.
 */
export const CARRIER_SHIPMENT_STATUS = {
  PENDING: 'PENDING',
  CREATING: 'CREATING',
  CREATED: 'CREATED',
  CREATE_FAILED: 'CREATE_FAILED',
} as const;

export type CarrierShipmentStatus = (typeof CARRIER_SHIPMENT_STATUS)[keyof typeof CARRIER_SHIPMENT_STATUS];

/** Nhà cung cấp vận chuyển có vận đơn tự tạo; khớp `checkout_sessions.shipping_provider` lúc báo giá. */
export const AUTO_CARRIER_PROVIDER = 'GHN' as const;

export const CARRIER_SHIPMENT_JOB = {
  BATCH_SIZE: 20,
  /** Số lần worker tự thử; hết lượt thì CREATE_FAILED và chờ Admin bấm tạo lại. */
  MAX_AUTO_ATTEMPTS: 3,
  /** Chờ trước lần thử thứ n+1 (phút). Lỗi GHN thường là timeout/tạm thời nên thử lại có giãn cách. */
  BACKOFF_MINUTES: [1, 5, 15],
  /** Dòng CREATING quá mốc này coi như tiến trình đã chết giữa chừng và được thu hồi. */
  LOCK_TIMEOUT_MINUTES: 10,
} as const;

export const CARRIER_SHIPMENT_AUDIT_ACTION = {
  RETRY: 'fulfillment.carrier_shipment.retry',
} as const;

/** CONTRACT: mã lỗi ổn định + message tiếng Việt cho vận đơn tự tạo. */
export const CARRIER_SHIPMENT_ERROR = {
  IN_PROGRESS: {
    code: 'FULFILLMENT_CARRIER_SHIPMENT_IN_PROGRESS',
    message: 'Hệ thống đang tạo vận đơn GHN cho đơn này. Vui lòng chờ vài phút rồi thử lại.',
  },
  NOT_RETRYABLE: {
    code: 'FULFILLMENT_CARRIER_SHIPMENT_NOT_RETRYABLE',
    message: 'Chỉ tạo lại được vận đơn đang ở trạng thái tạo lỗi.',
  },
  PARTNER_DISABLED: {
    code: 'FULFILLMENT_CARRIER_PARTNER_DISABLED',
    message: 'Chưa cấu hình kết nối GHN nên không tạo được vận đơn.',
  },
  NOT_FOUND: {
    code: 'FULFILLMENT_NOT_FOUND',
    message: 'Không tìm thấy giao vận trong phạm vi được phân quyền.',
  },
} as const;
