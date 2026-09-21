import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  startOfVietnamDay,
  vietnamDateKey,
  vietnamDaysAgo,
  vietnamMonthKey,
  vietnamQuarterKey,
  vietnamYearKey,
} from '../../common/time/vietnam-time';
import { toDatabaseId } from '../../common/identifiers/entity-id';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import {
  InventoryReportDto,
  OverviewReportDto,
  ReportRangeQueryDto,
  RevenueReportDto,
  RevenueReportQueryDto,
  TopCustomerListDto,
  TopProductListDto,
  TopProductQueryDto,
  type ReportGranularity,
} from './reporting.dto';

/** Khoá gom của từng mức; tất cả tính theo giờ Việt Nam. */
const PERIOD_KEY: Record<ReportGranularity, (value: Date) => string> = {
  DAY: vietnamDateKey,
  MONTH: vietnamMonthKey,
  QUARTER: vietnamQuarterKey,
  YEAR: vietnamYearKey,
};

/**
 * Ghi nhận doanh thu theo **vòng đời đơn hàng**, không theo trạng thái thanh toán:
 *
 * - `COMPLETED` → doanh thu thực nhận. Đơn đã giao xong và qua cửa sổ giữ, không còn
 *   khả năng hoàn huỷ thông thường.
 * - `DELIVERED` → dự thu. Đã giao tới khách, worker sẽ tự chuyển COMPLETED sau cửa sổ giữ.
 * - `CONFIRMED…SHIPPED` → đang xử lý. Tách riêng để không có khoản tiền nào biến mất
 *   khỏi báo cáo, nhưng cũng không bị đếm nhầm là đã thu.
 */
const COMPLETED_STATUS = 'COMPLETED';
const DELIVERED_STATUS = 'DELIVERED';
const IN_PROGRESS_STATUSES = ['CONFIRMED', 'PICKING', 'PACKED', 'SHIPPED'];
const DEFAULT_RANGE_DAYS = 30;

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: AuthPrincipal): Promise<OverviewReportDto> {
    const branchIds = this.visibleBranchIds(actor);
    const now = new Date();
    // Cắt ngày theo giờ cửa hàng, không theo giờ máy chủ: máy chủ chạy UTC thì "hôm nay"
    // bắt đầu lúc 7h sáng giờ Việt Nam và bỏ sót đơn đặt trước đó.
    const startOfToday = startOfVietnamDay(now);
    const since = this.daysAgo(now, DEFAULT_RANGE_DAYS);

    // Gộp 6 phép đếm thành MỘT câu lệnh bằng đếm có điều kiện. Database ở xa nên chi phí
    // là số vòng mạng: 7 truy vấn riêng mất ~1.6s, gộp lại còn một vòng.
    // Tham số truyền qua $queryRaw dạng tagged template nên vẫn được bind an toàn.
    const branchFilter = branchIds
      ? Prisma.sql`AND o.branch_id IN (${Prisma.join(branchIds)})`
      : Prisma.empty;

    const [counts] = await this.prisma.$queryRaw<
      {
        orders_today: bigint;
        orders_last_30: bigint;
        orders_awaiting: bigint;
        orders_cancelled: bigint;
      }[]
    >`
      SELECT
        count(*) FILTER (WHERE o.placed_at >= ${startOfToday}) AS orders_today,
        count(*) FILTER (WHERE o.placed_at >= ${since}) AS orders_last_30,
        count(*) FILTER (
          WHERE o.status NOT IN ('CANCELLED', 'COMPLETED')
            AND o.fulfillment_status NOT IN ('DELIVERED', 'CANCELLED')
        ) AS orders_awaiting,
        count(*) FILTER (
          WHERE o.status = 'CANCELLED' AND o.placed_at >= ${since}
        ) AS orders_cancelled
      FROM public.orders o
      WHERE true ${branchFilter}
    `;

    const [publishedProducts, customers, grouped] = await Promise.all([
      this.prisma.product.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.customer.count({ where: this.customerScopeWhere(branchIds) }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { ...this.scopeWhere(actor), placedAt: { gte: since } },
        orderBy: { status: 'asc' },
        _count: { status: true },
      }),
    ]);

    return {
      ordersToday: Number(counts?.orders_today ?? 0),
      ordersLast30Days: Number(counts?.orders_last_30 ?? 0),
      ordersAwaitingFulfillment: Number(counts?.orders_awaiting ?? 0),
      ordersCancelledLast30Days: Number(counts?.orders_cancelled ?? 0),
      publishedProducts,
      customers,
      ordersByStatus: grouped
        .map((row) => ({ status: row.status, count: row._count.status }))
        .sort((left, right) => right.count - left.count),
    };
  }

  async revenue(query: RevenueReportQueryDto, actor: AuthPrincipal): Promise<RevenueReportDto> {
    const { from, to } = this.resolveRange(query);
    const scope = this.scopeWhere(actor);
    const granularity = query.granularity ?? 'DAY';
    const periodKey = PERIOD_KEY[granularity];

    // Doanh thu cắt theo mốc HOÀN TẤT, không theo mốc đặt hàng: đơn đặt tháng trước mà
    // hoàn tất tháng này thì tiền thuộc về tháng này.
    const completedWindow = { status: COMPLETED_STATUS, completedAt: { gte: from, lte: to } };
    const placedWindow = { placedAt: { gte: from, lte: to } };

    const [completed, expected, inProgress, rows, branchRows] = await this.prisma.$transaction([
      this.prisma.order.aggregate({
        where: { ...scope, ...completedWindow },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { ...scope, ...placedWindow, status: DELIVERED_STATUS },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      this.prisma.order.aggregate({
        where: { ...scope, ...placedWindow, status: { in: IN_PROGRESS_STATUSES } },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { ...scope, ...completedWindow },
        select: { completedAt: true, grandTotal: true },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.order.findMany({
        where: {
          ...scope,
          OR: [completedWindow, { ...placedWindow, status: DELIVERED_STATUS }],
        },
        select: {
          status: true,
          grandTotal: true,
          branch: { select: { name: true } },
        },
      }),
    ]);

    const completedTotal = completed._sum.grandTotal ?? new Prisma.Decimal(0);
    const completedOrderCount = completed._count._all;

    // Gom theo ngày ở tầng ứng dụng: số đơn mỗi khoảng còn nhỏ, và làm vậy tránh phụ
    // thuộc vào múi giờ của database khi cắt ngày. Khoá ngày lấy theo giờ Việt Nam —
    // dùng UTC sẽ đẩy đơn đặt lúc 0h–7h sáng sang ngày hôm trước.
    const byDate = new Map<string, { amount: Prisma.Decimal; orderCount: number }>();
    for (const row of rows) {
      if (!row.completedAt) continue;
      const key = periodKey(row.completedAt);
      const current = byDate.get(key) ?? { amount: new Prisma.Decimal(0), orderCount: 0 };
      byDate.set(key, {
        amount: current.amount.plus(row.grandTotal),
        orderCount: current.orderCount + 1,
      });
    }

    const byBranch = new Map<
      string,
      { completedRevenue: Prisma.Decimal; completedOrderCount: number; expectedRevenue: Prisma.Decimal }
    >();
    for (const row of branchRows) {
      const key = row.branch.name;
      const current = byBranch.get(key) ?? {
        completedRevenue: new Prisma.Decimal(0),
        completedOrderCount: 0,
        expectedRevenue: new Prisma.Decimal(0),
      };
      if (row.status === COMPLETED_STATUS) {
        current.completedRevenue = current.completedRevenue.plus(row.grandTotal);
        current.completedOrderCount += 1;
      } else {
        current.expectedRevenue = current.expectedRevenue.plus(row.grandTotal);
      }
      byBranch.set(key, current);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      completedRevenue: completedTotal.toFixed(2),
      completedOrderCount,
      expectedRevenue: (expected._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
      expectedOrderCount: expected._count._all,
      inProgressRevenue: (inProgress._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
      averageOrderValue:
        completedOrderCount > 0 ? completedTotal.dividedBy(completedOrderCount).toFixed(2) : '0.00',
      granularity,
      series: [...byDate.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, value]) => ({
          date,
          amount: value.amount.toFixed(2),
          orderCount: value.orderCount,
        })),
      byBranch: [...byBranch.entries()]
        .map(([branchName, value]) => ({
          branchName,
          completedRevenue: value.completedRevenue.toFixed(2),
          completedOrderCount: value.completedOrderCount,
          expectedRevenue: value.expectedRevenue.toFixed(2),
        }))
        .sort((left, right) => Number(right.completedRevenue) - Number(left.completedRevenue)),
    };
  }

  /**
   * Khách mua nhiều nhất theo tiền đã thực trả.
   *
   * Cùng chuẩn với doanh thu: chỉ tính đơn `COMPLETED` trong khoảng, cắt theo mốc hoàn tất. Mọi đơn
   * đều gắn một hồ sơ khách (`orders.customer_id` NOT NULL), kể cả khách mua tại quầy, nên bảng này
   * phản ánh cả hai kênh.
   */
  async topCustomers(query: TopProductQueryDto, actor: AuthPrincipal): Promise<TopCustomerListDto> {
    const { from, to } = this.resolveRange(query);
    const scope = this.scopeWhere(actor);

    const orders = await this.prisma.order.findMany({
      where: {
        ...scope,
        status: COMPLETED_STATUS,
        completedAt: { gte: from, lte: to },
      },
      select: {
        grandTotal: true,
        customer: { select: { customerNo: true, name: true } },
      },
    });

    const byCustomer = new Map<
      string,
      { name: string; orderCount: number; revenue: Prisma.Decimal }
    >();
    for (const order of orders) {
      const key = order.customer.customerNo;
      const current = byCustomer.get(key) ?? {
        name: order.customer.name,
        orderCount: 0,
        revenue: new Prisma.Decimal(0),
      };
      byCustomer.set(key, {
        name: current.name,
        orderCount: current.orderCount + 1,
        revenue: current.revenue.plus(order.grandTotal),
      });
    }

    return {
      items: [...byCustomer.entries()]
        .map(([customerNo, value]) => ({
          customerNo,
          name: value.name,
          orderCount: value.orderCount,
          revenue: value.revenue.toFixed(2),
        }))
        .sort((left, right) => Number(right.revenue) - Number(left.revenue))
        .slice(0, query.limit),
    };
  }

  async inventory(actor: AuthPrincipal): Promise<InventoryReportDto> {
    const where = this.inventoryScopeWhere(actor);

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
        // Bán chạy tính trên đơn đã hoàn tất, cùng chuẩn với doanh thu.
        order: { ...scope, status: COMPLETED_STATUS, completedAt: { gte: from, lte: to } },
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

  /**
   * Khách hàng thuộc phạm vi một chi nhánh khi đã từng đặt đơn ở chi nhánh đó — cùng quy tắc với
   * `AdminCustomerService`. Trước đây `overview` đếm toàn bộ bảng khách, nên quản lý chi nhánh nhìn
   * thấy tổng số khách toàn hệ thống trong khi danh sách khách của họ chỉ hiện một phần.
   *
   * SECURITY: quy tắc này phải trùng với quy tắc của màn hình danh sách khách; lệch nhau là rò rỉ
   * quy mô dữ liệu của chi nhánh khác qua con số tổng.
   */
  private customerScopeWhere(branchIds: bigint[] | undefined): Prisma.CustomerWhereInput {
    if (!branchIds) return {};
    return { orders: { some: { branchId: { in: branchIds } } } };
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

  /**
   * Tồn kho lọc qua quan hệ `warehouse.branchId`, KHÔNG phải `warehouseId`.
   * `Warehouse.id` và `Warehouse.branch_id` là hai cột khác nhau; đem branch id
   * so với warehouse id sẽ trả về kho của chi nhánh khác hoặc rỗng.
   */
  private inventoryScopeWhere(actor: AuthPrincipal): Prisma.InventoryBalanceWhereInput {
    const branchIds = this.visibleBranchIds(actor);
    if (!branchIds) return {};
    return { warehouse: { branchId: { in: branchIds } } };
  }

  /**
   * Khoảng thời gian thực tế của một báo cáo, kể cả khi client bỏ trống.
   *
   * Công khai vì phần xuất file phải đặt đúng khoảng này vào tên file; tự suy diễn lại mặc định ở
   * chỗ khác là cách để tên file và nội dung file nói hai khoảng khác nhau.
   */
  resolveRange(query: ReportRangeQueryDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : this.daysAgo(to, DEFAULT_RANGE_DAYS);
    return { from, to };
  }

  private daysAgo(anchor: Date, days: number): Date {
    return vietnamDaysAgo(anchor, days);
  }
}
