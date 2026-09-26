import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { requireVisibleBranchIds } from '../../common/security/branch-scope';
import { StockTransferDetailDto, StockTransferListDto, StockTransferQueryDto } from './stock-transfer.dto';
import { mapStockTransferDetail, mapStockTransferSummary, stockTransferInclude } from './stock-transfer.mapper';
import { INVENTORY_ERROR } from './inventory.constants';
import { STOCK_TRANSFER_ERROR } from './stock-transfer.constants';

@Injectable()
export class StockTransferQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: StockTransferQueryDto, principal: AuthPrincipal): Promise<StockTransferListDto> {
    this.ensurePersistence();
    const scope = this.scopeWhere(principal);
    const warehouseCode = query.warehouseCode?.trim().toUpperCase();
    const where: Prisma.StockTransferWhereInput = {
      AND: [
        scope,
        query.status ? { status: query.status } : {},
        query.search ? {
          OR: [
            { transferNo: { contains: query.search.trim(), mode: 'insensitive' } },
            { reason: { contains: query.search.trim(), mode: 'insensitive' } },
          ],
        } : {},
        warehouseCode ? {
          OR: [{ fromWarehouse: { code: warehouseCode } }, { toWarehouse: { code: warehouseCode } }],
        } : {},
      ],
    };
    const [records, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        include: stockTransferInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return { items: records.map(mapStockTransferSummary), total, page: query.page, limit: query.limit };
  }

  async get(id: string, principal: AuthPrincipal): Promise<StockTransferDetailDto> {
    this.ensurePersistence();
    const record = await this.prisma.stockTransfer.findFirst({
      where: { id: toDatabaseId(id), AND: [this.scopeWhere(principal)] },
      include: stockTransferInclude,
    });
    if (!record) throw new NotFoundException(STOCK_TRANSFER_ERROR.NOT_FOUND);
    return mapStockTransferDetail(record);
  }

  private scopeWhere(principal: AuthPrincipal): Prisma.StockTransferWhereInput {
    // Hình dạng bộ lọc riêng (kho gửi HOẶC kho nhận), nhưng phần tính danh sách chi nhánh vẫn
    // dùng chung một nguồn với mọi module khác.
    const branchIds = requireVisibleBranchIds(principal);
    if (!branchIds) return {};
    return {
      OR: [
        { fromWarehouse: { branchId: { in: branchIds } } },
        { toWarehouse: { branchId: { in: branchIds } } },
      ],
    };
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException(INVENTORY_ERROR.STORAGE_DISABLED);
    }
  }
}
