import type { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { ReportingService } from './reporting.service';

describe('ReportingService phạm vi chi nhánh', () => {
  function principal(scopes: AuthPrincipal['scopes']): AuthPrincipal {
    return {
      userId: '1',
      sessionId: 's',
      displayName: 'Tester',
      permissionVersion: '1',
      permissions: [],
      scopes,
      mustChangePassword: false,
    };
  }

  function createService() {
    const findMany = jest.fn<Promise<unknown[]>, [{ where: Record<string, unknown> }]>()
      .mockResolvedValue([]);
    const prisma = {
      inventoryBalance: { findMany },
    } as unknown as PrismaService;
    return { service: new ReportingService(prisma), findMany };
  }

  /**
   * Hồi quy: `Warehouse.id` và `Warehouse.branch_id` là hai cột khác nhau.
   * Trước đây branch id bị đem so với `warehouseId`, làm quản lý chi nhánh
   * nhìn thấy tồn kho của chi nhánh khác hoặc không thấy gì.
   */
  it('lọc tồn kho qua quan hệ warehouse.branchId, không phải warehouseId', async () => {
    const { service, findMany } = createService();

    await service.inventory(
      principal([
        { type: ScopeType.BRANCH, branchId: '2' },
        { type: ScopeType.BRANCH, branchId: '3' },
      ]),
    );

    const where = findMany.mock.calls[0]?.[0].where;
    expect(where).toEqual({ warehouse: { branchId: { in: [2n, 3n] } } });
    expect(where).not.toHaveProperty('warehouseId');
  });

  it('phạm vi GLOBAL không áp bộ lọc chi nhánh nào', async () => {
    const { service, findMany } = createService();

    await service.inventory(principal([{ type: ScopeType.GLOBAL }]));

    expect(findMany.mock.calls[0]?.[0].where).toEqual({});
  });
});

describe('ReportingService gom doanh thu theo kỳ', () => {
  function principal(): AuthPrincipal {
    return {
      userId: '1',
      sessionId: 's',
      displayName: 'Tester',
      permissionVersion: '1',
      permissions: [],
      scopes: [{ type: ScopeType.GLOBAL }],
      mustChangePassword: false,
    };
  }

  /** Hai đơn ở hai tháng khác nhau, một trong số đó rơi vào khung giờ lệch UTC. */
  const orders = [
    { completedAt: new Date('2026-03-31T17:30:00.000Z'), grandTotal: '1000.00' },
    { completedAt: new Date('2026-04-20T03:00:00.000Z'), grandTotal: '2000.00' },
  ];

  function createService() {
    const emptyAggregate = { _sum: { grandTotal: null }, _count: { _all: 0 } };
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue(emptyAggregate),
        findMany: jest.fn().mockImplementation(({ select }: { select: Record<string, unknown> }) =>
          Promise.resolve('completedAt' in select ? orders : []),
        ),
      },
      // `revenue` chạy 5 truy vấn trong một transaction; ở đây chỉ cần chúng resolve theo đúng thứ tự.
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    } as unknown as PrismaService;
    return new ReportingService(prisma);
  }

  it('gom theo ngày khi không chọn mức nào', async () => {
    const report = await createService().revenue(
      { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', granularity: 'DAY' },
      principal(),
    );

    expect(report.granularity).toBe('DAY');
    expect(report.series.map((point) => point.date)).toEqual(['2026-04-01', '2026-04-20']);
  });

  /** 00:30 ngày 1/4 giờ Việt Nam là 17:30 ngày 31/3 UTC: gom theo UTC sẽ rơi nhầm sang tháng 3. */
  it('gom theo tháng bằng khoá giờ Việt Nam', async () => {
    const report = await createService().revenue(
      { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', granularity: 'MONTH' },
      principal(),
    );

    expect(report.series).toEqual([
      { date: '2026-04', amount: '3000.00', orderCount: 2 },
    ]);
  });

  it('gom theo quý và theo năm', async () => {
    const service = createService();
    const range = { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' };

    const quarterly = await service.revenue({ ...range, granularity: 'QUARTER' }, principal());
    const yearly = await service.revenue({ ...range, granularity: 'YEAR' }, principal());

    expect(quarterly.series.map((point) => point.date)).toEqual(['2026-Q2']);
    expect(yearly.series.map((point) => point.date)).toEqual(['2026']);
  });
});

describe('ReportingService phạm vi khách hàng trong overview', () => {
  function principal(scopes: AuthPrincipal['scopes']): AuthPrincipal {
    return {
      userId: '1',
      sessionId: 's',
      displayName: 'Tester',
      permissionVersion: '1',
      permissions: [],
      scopes,
      mustChangePassword: false,
    };
  }

  function createService() {
    const customerCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{}]),
      product: { count: jest.fn().mockResolvedValue(0) },
      customer: { count: customerCount },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    return { service: new ReportingService(prisma), customerCount };
  }

  /**
   * Hồi quy: `overview` từng đếm toàn bộ bảng khách, nên quản lý chi nhánh thấy tổng số khách
   * toàn hệ thống dù danh sách khách của họ đã bị thu hẹp.
   */
  it('đếm khách theo chi nhánh mà principal được xem', async () => {
    const { service, customerCount } = createService();

    await service.overview(principal([{ type: ScopeType.BRANCH, branchId: '2' }]));

    expect(customerCount).toHaveBeenCalledWith({
      where: { orders: { some: { branchId: { in: [2n] } } } },
    });
  });

  it('phạm vi GLOBAL đếm toàn bộ khách', async () => {
    const { service, customerCount } = createService();

    await service.overview(principal([{ type: ScopeType.GLOBAL }]));

    expect(customerCount).toHaveBeenCalledWith({ where: {} });
  });
});
