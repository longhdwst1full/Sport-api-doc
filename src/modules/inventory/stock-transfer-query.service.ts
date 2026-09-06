import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { StockTransferDetailDto, StockTransferListDto, StockTransferQueryDto } from './stock-transfer.dto';
import { mapStockTransferDetail, mapStockTransferSummary, stockTransferInclude } from './stock-transfer.mapper';

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
    if (!record) throw new NotFoundException('Stock transfer was not found');
    return mapStockTransferDetail(record);
  }

  private scopeWhere(principal: AuthPrincipal): Prisma.StockTransferWhereInput {
    if (principal.scopes.some(({ type }) => type === ScopeType.GLOBAL)) return {};
    const branchIds = principal.scopes
      .filter((scope) => scope.type === ScopeType.BRANCH && scope.branchId)
      .map((scope) => toDatabaseId(scope.branchId!));
    if (branchIds.length === 0) throw new ForbiddenException('No branch scope is assigned');
    return {
      OR: [
        { fromWarehouse: { branchId: { in: branchIds } } },
        { toWarehouse: { branchId: { in: branchIds } } },
      ],
    };
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable inventory storage is not enabled');
    }
  }
}
