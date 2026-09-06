import { Prisma } from '@prisma/client';
import { toEntityId } from '../../common/identifiers/entity-id';
import { StockTransferDetailDto, StockTransferSummaryDto } from './stock-transfer.dto';
import type { StockTransferStatus } from './stock-transfer.constants';

export const stockTransferInclude = {
  fromWarehouse: true,
  toWarehouse: true,
  creator: true,
  shipper: true,
  receiver: true,
  items: {
    include: { productVariant: { include: { product: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.StockTransferInclude;

export type StockTransferRecord = Prisma.StockTransferGetPayload<{
  include: typeof stockTransferInclude;
}>;

export function mapStockTransferSummary(record: StockTransferRecord): StockTransferSummaryDto {
  return {
    id: toEntityId(record.id),
    transferNo: record.transferNo,
    fromWarehouseCode: record.fromWarehouse.code,
    toWarehouseCode: record.toWarehouse.code,
    status: record.status as StockTransferStatus,
    reason: record.reason,
    itemCount: record.items.length,
    version: toEntityId(record.version),
    createdByDisplayName: record.creator.displayName,
    createdAt: record.createdAt.toISOString(),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    shippedAt: record.shippedAt?.toISOString() ?? null,
    receivedAt: record.receivedAt?.toISOString() ?? null,
  };
}

export function mapStockTransferDetail(record: StockTransferRecord): StockTransferDetailDto {
  return {
    ...mapStockTransferSummary(record),
    shippedByDisplayName: record.shipper?.displayName ?? null,
    receivedByDisplayName: record.receiver?.displayName ?? null,
    items: record.items.map((item) => ({
      id: toEntityId(item.id),
      sku: item.productVariant.sku,
      productName: item.productVariant.product.name,
      requestedQuantity: item.requestedQty,
      shippedQuantity: item.shippedQty,
      receivedQuantity: item.receivedQty,
      damagedQuantity: item.damagedQty,
      damageReason: item.damageReason,
    })),
  };
}
