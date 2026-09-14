import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InMemoryOrganizationRepository } from '../organization/in-memory-organization.repository';
import { OrganizationService } from '../organization/organization.service';
import { InMemoryIamRepository } from './in-memory-iam.repository';
import { IamService } from './iam.service';
import { PERMISSION_CATALOG } from './iam.permissions';
import { ScopeType } from './iam.types';
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

  it('never deletes a system role', async () => {
    const service = createService();
    const systemRole = (await service.listAllRoles()).items.find(({ system }) => system);
    expect(systemRole).toBeDefined();

    await expect(
      service.deleteRole(
        systemRole!.id,
        systemRole!.version,
        { expectedVersion: systemRole!.version, reason: 'thử xoá' },
        context,
        owner,
      ),
    ).rejects.toThrow(ForbiddenException);
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
