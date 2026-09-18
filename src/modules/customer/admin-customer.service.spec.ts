import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuditWriter } from '../audit/audit.writer';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { AdminCustomerService } from './admin-customer.service';

/**
 * Khách hàng không gắn trực tiếp vào chi nhánh; quan hệ đi qua đơn hàng. Bản đầu của
 * service này không nhận `AuthPrincipal` nên nhân viên một chi nhánh đọc được email, số
 * điện thoại, địa chỉ và lịch sử mua hàng của khách thuộc chi nhánh khác.
 */
describe('AdminCustomerService phạm vi chi nhánh', () => {
  // Gõ kiểu cho mock để đọc lại tham số mà không rơi về `any`.
  interface CustomerFindArgs {
    where: Prisma.CustomerWhereInput;
    include?: { orders?: { where?: Prisma.OrderWhereInput } };
  }
  const findMany = jest.fn<Promise<never[]>, [CustomerFindArgs]>().mockResolvedValue([]);
  const count = jest.fn<Promise<number>, [CustomerFindArgs]>().mockResolvedValue(0);
  const findFirst = jest.fn<Promise<unknown>, [CustomerFindArgs]>().mockResolvedValue(null);
  const queryRaw = jest.fn<Promise<never[]>, unknown[]>().mockResolvedValue([]);

  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    customer: { findMany, count, findFirst },
    $queryRaw: queryRaw,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const service = new AdminCustomerService(prisma, {} as AuditWriter);

  const owner: AuthPrincipal = {
    userId: '1',
    sessionId: '1',
    displayName: 'Chủ hệ thống',
    permissionVersion: '1',
    permissions: ['customer.view'],
    scopes: [{ type: ScopeType.GLOBAL }],
    mustChangePassword: false,
  };
  const branchStaff: AuthPrincipal = { ...owner, scopes: [{ type: ScopeType.BRANCH, branchId: '3' }] };

  beforeEach(() => jest.clearAllMocks());

  it('chủ hệ thống không bị giới hạn chi nhánh', async () => {
    await service.list({ page: 1, limit: 20 }, owner);

    expect(findMany.mock.calls[0][0].where.orders).toBeUndefined();
  });

  it('nhân viên chi nhánh chỉ thấy khách đã mua ở chi nhánh mình', async () => {
    await service.list({ page: 1, limit: 20 }, branchStaff);

    expect(findMany.mock.calls[0][0].where.orders).toEqual({
      some: { branchId: { in: [3n] } },
    });
  });

  it('đếm tổng cũng bị giới hạn theo chi nhánh, không chỉ trang hiện tại', async () => {
    await service.list({ page: 1, limit: 20 }, branchStaff);

    expect(count.mock.calls[0][0].where.orders).toEqual({
      some: { branchId: { in: [3n] } },
    });
  });

  /**
   * Trả "không tìm thấy" thay vì "không có quyền": báo sai quyền vẫn xác nhận khách đó
   * tồn tại, đủ để dò ID.
   */
  it('mở chi tiết khách ngoài chi nhánh thì báo không tìm thấy', async () => {
    findFirst.mockResolvedValueOnce(null);

    await expect(service.get('42', branchStaff)).rejects.toBeInstanceOf(NotFoundException);

    expect(findFirst.mock.calls[0][0].where.orders).toEqual({
      some: { branchId: { in: [3n] } },
    });
  });

  it('lịch sử đơn trong chi tiết chỉ gồm đơn của chi nhánh được gán', async () => {
    findFirst.mockResolvedValueOnce({
      id: 42n,
      customerNo: 'KH-42',
      name: 'Khách',
      email: null,
      phone: null,
      status: 'ACTIVE',
      userId: null,
      marketingConsent: false,
      createdAt: new Date(),
      addresses: [],
      orders: [],
    });

    await service.get('42', branchStaff);

    expect(findFirst.mock.calls[0][0].include?.orders?.where).toEqual({
      branchId: { in: [3n] },
    });
  });
});
