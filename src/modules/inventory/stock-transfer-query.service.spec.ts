import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { StockTransferQueryService } from './stock-transfer-query.service';

const principal = (scopes: AuthPrincipal['scopes']): AuthPrincipal => ({
  userId: '1',
  sessionId: 'session',
  displayName: 'Manager',
  permissionVersion: '1',
  permissions: [],
  scopes,
  mustChangePassword: false,
});

describe('StockTransferQueryService', () => {
  it('requires at least one global or branch scope', async () => {
    const prisma = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as PrismaService;
    const service = new StockTransferQueryService(prisma);
    await expect(service.list({ page: 1, limit: 25 }, principal([])))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits branch users to transfers whose source or destination belongs to their branch', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockTransfer: { findMany, count },
    } as unknown as PrismaService;
    const service = new StockTransferQueryService(prisma);

    await service.list(
      { page: 1, limit: 25 },
      principal([{ type: ScopeType.BRANCH, branchId: '9' }]),
    );

    const queryCalls = findMany.mock.calls as unknown as Array<[{
      where: { AND: Array<Record<string, unknown>> };
    }]>;
    const queryCall = queryCalls[0][0];
    expect(queryCall.where.AND[0]).toEqual({ OR: [
        { fromWarehouse: { branchId: { in: [9n] } } },
        { toWarehouse: { branchId: { in: [9n] } } },
      ] });
    expect(count).toHaveBeenCalled();
  });

  it('does not reveal an out-of-scope transfer detail', async () => {
    const prisma = {
      isEnabled: jest.fn().mockReturnValue(true),
      stockTransfer: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new StockTransferQueryService(prisma);

    await expect(service.get('10', principal([{ type: ScopeType.BRANCH, branchId: '9' }])))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
