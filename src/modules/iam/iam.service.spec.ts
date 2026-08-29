import { BadRequestException } from '@nestjs/common';
import { OrganizationService } from '../organization/organization.service';
import { ScopeType } from './iam.dto';
import { IamService } from './iam.service';

describe('IamService', () => {
  it('rejects unknown permission codes when creating a role', () => {
    const service = new IamService(new OrganizationService());
    expect(() =>
      service.createRole({
        code: 'INVALID_ROLE',
        name: 'Invalid role',
        permissionCodes: ['permission.does.not.exist'],
      }),
    ).toThrow(BadRequestException);
  });

  it('validates branch scope and increments permission version', () => {
    const organization = new OrganizationService();
    const service = new IamService(organization);
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
    const organization = new OrganizationService();
    const service = new IamService(organization);
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
});
