export const STOCK_TRANSFER_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  SHIPPED: 'SHIPPED',
  RECEIVED: 'RECEIVED',
} as const;

export type StockTransferStatus =
  (typeof STOCK_TRANSFER_STATUS)[keyof typeof STOCK_TRANSFER_STATUS];

export const STOCK_TRANSFER_PERMISSION = {
  VIEW: 'inventory.transfer.view',
  CREATE: 'inventory.transfer.create',
  SHIP: 'inventory.transfer.ship',
  RECEIVE: 'inventory.transfer.receive',
} as const;

/** CONTRACT: mã lỗi ổn định + message tiếng Việt của phiếu chuyển kho (xem `INVENTORY_ERROR`). */
export const STOCK_TRANSFER_ERROR = {
  NOT_FOUND: {
    code: 'STOCK_TRANSFER_NOT_FOUND',
    message: 'Không tìm thấy phiếu chuyển kho.',
  },
  SAME_WAREHOUSE: {
    code: 'STOCK_TRANSFER_SAME_WAREHOUSE',
    message: 'Kho xuất và kho nhận phải khác nhau.',
  },
  WAREHOUSE_INACTIVE: {
    code: 'STOCK_TRANSFER_WAREHOUSE_INACTIVE',
    message: 'Kho xuất và kho nhận đều phải đang hoạt động.',
  },
  SKU_NOT_FOUND: (skus: string[]) => ({
    code: 'STOCK_TRANSFER_SKU_NOT_FOUND',
    message: `Không tìm thấy SKU thường đang bán: ${skus.join(', ')}.`,
  }),
  DUPLICATE_SKU: {
    code: 'STOCK_TRANSFER_DUPLICATE_SKU',
    message: 'Mỗi SKU chỉ được xuất hiện một lần trong phiếu.',
  },
  INVALID_STATUS: (expected: string, target: string) => ({
    code: 'STOCK_TRANSFER_INVALID_STATUS',
    message: `Chỉ phiếu ở trạng thái ${expected} mới chuyển được sang ${target}.`,
  }),
  RECEIVE_REQUIRES_SHIPPED: {
    code: 'STOCK_TRANSFER_INVALID_STATUS',
    message: 'Chỉ nhận được phiếu đã xuất kho (SHIPPED).',
  },
  RECEIVE_ITEMS_MISMATCH: {
    code: 'STOCK_TRANSFER_RECEIVE_ITEMS_MISMATCH',
    message: 'Kết quả nhận phải có đủ và đúng một lần mỗi SKU của phiếu.',
  },
  RECEIVE_ITEM_MISSING: (sku: string) => ({
    code: 'STOCK_TRANSFER_RECEIVE_ITEMS_MISMATCH',
    message: `Thiếu kết quả nhận cho SKU ${sku}.`,
  }),
  RECEIVE_QUANTITY_MISMATCH: (sku: string) => ({
    code: 'STOCK_TRANSFER_RECEIVE_QUANTITY_MISMATCH',
    message: `SKU ${sku}: số nhận tốt + số hỏng phải bằng số đã xuất.`,
  }),
  DAMAGE_REASON_REQUIRED: (sku: string) => ({
    code: 'STOCK_TRANSFER_DAMAGE_REASON_REQUIRED',
    message: `SKU ${sku} có hàng hỏng nên cần ghi lý do hỏng.`,
  }),
  DAMAGE_REASON_NOT_ALLOWED: (sku: string) => ({
    code: 'STOCK_TRANSFER_DAMAGE_REASON_NOT_ALLOWED',
    message: `SKU ${sku} không có hàng hỏng nên không nhập lý do hỏng.`,
  }),
  INSUFFICIENT_STOCK: (sku: string) => ({
    code: 'STOCK_TRANSFER_INSUFFICIENT_STOCK',
    message: `Tồn khả dụng của ${sku} không đủ để xuất.`,
  }),
  ALREADY_RECEIVED_DIFFERENTLY: {
    code: 'STOCK_TRANSFER_ALREADY_RECEIVED',
    message: 'Phiếu đã được nhận với kết quả khác.',
  },
  OUT_OF_SCOPE: (side: 'source' | 'destination') => ({
    code: 'STOCK_TRANSFER_OUT_OF_SCOPE',
    message: side === 'source'
      ? 'Kho xuất nằm ngoài phạm vi chi nhánh được giao.'
      : 'Kho nhận nằm ngoài phạm vi chi nhánh được giao.',
  }),
  VERSION_STALE: {
    code: 'STOCK_TRANSFER_VERSION_STALE',
    message: 'Phiếu chuyển kho vừa được cập nhật. Vui lòng tải lại rồi thử lại.',
  },
  CONCURRENT_UPDATE: {
    code: 'STOCK_TRANSFER_CONCURRENT_UPDATE',
    message: 'Tồn kho vừa thay đổi đồng thời; vui lòng thử lại thao tác.',
  },
} as const;
