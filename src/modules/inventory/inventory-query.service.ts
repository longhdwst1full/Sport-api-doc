import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { requireVisibleBranchIds, warehouseBranchScopeWhere } from '../../common/security/branch-scope';
import { InventoryBalanceListDto, InventoryBalanceSummaryDto } from './inventory.dto';
import { classifyInventoryBalance } from './inventory.constants';
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
    const where = this.balanceWhere(query, principal);
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
          status: classifyInventoryBalance(row),
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Số liệu tổng hợp của toàn bộ dòng tồn khớp bộ lọc, gộp NGAY TẠI PostgreSQL.
   *
   * Bản trước tải mọi dòng khớp về Node rồi cộng: SKU × kho tăng thì bộ nhớ API, lưu lượng
   * Supabase và thời gian tải dashboard tăng theo. Giờ chỉ một dòng kết quả đi qua mạng.
   *
   * `LOW_STOCK`/`OUT_OF_STOCK` so sánh giữa các cột (`on_hand - reserved` với `reorder_point`) mà
   * Prisma `where` không diễn đạt được, nên dùng raw SQL. Để thẻ số liệu không lệch bảng bên dưới:
   * - bộ lọc của cả hai sinh từ cùng `balanceFilter` (phạm vi chi nhánh, mã kho, từ khoá);
   * - `CASE` giữ đúng thứ tự của `classifyInventoryBalance` (hết hàng trước, rồi sắp hết). Sửa quy tắc
   *   phân loại thì sửa cả hai chỗ và test đi kèm.
   */
  async summarizeBalances(
    query: InventoryBalanceQueryDto,
    principal: AuthPrincipal,
  ): Promise<InventoryBalanceSummaryDto> {
    this.ensurePersistence();
    const filter = this.balanceFilter(query, principal);
    const conditions: Prisma.Sql[] = [];
    if (filter.branchIds) {
      // SECURITY: phạm vi chi nhánh rỗng vẫn phải ra 0 dòng, không được rơi về "không lọc".
      conditions.push(filter.branchIds.length > 0
        ? Prisma.sql`w.branch_id IN (${Prisma.join(filter.branchIds)})`
        : Prisma.sql`FALSE`);
    }
    if (filter.warehouseCode) conditions.push(Prisma.sql`w.code = ${filter.warehouseCode}`);
    if (filter.search) {
      // Giống `contains` của Prisma: khớp chuỗi con, không coi `%`/`_` của người dùng là wildcard.
      const pattern = `%${filter.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      conditions.push(Prisma.sql`(v.sku ILIKE ${pattern} OR p.name ILIKE ${pattern})`);
    }
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const [row] = await this.prisma.$queryRaw<Array<{
      tracked: bigint;
      in_stock: bigint;
      low_stock: bigint;
      out_of_stock: bigint;
      total_on_hand: bigint | null;
      total_reserved: bigint | null;
    }>>(Prisma.sql`
      SELECT
        COUNT(*) AS tracked,
        COUNT(*) FILTER (WHERE b.on_hand - b.reserved <> 0 AND b.on_hand - b.reserved > b.reorder_point) AS in_stock,
        COUNT(*) FILTER (WHERE b.on_hand - b.reserved <> 0 AND b.on_hand - b.reserved <= b.reorder_point) AS low_stock,
        COUNT(*) FILTER (WHERE b.on_hand - b.reserved = 0) AS out_of_stock,
        SUM(b.on_hand) AS total_on_hand,
        SUM(b.reserved) AS total_reserved
      FROM inventory_balances b
      JOIN warehouses w ON w.id = b.warehouse_id
      JOIN product_variants v ON v.id = b.product_variant_id
      JOIN products p ON p.id = v.product_id
      ${where}
    `);
    const totalOnHand = Number(row?.total_on_hand ?? 0);
    const totalReserved = Number(row?.total_reserved ?? 0);
    return {
      trackedBalances: Number(row?.tracked ?? 0),
      inStock: Number(row?.in_stock ?? 0),
      lowStock: Number(row?.low_stock ?? 0),
      outOfStock: Number(row?.out_of_stock ?? 0),
      totalOnHand,
      totalReserved,
      totalAvailable: totalOnHand - totalReserved,
    };
  }

  /** Bộ lọc tồn kho đã chuẩn hoá; nguồn DUY NHẤT cho cả Prisma `where` lẫn SQL tổng hợp. */
  private balanceFilter(query: InventoryBalanceQueryDto, principal: AuthPrincipal) {
    return {
      // Cùng quy tắc strict với `scopeWhere`: không có phạm vi hợp lệ thì ném 403 thay vì trả rỗng.
      branchIds: requireVisibleBranchIds(principal),
      warehouseCode: query.warehouseCode ? query.warehouseCode.toUpperCase() : undefined,
      search: query.search || undefined,
    };
  }

  /**
   * Bộ lọc dùng chung cho danh sách và số liệu tổng hợp.
   *
   * Phải là một hàm duy nhất: hai bản sao của cùng bộ lọc là cách để thẻ "12 dòng sắp hết" không
   * còn ứng với bảng đang hiện bên dưới.
   */
  private balanceWhere(
    query: InventoryBalanceQueryDto,
    principal: AuthPrincipal,
  ): Prisma.InventoryBalanceWhereInput {
    const filter = this.balanceFilter(query, principal);
    const branchScope = filter.branchIds ? { branchId: { in: filter.branchIds } } : undefined;
    return {
      ...(branchScope || filter.warehouseCode
        ? { warehouse: { ...branchScope, ...(filter.warehouseCode ? { code: filter.warehouseCode } : {}) } }
        : {}),
      ...(filter.search
        ? {
            productVariant: {
              OR: [
                { sku: { contains: filter.search, mode: 'insensitive' } },
                { product: { name: { contains: filter.search, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
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

  /**
   * `strict`: tồn kho là màn thao tác, nên tài khoản chưa được gán chi nhánh nhận 403 thay vì một
   * bảng rỗng không giải thích được.
   */
  private scopeWhere(principal: AuthPrincipal): { warehouse?: Prisma.WarehouseWhereInput } {
    return warehouseBranchScopeWhere(principal, { strict: true });
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
