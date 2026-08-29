import { BadRequestException } from '@nestjs/common';
import { InMemoryOrganizationRepository } from '../organization/in-memory-organization.repository';
import { OrganizationService } from '../organization/organization.service';
import { InMemoryIamRepository } from './in-memory-iam.repository';
import { IamService } from './iam.service';
import { ScopeType, SystemRoleCode } from './iam.types';
import { AuthPrincipal } from '../auth/auth.types';

describe('IamService', () => {
  const context = { requestId: 'unit-request', actorUserId: 'unit-actor' };
  const ownerActor: AuthPrincipal = {
    userId: 'owner', sessionId: 'session', displayName: 'Owner', permissionVersion: '1',
    permissions: [], scopes: [{ type: ScopeType.GLOBAL }],
  };
  const createService = () => {
    const organization = new OrganizationService(new InMemoryOrganizationRepository());
    const service = new IamService(new InMemoryIamRepository(), organization);
    return { organization, service };
  };

  it('validates branch scope and increments permission version', async () => {
    const { organization, service } = createService();
    const user = (await service.listUsers(ownerActor)).items.find((item) => item.permissionVersion === 0);
    const branch = (await organization.listBranches()).items[0];
    expect(user).toBeDefined();

    const assignment = await service.assignRole(
      user!.id,
      {
        roleCode: SystemRoleCode.BRANCH_MANAGER,
        scopeType: ScopeType.BRANCH,
        branchId: branch.id,
      },
      context,
      ownerActor,
    );

    expect(assignment.branchId).toBe(branch.id);
    expect((await service.listUsers(ownerActor)).items.find((item) => item.id === user!.id)?.permissionVersion).toBe(
      1,
    );
  });

  it('fails closed when a scope carries the wrong identifiers', async () => {
    const { organization, service } = createService();
    const user = (await service.listUsers(ownerActor)).items[0];
    const branch = (await organization.listBranches()).items[0];

    await expect(
      service.assignRole(
        user.id,
        {
          roleCode: SystemRoleCode.BRANCH_MANAGER,
          scopeType: ScopeType.GLOBAL,
          branchId: branch.id,
        },
        context,
        ownerActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns only active roles through the server-side lookup contract', async () => {
    const { service } = createService();
    const result = await service.searchActiveRoles({ search: 'owner', page: 1, limit: 20 }, ownerActor);

    expect(result.items).toEqual([
      expect.objectContaining({ code: 'OWNER', label: 'Chủ cửa hàng' }),
    ]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, hasMore: false });
  });

  it('requires OWNER to use GLOBAL scope', async () => {
    const { organization, service } = createService();
    const user = (await service.listUsers(ownerActor)).items[1];
    const branch = (await organization.listBranches()).items[0];

    await expect(
      service.assignRole(
        user.id,
        {
          roleCode: SystemRoleCode.OWNER,
          scopeType: ScopeType.BRANCH,
          branchId: branch.id,
        },
        context,
        ownerActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires STAFF to use BRANCH scope', async () => {
    const { service } = createService();
    const user = (await service.listUsers(ownerActor)).items[1];

    await expect(
      service.assignRole(
        user.id,
        {
          roleCode: SystemRoleCode.STAFF,
          scopeType: ScopeType.GLOBAL,
        },
        context,
        ownerActor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('limits branch managers to STAFF assignments in their own branch', async () => {
    const { organization, service } = createService();
    const branch = (await organization.listBranches()).items[0];
    const user = (await service.listUsers(ownerActor)).items[1];
    const branchManager: AuthPrincipal = {
      ...ownerActor,
      userId: 'manager',
      scopes: [{ type: ScopeType.BRANCH, branchId: branch.id }],
    };

    await expect(service.assignRole(
      user.id,
      { roleCode: SystemRoleCode.OWNER, scopeType: ScopeType.GLOBAL },
      context,
      branchManager,
    )).rejects.toThrow('Branch manager can assign STAFF only within an assigned branch');

    const assignment = await service.assignRole(
      user.id,
      { roleCode: SystemRoleCode.STAFF, scopeType: ScopeType.BRANCH, branchId: branch.id },
      context,
      branchManager,
    );
    expect(assignment).toMatchObject({ roleCode: SystemRoleCode.STAFF, branchId: branch.id });
    expect((await service.listUsers(branchManager)).items.map(({ id }) => id)).toContain(user.id);
  });
});
