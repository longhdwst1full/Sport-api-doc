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
