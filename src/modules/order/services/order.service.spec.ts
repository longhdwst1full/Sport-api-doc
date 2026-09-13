import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { AuthPrincipal } from '../../auth/auth.types';
import { AuditWriter } from '../../audit/audit.writer';
import { CartService } from '../../cart/cart.service';
import { ScopeType } from '../../iam/iam.types';
import { OrderService } from './order.service';

describe('OrderService admin query', () => {
  const findMany = jest.fn<Promise<never[]>, [Prisma.OrderFindManyArgs]>().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    order: { findMany, count },
  } as unknown as PrismaService;
  const service = new OrderService(
    prisma,
    {} as CartService,
    {} as AuditWriter,
    { get: jest.fn().mockReturnValue(30) } as unknown as ConfigService,
  );
  const principal = (scopes: AuthPrincipal['scopes']): AuthPrincipal => ({
    userId: '1',
    sessionId: '1',
    displayName: 'Owner',
    permissionVersion: '1',
    permissions: ['order.view'],
    scopes,
    mustChangePassword: false,
  });

  beforeEach(() => jest.clearAllMocks());

  it('maps the transport tab IN_TRANSIT to picking, packed and shipped states', async () => {
    await service.listAdmin(
      { page: 1, limit: 20, statusGroup: 'IN_TRANSIT' },
      principal([{ type: ScopeType.GLOBAL }]),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          {},
          { status: { in: ['PICKING', 'PACKED', 'SHIPPED'] } },
        ],
      },
    }));
    const include = findMany.mock.calls[0]?.[0].include as Record<string, unknown>;
    expect(include).not.toHaveProperty('statusHistory');
    expect(include.items).toEqual({ select: { quantity: true } });
  });

  it('applies branch scope and server-side recipient/order search together', async () => {
    await service.listAdmin(
      { page: 2, limit: 10, search: '0901' },
      principal([{ type: ScopeType.BRANCH, branchId: '12' }]),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: {
        AND: [
          { branchId: { in: [12n] } },
          expect.objectContaining({ OR: expect.any(Array) as unknown[] }),
        ],
      },
    }));
  });

  it('denies admin order access when no global or branch scope is assigned', async () => {
    await expect(service.listAdmin(
      { page: 1, limit: 20 },
      principal([]),
    )).rejects.toThrow('Tài khoản chưa được gán phạm vi chi nhánh');
    expect(findMany).not.toHaveBeenCalled();
  });
});
