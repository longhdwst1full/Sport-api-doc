export const INVENTORY_MOVEMENT_TYPE = {
  ADJUST: 'ADJUST',
  RECEIVE: 'RECEIVE',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  SALE_SHIP: 'SALE_SHIP',
  DELIVERY_RETURN_RESTOCK: 'DELIVERY_RETURN_RESTOCK',
  /** Khách trả hàng sau khi đã nhận; chỉ dòng kiểm SELLABLE mới tạo movement này. */
  RETURN_RESTOCK: 'RETURN_RESTOCK',
} as const;

export type InventoryMovementType =
  (typeof INVENTORY_MOVEMENT_TYPE)[keyof typeof INVENTORY_MOVEMENT_TYPE];

export const INVENTORY_REFERENCE_TYPE = {
  STOCK_ADJUSTMENT: 'STOCK_ADJUSTMENT',
  STOCK_TRANSFER: 'STOCK_TRANSFER',
  FULFILLMENT: 'FULFILLMENT',
  RETURN_REQUEST: 'RETURN_REQUEST',
} as const;

export const STOCK_ADJUSTMENT_TYPE = {
  CORRECTION: 'CORRECTION',
  OPENING_BALANCE: 'OPENING_BALANCE',
  MANUAL_RECEIPT: 'MANUAL_RECEIPT',
} as const;

export const INVENTORY_TRANSACTION = {
  MAX_WAIT_MS: 10_000,
  TIMEOUT_MS: 30_000,
  MAX_SERIALIZATION_RETRIES: 3,
} as const;

export type StockAdjustmentType =
  (typeof STOCK_ADJUSTMENT_TYPE)[keyof typeof STOCK_ADJUSTMENT_TYPE];

export const STOCK_ADJUSTMENT_REASON = {
  MANUAL: 'MANUAL',
  COUNT_CORRECTION: 'COUNT_CORRECTION',
  INITIAL_STOCK: 'INITIAL_STOCK',
  EXTERNAL_RECEIPT: 'EXTERNAL_RECEIPT',
} as const;

export type StockAdjustmentReason =
  (typeof STOCK_ADJUSTMENT_REASON)[keyof typeof STOCK_ADJUSTMENT_REASON];

/** Trạng thái tồn của một dòng cân đối, suy từ `onHand - reserved` so với ngưỡng đặt lại. */
export const INVENTORY_BALANCE_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type InventoryBalanceStatus = (typeof INVENTORY_BALANCE_STATUSES)[number];

/**
 * Phân loại một dòng tồn.
 *
 * Hàm thuần và là NGUỒN DUY NHẤT của quy tắc này: danh sách và endpoint tổng hợp phải phân loại
 * giống nhau, nếu không thẻ số liệu và bảng bên dưới nói hai con số khác nhau cho cùng một kho.
 */
export function classifyInventoryBalance(input: {
  onHand: number;
  reserved: number;
  reorderPoint: number;
}): InventoryBalanceStatus {
  const available = input.onHand - input.reserved;
  if (available === 0) return 'OUT_OF_STOCK';
  return available <= input.reorderPoint ? 'LOW_STOCK' : 'IN_STOCK';
}


/**
 * CONTRACT: mã lỗi ổn định + message tiếng Việt gửi thẳng cho FE.
 *
 * Service ném `new XxxException(INVENTORY_ERROR.KEY)` (hoặc gọi hàm khi message cần SKU), không viết
 * câu trực tiếp. Trước đây câu tiếng Anh được dịch ngược qua bảng tra ở `client-error-message.vi.ts`;
 * câu ghép động (có SKU) không khớp bảng nên rơi về thông báo chung, còn FE không có mã để xử lý riêng.
 * `code` là thứ FE/test được dựa vào; `message` có thể đổi câu chữ mà không phá contract.
 */
export const INVENTORY_ERROR = {
  STORAGE_DISABLED: {
    code: 'INVENTORY_STORAGE_DISABLED',
    message: 'Kho dữ liệu tồn kho chưa được bật.',
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    code: 'INVENTORY_IDEMPOTENCY_KEY_REQUIRED',
    message: 'Thiếu mã chống gửi trùng (Idempotency-Key).',
  },
  IDEMPOTENCY_KEY_TOO_LONG: (maxLength: number) => ({
    code: 'INVENTORY_IDEMPOTENCY_KEY_TOO_LONG',
    message: `Mã chống gửi trùng (Idempotency-Key) không được dài quá ${maxLength} ký tự.`,
  }),
  IDEMPOTENCY_CONFLICT: {
    code: 'INVENTORY_IDEMPOTENCY_CONFLICT',
    message: 'Mã chống gửi trùng đã được dùng cho một yêu cầu khác.',
  },
  ADJUSTMENT_EMPTY: {
    code: 'INVENTORY_ADJUSTMENT_EMPTY',
    message: 'Phiếu điều chỉnh phải có ít nhất một dòng hàng.',
  },
  DUPLICATE_SKU: {
    code: 'INVENTORY_DUPLICATE_SKU',
    message: 'Mỗi SKU chỉ được xuất hiện một lần trong phiếu.',
  },
  BRANCH_DECREASE_LIMIT: {
    code: 'INVENTORY_BRANCH_DECREASE_LIMIT',
    message: 'Tài khoản chi nhánh chỉ được giảm tối đa 10 đơn vị cho mỗi SKU trong một phiếu.',
  },
  WAREHOUSE_NOT_FOUND: {
    code: 'INVENTORY_WAREHOUSE_NOT_FOUND',
    message: 'Không tìm thấy kho đang hoạt động.',
  },
  WAREHOUSE_OUT_OF_SCOPE: {
    code: 'INVENTORY_WAREHOUSE_OUT_OF_SCOPE',
    message: 'Kho này nằm ngoài phạm vi chi nhánh được giao.',
  },
  SKU_NOT_FOUND: (skus: string[]) => ({
    code: 'INVENTORY_SKU_NOT_FOUND',
    message: `Không tìm thấy SKU: ${skus.join(', ')}.`,
  }),
  OPENING_BALANCE_AFTER_MOVEMENT: (sku: string) => ({
    code: 'INVENTORY_OPENING_BALANCE_AFTER_MOVEMENT',
    message: `SKU ${sku} đã có phát sinh kho; tồn đầu kỳ chỉ nhập được trước giao dịch đầu tiên.`,
  }),
  BELOW_RESERVED: (sku: string) => ({
    code: 'INVENTORY_BELOW_RESERVED',
    message: `Điều chỉnh làm tồn của ${sku} thấp hơn số đang giữ cho đơn hàng.`,
  }),
  POSITIVE_QUANTITY_ONLY: (adjustmentType: string) => ({
    code: 'INVENTORY_POSITIVE_QUANTITY_ONLY',
    message: `Loại phiếu ${adjustmentType} chỉ nhận số lượng dương.`,
  }),
  RECEIPT_REFERENCE_REQUIRED: {
    code: 'INVENTORY_RECEIPT_REFERENCE_REQUIRED',
    message: 'Phiếu nhập tay cần có số chứng từ.',
  },
  RECEIPT_FIELDS_NOT_ALLOWED: {
    code: 'INVENTORY_RECEIPT_FIELDS_NOT_ALLOWED',
    message: 'Số chứng từ và nguồn hàng chỉ dùng cho phiếu nhập tay.',
  },
  RECEIPT_REFERENCE_DUPLICATE: {
    code: 'INVENTORY_RECEIPT_REFERENCE_DUPLICATE',
    message: 'Số chứng từ nhập tay này đã tồn tại ở kho.',
  },
  BALANCE_CHANGED: {
    code: 'INVENTORY_BALANCE_CHANGED',
    message: 'Tồn kho vừa thay đổi. Vui lòng thử lại với cùng mã yêu cầu.',
  },
  STORAGE_BUSY: {
    code: 'INVENTORY_STORAGE_BUSY',
    message: 'Kho dữ liệu tồn kho đang bận hoặc tạm thời mất kết nối; vui lòng thử lại với cùng mã yêu cầu.',
  },
  CONCURRENT_UPDATE: {
    code: 'INVENTORY_CONCURRENT_UPDATE',
    message: 'Không thể điều chỉnh tồn kho do dữ liệu đang được cập nhật đồng thời; vui lòng thử lại.',
  },
  ADJUSTMENT_NOT_FOUND: {
    code: 'INVENTORY_ADJUSTMENT_NOT_FOUND',
    message: 'Không tìm thấy phiếu điều chỉnh kho.',
  },
  CURSOR_INVALID: {
    code: 'INVENTORY_CURSOR_INVALID',
    message: 'Con trỏ phân trang không hợp lệ.',
  },
  DATE_RANGE_INVALID: {
    code: 'INVENTORY_DATE_RANGE_INVALID',
    message: 'Khoảng thời gian không hợp lệ: ngày bắt đầu phải trước ngày kết thúc.',
  },
} as const;
