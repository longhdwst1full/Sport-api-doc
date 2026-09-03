import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ScopeType } from '../iam/iam.types';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('denies a branch-scoped principal even if a custom role grants the permission', async () => {
    const service = new AuditService({} as PrismaService);
    await expect(service.list({ limit: 25 }, {
      userId: 'user',
      sessionId: 'session',
      displayName: 'Branch manager',
      permissionVersion: '1',
      permissions: ['iam.audit.view'],
      scopes: [{ type: ScopeType.BRANCH, branchId: 'branch' }],
      mustChangePassword: false,
    })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
