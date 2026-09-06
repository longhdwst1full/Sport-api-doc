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
