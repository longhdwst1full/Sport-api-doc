import { BadRequestException } from '@nestjs/common';
import { InMemoryOrganizationRepository } from '../organization/in-memory-organization.repository';
import { OrganizationService } from '../organization/organization.service';
import { InMemoryIamRepository } from './in-memory-iam.repository';
import { IamService } from './iam.service';
import { ScopeType } from './iam.types';

describe('IamService', () => {
  const createService = () => {
    const organization = new OrganizationService(new InMemoryOrganizationRepository());
    const service = new IamService(new InMemoryIamRepository(), organization);
    return { organization, service };
  };

  it('rejects unknown permission codes when creating a role', () => {
    const { service } = createService();
    expect(() =>
      service.createRole({
        code: 'INVALID_ROLE',
        name: 'Invalid role',
        permissionCodes: ['permission.does.not.exist'],
      }),
    ).toThrow(BadRequestException);
  });

  it('validates branch scope and increments permission version', () => {
    const { organization, service } = createService();
    const user = service.listUsers().items.find((item) => item.permissionVersion === 0);
    const branch = organization.listBranches().items[0];
    expect(user).toBeDefined();

    const assignment = service.assignRole(user!.id, {
      roleCode: 'BRANCH_MANAGER',
      scopeType: ScopeType.BRANCH,
      branchId: branch.id,
    });

    expect(assignment.branchId).toBe(branch.id);
    expect(service.listUsers().items.find((item) => item.id === user!.id)?.permissionVersion).toBe(
      1,
    );
  });

  it('fails closed when a scope carries the wrong identifiers', () => {
    const { organization, service } = createService();
    const user = service.listUsers().items[0];
    const branch = organization.listBranches().items[0];

    expect(() =>
      service.assignRole(user.id, {
        roleCode: 'BRANCH_MANAGER',
        scopeType: ScopeType.GLOBAL,
        branchId: branch.id,
      }),
    ).toThrow(BadRequestException);
  });

  it('returns only active roles through the server-side lookup contract', () => {
    const { service } = createService();
    const result = service.searchActiveRoles({ search: 'super', page: 1, limit: 20 });

    expect(result.items).toEqual([
      expect.objectContaining({ code: 'SUPER_ADMIN', label: 'Super Admin' }),
    ]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, hasMore: false });
  });
});
