import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { InventoryBalanceListDto } from './inventory.dto';
import {
  InventoryBalanceQueryDto,
  InventoryMovementListDto,
  InventoryMovementQueryDto,
  StockAdjustmentDetailDto,
  StockAdjustmentListDto,
  StockAdjustmentQueryDto,
  StockAdjustmentSummaryDto,
} from './inventory-query.dto';

interface InventoryCursor {
  occurredAt: string;
  id: string;
}

@Injectable()
export class InventoryQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listBalances(
    query: InventoryBalanceQueryDto,
    principal: AuthPrincipal,
  ): Promise<InventoryBalanceListDto> {
    this.ensurePersistence();
    const scope = this.scopeWhere(principal);
    const where: Prisma.InventoryBalanceWhereInput = {
      ...scope,
      ...(query.warehouseCode
        ? { warehouse: { ...scope.warehouse, code: query.warehouseCode.toUpperCase() } }
        : {}),
      ...(query.search
        ? {
            productVariant: {
              OR: [
                { sku: { contains: query.search, mode: 'insensitive' } },
                { product: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where,
        include: { warehouse: true, productVariant: { include: { product: true } } },
        orderBy: [{ warehouse: { code: 'asc' } }, { productVariant: { sku: 'asc' } }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);
    return {
      items: rows.map((row) => {
        const available = row.onHand - row.reserved;
        return {
          id: toEntityId(row.id),
          warehouseCode: row.warehouse.code,
          sku: row.productVariant.sku,
          productName: row.productVariant.product.name,
          onHand: row.onHand,
          reserved: row.reserved,
          available,
          reorderPoint: row.reorderPoint,
          status: available === 0
            ? 'OUT_OF_STOCK'
            : available <= row.reorderPoint ? 'LOW_STOCK' : 'IN_STOCK',
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async listMovements(
    query: InventoryMovementQueryDto,
    principal: AuthPrincipal,
  ): Promise<InventoryMovementListDto> {
    this.ensurePersistence();
    this.assertDateRange(query.from, query.to);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const scope = this.scopeWhere(principal);
    const where: Prisma.InventoryMovementWhereInput = {
      ...scope,
      ...(query.warehouseCode
        ? { warehouse: { ...scope.warehouse, code: query.warehouseCode.toUpperCase() } }
        : {}),
      ...(query.sku
        ? { productVariant: { sku: { contains: query.sku, mode: 'insensitive' } } }
        : {}),
      ...(query.movementType ? { movementType: query.movementType } : {}),
      ...(query.referenceType ? { referenceType: query.referenceType.toUpperCase() } : {}),
      ...(query.referenceId ? { referenceId: query.referenceId } : {}),
      ...((query.from || query.to) && {
        occurredAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      }),
      ...(cursor && {
        OR: [
          { occurredAt: { lt: new Date(cursor.occurredAt) } },
          { occurredAt: new Date(cursor.occurredAt), id: { lt: toDatabaseId(cursor.id) } },
        ],
      }),
    };
    const rows = await this.prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        warehouse: true,
        productVariant: { include: { product: true } },
        creator: { select: { displayName: true } },
      },
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: toEntityId(row.id),
        warehouseCode: row.warehouse.code,
        sku: row.productVariant.sku,
        productName: row.productVariant.product.name,
        movementType: row.movementType,
        quantityDelta: row.quantityDelta,
        balanceAfter: row.balanceAfter,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        reason: row.reason,
        createdBy: toEntityId(row.createdBy),
        createdByDisplayName: row.creator.displayName,
        occurredAt: row.occurredAt.toISOString(),
      })),
      nextCursor: hasMore && last
        ? this.encodeCursor(last.occurredAt, last.id)
        : null,
    };
  }

  async listAdjustments(
    query: StockAdjustmentQueryDto,
    principal: AuthPrincipal,
  ): Promise<StockAdjustmentListDto> {
    this.ensurePersistence();
    this.assertDateRange(query.from, query.to);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const scope = this.scopeWhere(principal);
    const where: Prisma.StockAdjustmentWhereInput = {
      ...scope,
      ...(query.warehouseCode
        ? { warehouse: { ...scope.warehouse, code: query.warehouseCode.toUpperCase() } }
        : {}),
      ...((query.from || query.to) && {
        postedAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      }),
      ...(cursor && {
        OR: [
          { postedAt: { lt: new Date(cursor.occurredAt) } },
          { postedAt: new Date(cursor.occurredAt), id: { lt: toDatabaseId(cursor.id) } },
        ],
      }),
    };
    const rows = await this.prisma.stockAdjustment.findMany({
      where,
      orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { warehouse: true, creator: { select: { displayName: true } }, _count: { select: { items: true } } },
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.adjustmentSummary(row)),
      nextCursor: hasMore && last ? this.encodeCursor(last.postedAt, last.id) : null,
    };
  }

  async getAdjustment(id: string, principal: AuthPrincipal): Promise<StockAdjustmentDetailDto> {
    this.ensurePersistence();
    const row = await this.prisma.stockAdjustment.findFirst({
      where: { id: toDatabaseId(id), ...this.scopeWhere(principal) },
      include: {
        warehouse: true,
        creator: { select: { displayName: true } },
        items: { include: { productVariant: { include: { product: true } } }, orderBy: { id: 'asc' } },
        _count: { select: { items: true } },
      },
    });
    if (!row) throw new NotFoundException('Stock adjustment not found');
    return {
      ...this.adjustmentSummary(row),
      items: row.items.map((item) => ({
        id: toEntityId(item.id),
        sku: item.productVariant.sku,
        productName: item.productVariant.product.name,
        quantityDelta: item.quantityDelta,
        expectedOnHand: item.expectedOnHand,
        actualOnHand: item.actualOnHand,
        note: item.note,
      })),
    };
  }

  private scopeWhere(principal: AuthPrincipal): { warehouse?: Prisma.WarehouseWhereInput } {
    if (principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL)) return {};
    const branchIds = principal.scopes
      .filter((scope) => scope.type === ScopeType.BRANCH && scope.branchId)
      .map((scope) => toDatabaseId(scope.branchId!));
    if (branchIds.length === 0) throw new ForbiddenException('Branch scope is required');
    return { warehouse: { branchId: { in: branchIds } } };
  }

  private adjustmentSummary(row: {
    id: bigint;
    adjustmentNo: string;
    adjustmentType: string;
    reasonCode: string;
    externalReference: string | null;
    sourceName: string | null;
    reason: string;
    status: string;
    createdBy: bigint;
    postedAt: Date;
    warehouse: { code: string };
    creator: { displayName: string };
    _count: { items: number };
  }): StockAdjustmentSummaryDto {
    return {
      id: toEntityId(row.id),
      adjustmentNo: row.adjustmentNo,
      warehouseCode: row.warehouse.code,
      adjustmentType: row.adjustmentType,
      reasonCode: row.reasonCode,
      externalReference: row.externalReference,
      sourceName: row.sourceName,
      reason: row.reason,
      status: row.status,
      itemCount: row._count.items,
      createdBy: toEntityId(row.createdBy),
      createdByDisplayName: row.creator.displayName,
      postedAt: row.postedAt.toISOString(),
    };
  }

  private encodeCursor(occurredAt: Date, id: bigint): string {
    return Buffer.from(JSON.stringify({ occurredAt: occurredAt.toISOString(), id: toEntityId(id) }))
      .toString('base64url');
  }

  private decodeCursor(value: string): InventoryCursor {
    try {
      const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as InventoryCursor;
      if (!cursor.id || Number.isNaN(new Date(cursor.occurredAt).getTime())) throw new Error();
      toDatabaseId(cursor.id);
      return cursor;
    } catch {
      throw new BadRequestException('Inventory cursor is invalid');
    }
  }

  private assertDateRange(from?: string, to?: string): void {
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException('Inventory date range is invalid');
    }
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable inventory storage is not enabled');
    }
  }
}
