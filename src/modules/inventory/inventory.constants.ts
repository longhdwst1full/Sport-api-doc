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

