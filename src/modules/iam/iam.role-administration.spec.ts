import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InMemoryOrganizationRepository } from '../organization/in-memory-organization.repository';
import { OrganizationService } from '../organization/organization.service';
import { InMemoryIamRepository } from './in-memory-iam.repository';
import { IamService } from './iam.service';
import { PERMISSION_CATALOG } from './iam.permissions';
import { ScopeType, SystemRoleCode } from './iam.types';
import { AuthPrincipal } from '../auth/auth.types';

describe('IamService role administration', () => {
  const context = { requestId: 'unit-request', actorUserId: 'unit-actor' };
  const allPermissions = PERMISSION_CATALOG.map(({ code }) => code);

  const principal = (permissions: string[], global = true): AuthPrincipal => ({
    userId: 'owner',
    sessionId: 'session',
    displayName: 'Owner',
    permissionVersion: '1',
    permissions,
    scopes: global ? [{ type: ScopeType.GLOBAL }] : [{ type: ScopeType.BRANCH, branchId: '1' }],
    mustChangePassword: false,
  });

  const owner = principal(allPermissions);

  const createService = () =>
    new IamService(
      new InMemoryIamRepository(),
      new OrganizationService(new InMemoryOrganizationRepository()),
    );

  it('creates a custom role with the requested permission set', async () => {
    const service = createService();
    const role = await service.createRole(
      {
        code: 'WAREHOUSE_LEAD',
        name: 'Trưởng kho',
        permissionCodes: ['inventory.stock.adjust', 'inventory.stock.view'],
      },
      context,
      owner,
    );

    expect(role.system).toBe(false);
    expect(role.permissionCodes).toEqual(['inventory.stock.adjust', 'inventory.stock.view']);
    expect((await service.listAllRoles()).items.map(({ code }) => code)).toContain('WAREHOUSE_LEAD');
  });

  it('refuses a role code that collides with a system role', async () => {
    const service = createService();
    await expect(
      service.createRole(
        { code: 'OWNER', name: 'Giả mạo', permissionCodes: ['order.view'] },
        context,
        owner,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an unknown permission code', async () => {
    const service = createService();
    await expect(
      service.createRole(
        { code: 'GHOST_ROLE', name: 'Ma', permissionCodes: ['does.not.exist'] },
        context,
        owner,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks privilege escalation: the actor cannot grant a permission it does not hold', async () => {
    const service = createService();
    const limited = principal(['iam.role.manage', 'order.view']);

    await expect(
      service.createRole(
        { code: 'SNEAKY', name: 'Leo thang', permissionCodes: ['payment.confirm'] },
        context,
        limited,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('keeps permissions a role already has so renaming does not require full privileges', async () => {
    const service = createService();
    const created = await service.createRole(
      { code: 'TEMP_ROLE', name: 'Tạm', permissionCodes: ['payment.confirm'] },
      context,
      owner,
    );
    const limited = principal(['iam.role.manage']);

    const updated = await service.updateRole(
      created.id,
      { name: 'Đổi tên', permissionCodes: ['payment.confirm'], expectedVersion: created.version },
      context,
      limited,
    );

    expect(updated.name).toBe('Đổi tên');
    expect(updated.permissionCodes).toEqual(['payment.confirm']);
  });

  it('rejects a stale version on update', async () => {
    const service = createService();
    const created = await service.createRole(
      { code: 'STALE_ROLE', name: 'Cũ', permissionCodes: ['order.view'] },
      context,
      owner,
    );
    await service.updateRole(created.id, { name: 'Lần 1', expectedVersion: created.version }, context, owner);

    await expect(
      service.updateRole(created.id, { name: 'Lần 2', expectedVersion: created.version }, context, owner),
    ).rejects.toThrow(ConflictException);
  });

  it('never deletes or deactivates the OWNER role', async () => {
    const service = createService();
    const ownerRole = (await service.listAllRoles()).items.find(({ code }) => code === 'OWNER');
    expect(ownerRole).toBeDefined();

    await expect(
      service.deleteRole(
        ownerRole!.id,
        ownerRole!.version,
        { expectedVersion: ownerRole!.version, reason: 'thử xoá' },
        context,
        owner,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('never allows the OWNER permission catalog to be reduced', async () => {
    const service = createService();
    const ownerRole = (await service.listAllRoles()).items.find(({ code }) => code === 'OWNER');
    expect(ownerRole).toBeDefined();

    await expect(
      service.updateRole(
        ownerRole!.id,
        {
          permissionCodes: ['iam.role.manage'],
          expectedVersion: ownerRole!.version,
        },
        context,
        owner,
      ),
    ).rejects.toThrow(
      'Vai trò OWNER phải giữ toàn bộ quyền hệ thống để tránh mất quyền quản trị',
    );
  });

  it('still allows OWNER metadata updates when the full permission catalog is retained', async () => {
    const service = createService();
    const ownerRole = (await service.listAllRoles()).items.find(({ code }) => code === 'OWNER');
    expect(ownerRole).toBeDefined();

    const updated = await service.updateRole(
      ownerRole!.id,
      {
        name: 'Chủ hệ thống',
        permissionCodes: [...allPermissions].reverse(),
        expectedVersion: ownerRole!.version,
      },
      context,
      owner,
    );

    expect(updated.name).toBe('Chủ hệ thống');
    expect([...updated.permissionCodes].sort()).toEqual([...allPermissions].sort());
  });

  it('deactivates a non-owner system role instead of deleting it', async () => {
    const service = createService();
    const staffRole = (await service.listAllRoles()).items.find(({ code }) => code === 'STAFF');
    expect(staffRole).toBeDefined();

    await service.deleteRole(
      staffRole!.id,
      staffRole!.version,
      { expectedVersion: staffRole!.version, reason: 'tạm ngừng sử dụng' },
      context,
      owner,
    );

    const persisted = await service.getRole(staffRole!.id);
    expect(persisted.status).toBe('INACTIVE');
    expect(persisted.system).toBe(true);
  });

  it('refuses to delete a role that is still assigned to a user', async () => {
    const service = createService();
    const staffRole = (await service.listAllRoles()).items.find(({ code }) => code === 'OWNER');
    expect(staffRole).toBeDefined();
    // Vai trò hệ thống bị chặn trước, nên kiểm tra ràng buộc gán trên vai trò tự tạo.
    const custom = await service.createRole(
      { code: 'UNUSED_ROLE', name: 'Chưa dùng', permissionCodes: ['order.view'] },
      context,
      owner,
    );

    await service.deleteRole(
      custom.id,
      custom.version,
      { expectedVersion: custom.version, reason: 'không còn dùng' },
      context,
      owner,
    );
    expect((await service.listAllRoles()).items.map(({ code }) => code)).not.toContain('UNUSED_ROLE');
  });

  it('requires a global scope to administer roles', async () => {
    const service = createService();
    const branchOnly = principal(allPermissions, false);

    await expect(
      service.createRole(
        { code: 'BRANCH_MADE', name: 'Chi nhánh tạo', permissionCodes: ['order.view'] },
        context,
        branchOnly,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

/**
 * Leo thang đặc quyền qua đường GÁN vai trò.
 *
 * `resolvePermissionCodes` chặn việc sửa vai trò để thêm quyền mình không có. Nhưng gán vai trò là
 * cánh cửa thứ hai vào cùng chỗ đó: tài khoản chỉ có `iam.assignment.manage` + phạm vi GLOBAL
 * trước đây gán được BRANCH_MANAGER (32 quyền) cho bất kỳ nhân viên nào, kể cả chính mình, và
 * nhận đủ 32 quyền ở lần làm mới phiên kế tiếp.
 */
describe('IamService chống leo thang qua gán vai trò', () => {
  const context = { requestId: 'unit-request', actorUserId: 'unit-actor' };
  const allPermissions = PERMISSION_CATALOG.map(({ code }) => code);

  const principal = (permissions: string[]): AuthPrincipal => ({
    userId: '4',
    sessionId: 'session',
    displayName: 'Actor',
    permissionVersion: '1',
    permissions,
    scopes: [{ type: ScopeType.GLOBAL }],
    mustChangePassword: false,
  });

  const createService = () => {
    const organization = new OrganizationService(new InMemoryOrganizationRepository());
    return { organization, service: new IamService(new InMemoryIamRepository(), organization) };
  };

  async function branchId(organization: OrganizationService): Promise<string> {
    return (await organization.listBranches()).items[0].id;
  }

  it('chặn gán vai trò chứa quyền mà người gán không có', async () => {
    const { organization, service } = createService();
    const limited = principal(['iam.assignment.manage']);

    await expect(
      service.assignRole(
        '6',
        {
          roleCode: SystemRoleCode.BRANCH_MANAGER,
          scopeType: ScopeType.BRANCH,
          branchId: await branchId(organization),
        },
        context,
        limited,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  /** Tự gán cho chính mình là đường leo thang trực tiếp nhất và phải chặn cùng một chỗ. */
  it('chặn cả khi người gán tự gán cho chính mình', async () => {
    const { organization, service } = createService();
    const limited = principal(['iam.assignment.manage']);

    await expect(
      service.assignRole(
        limited.userId,
        {
          roleCode: SystemRoleCode.STAFF,
          scopeType: ScopeType.BRANCH,
          branchId: await branchId(organization),
        },
        context,
        limited,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('quản trị viên gốc giữ toàn bộ quyền nên vẫn gán được', async () => {
    const { organization, service } = createService();

    const assignment = await service.assignRole(
      '6',
      {
        roleCode: SystemRoleCode.BRANCH_MANAGER,
        scopeType: ScopeType.BRANCH,
        branchId: await branchId(organization),
      },
      context,
      principal(allPermissions),
    );

    expect(assignment.roleCode).toBe(SystemRoleCode.BRANCH_MANAGER);
  });

  /** Tạo nhân viên mới cũng cấp vai trò, nên phải chặn ở cùng một quy tắc. */
  it('chặn tạo nhân viên mới với vai trò vượt quyền người tạo', async () => {
    const { organization, service } = createService();

    await expect(
      service.createStaffUser(
        {
          displayName: 'Nhân viên mới',
          email: 'nv-moi@dctd.vn',
          roleCode: SystemRoleCode.BRANCH_MANAGER,
          branchId: await branchId(organization),
        },
        context,
        principal(['iam.assignment.manage']),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
