import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId } from '../../common/identifiers/entity-id';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import {
  InventoryReportDto,
  OverviewReportDto,
  ReportRangeQueryDto,
  RevenueReportDto,
  TopProductListDto,
  TopProductQueryDto,
} from './reporting.dto';

/**
 * Doanh thu ở đây là **tiền đã thực nhận**: chỉ cộng đơn có `paymentStatus = SUCCESS`.
 * Đơn COD chưa giao hay chuyển khoản chờ xác nhận nằm ở `pendingRevenue`, không trộn
 * vào doanh thu — trộn vào sẽ báo lãi cho khoản tiền chưa về.
 */
const PAID_STATUS = 'SUCCESS';
const DEFAULT_RANGE_DAYS = 30;

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: AuthPrincipal): Promise<OverviewReportDto> {
    const scope = this.scopeWhere(actor);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const since = this.daysAgo(now, DEFAULT_RANGE_DAYS);

    const [
      ordersToday,
      ordersLast30Days,
      ordersAwaitingFulfillment,
      ordersCancelledLast30Days,
      publishedProducts,
      customers,
    ] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { ...scope, placedAt: { gte: startOfToday } } }),
      this.prisma.order.count({ where: { ...scope, placedAt: { gte: since } } }),
      this.prisma.order.count({
        // Đơn đã huỷ vẫn giữ fulfillmentStatus = PENDING, nên phải loại theo trạng thái
        // đơn; nếu không thì đơn huỷ bị đếm nhầm là đang chờ giao.
        where: {
          ...scope,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
          fulfillmentStatus: { notIn: ['DELIVERED', 'CANCELLED'] },
        },
      }),
      this.prisma.order.count({
        where: { ...scope, status: 'CANCELLED', placedAt: { gte: since } },
      }),
      this.prisma.product.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.customer.count(),
    ]);

    // Tách khỏi $transaction dạng mảng: kiểu trả về của groupBy bị làm rộng khi gộp chung.
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: { ...scope, placedAt: { gte: since } },
      orderBy: { status: 'asc' },
      _count: { status: true },
    });

    return {
      ordersToday,
      ordersLast30Days,
      ordersAwaitingFulfillment,
      ordersCancelledLast30Days,
      publishedProducts,
      customers,
      ordersByStatus: grouped
        .map((row) => ({ status: row.status, count: row._count.status }))
        .sort((left, right) => right.count - left.count),
    };
  }

  async revenue(query: ReportRangeQueryDto, actor: AuthPrincipal): Promise<RevenueReportDto> {
    const { from, to } = this.resolveRange(query);
    const scope = this.scopeWhere(actor);
    const window = { placedAt: { gte: from, lte: to } };

    const [paid, pending, rows] = await this.prisma.$transaction([
      this.prisma.order.aggregate({
        where: { ...scope, ...window, paymentStatus: PAID_STATUS },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: {
          ...scope,
          ...window,
          paymentStatus: { notIn: [PAID_STATUS, 'CANCELLED', 'REFUNDED'] },
          status: { not: 'CANCELLED' },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { ...scope, ...window, paymentStatus: PAID_STATUS },
        select: { placedAt: true, grandTotal: true },
        orderBy: { placedAt: 'asc' },
      }),
    ]);

    const total = paid._sum.grandTotal ?? new Prisma.Decimal(0);
    const paidOrderCount = paid._count._all;

    // Gom theo ngày ở tầng ứng dụng: số đơn mỗi khoảng còn nhỏ, và làm vậy tránh
    // phụ thuộc vào múi giờ của database khi cắt ngày.
    const byDate = new Map<string, { amount: Prisma.Decimal; orderCount: number }>();
    for (const row of rows) {
      const key = row.placedAt.toISOString().slice(0, 10);
      const current = byDate.get(key) ?? { amount: new Prisma.Decimal(0), orderCount: 0 };
      byDate.set(key, {
        amount: current.amount.plus(row.grandTotal),
        orderCount: current.orderCount + 1,
      });
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalRevenue: total.toFixed(2),
      paidOrderCount,
      averageOrderValue:
        paidOrderCount > 0 ? total.dividedBy(paidOrderCount).toFixed(2) : '0.00',
      pendingRevenue: (pending._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
      series: [...byDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, value]) => ({
          date,
          amount: value.amount.toFixed(2),
          orderCount: value.orderCount,
        })),
    };
  }

  async inventory(actor: AuthPrincipal): Promise<InventoryReportDto> {
    const warehouseIds = this.visibleWarehouseFilter(actor);
    const where: Prisma.InventoryBalanceWhereInput = warehouseIds
      ? { warehouseId: { in: warehouseIds } }
      : {};

    const balances = await this.prisma.inventoryBalance.findMany({
      where,
      select: {
        onHand: true,
        reserved: true,
        reorderPoint: true,
        warehouse: { select: { name: true } },
        productVariant: { select: { sku: true, name: true } },
      },
    });

    const enriched = balances.map((row) => ({
      sku: row.productVariant.sku,
      productName: row.productVariant.name,
      warehouseName: row.warehouse.name,
      onHand: row.onHand,
      reserved: row.reserved,
      available: row.onHand - row.reserved,
      reorderPoint: row.reorderPoint,
    }));

    return {
      trackedBalances: enriched.length,
      outOfStock: enriched.filter((row) => row.available <= 0).length,
      lowStock: enriched.filter((row) => row.available <= row.reorderPoint).length,
      items: enriched
        .filter((row) => row.available <= row.reorderPoint)
        .sort((left, right) => left.available - right.available)
        .slice(0, 50),
    };
  }

  async topProducts(query: TopProductQueryDto, actor: AuthPrincipal): Promise<TopProductListDto> {
    const { from, to } = this.resolveRange(query);
    const scope = this.scopeWhere(actor);

    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { ...scope, placedAt: { gte: from, lte: to }, paymentStatus: PAID_STATUS },
      },
      select: {
        skuSnapshot: true,
        productNameSnapshot: true,
        quantity: true,
        finalUnitPrice: true,
      },
    });

    const bySku = new Map<
      string,
      { productName: string; quantitySold: number; revenue: Prisma.Decimal }
    >();
    for (const item of items) {
      const current = bySku.get(item.skuSnapshot) ?? {
        productName: item.productNameSnapshot,
        quantitySold: 0,
        revenue: new Prisma.Decimal(0),
      };
      bySku.set(item.skuSnapshot, {
        productName: current.productName,
        quantitySold: current.quantitySold + item.quantity,
        revenue: current.revenue.plus(item.finalUnitPrice.times(item.quantity)),
      });
    }

    return {
      items: [...bySku.entries()]
        .map(([sku, value]) => ({
          sku,
          productName: value.productName,
          quantitySold: value.quantitySold,
          revenue: value.revenue.toFixed(2),
        }))
        .sort((left, right) => right.quantitySold - left.quantitySold)
        .slice(0, query.limit),
    };
  }

  /** Quản lý chi nhánh chỉ thấy số của chi nhánh mình, không thấy doanh thu toàn hệ thống. */
  private scopeWhere(actor: AuthPrincipal): Prisma.OrderWhereInput {
    const branchIds = this.visibleBranchIds(actor);
    return branchIds ? { branchId: { in: branchIds } } : {};
  }

  private visibleBranchIds(actor: AuthPrincipal): bigint[] | undefined {
    if (actor.scopes.some(({ type }) => type === ScopeType.GLOBAL)) return undefined;
    return actor.scopes.flatMap(({ type, branchId }) =>
      type === ScopeType.BRANCH && branchId ? [toDatabaseId(branchId)] : [],
    );
  }

  private visibleWarehouseFilter(actor: AuthPrincipal): bigint[] | undefined {
    const branchIds = this.visibleBranchIds(actor);
    if (!branchIds) return undefined;
    // Kho gắn với chi nhánh; lọc theo branchId của kho ở tầng quan hệ là đủ.
    return branchIds;
  }

  private resolveRange(query: ReportRangeQueryDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : this.daysAgo(to, DEFAULT_RANGE_DAYS);
    return { from, to };
  }

  private daysAgo(anchor: Date, days: number): Date {
    const value = new Date(anchor);
    value.setDate(value.getDate() - days);
    value.setHours(0, 0, 0, 0);
    return value;
  }
}
