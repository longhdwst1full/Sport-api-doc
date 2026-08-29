import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PERMISSION_CATALOG } from './iam.permissions';
import { IamRepository } from './iam.repository';
import { Role, ScopeType, User, UserRoleAssignment, UserWithAssignments } from './iam.types';

@Injectable()
export class InMemoryIamRepository extends IamRepository {
  private readonly superAdminRoleId = randomUUID();
  private readonly branchManagerRoleId = randomUUID();
  private readonly superAdminUserId = randomUUID();

  private readonly roles: Role[] = [
    {
      id: this.superAdminRoleId,
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      description: 'Quản trị toàn bộ hệ thống',
      status: 'ACTIVE',
      system: true,
      permissionCodes: PERMISSION_CATALOG.map((permission) => permission.code),
      version: 0,
    },
    {
      id: this.branchManagerRoleId,
      code: 'BRANCH_MANAGER',
      name: 'Branch Manager',
      description: 'Quản lý vận hành theo chi nhánh',
      status: 'ACTIVE',
      system: true,
      permissionCodes: ['org.branch.view', 'org.warehouse.view'],
      version: 0,
    },
  ];

  private readonly assignments: UserRoleAssignment[] = [
    {
      id: randomUUID(),
      userId: this.superAdminUserId,
      roleId: this.superAdminRoleId,
      roleCode: 'SUPER_ADMIN',
      scopeType: ScopeType.GLOBAL,
      status: 'ACTIVE',
      validFrom: new Date().toISOString(),
    },
  ];

  private readonly users: User[] = [
    {
      id: this.superAdminUserId,
      displayName: 'Long Hoàng',
      maskedEmail: 'lo***@dctd.vn',
      userType: 'STAFF',
      status: 'ACTIVE',
      permissionVersion: 1,
    },
    {
      id: randomUUID(),
      displayName: 'Nguyễn Hoàng Nam',
      maskedEmail: 'na***@dctd.vn',
      userType: 'STAFF',
      status: 'ACTIVE',
      permissionVersion: 0,
    },
  ];

  listUsers(): UserWithAssignments[] {
    return this.users.map((user) => ({
      ...user,
      assignments: this.assignments
        .filter((assignment) => assignment.userId === user.id)
        .map((assignment) => ({ ...assignment })),
    }));
  }

  listRoles(): Role[] {
    return this.roles.map((role) => ({ ...role, permissionCodes: [...role.permissionCodes] }));
  }

  hasRoleCode(code: string): boolean {
    return this.roles.some((role) => role.code === code);
  }

  findActiveRoleByCode(code: string): Role | undefined {
    const role = this.roles.find(
      (candidate) => candidate.code === code && candidate.status === 'ACTIVE',
    );
    return role ? { ...role, permissionCodes: [...role.permissionCodes] } : undefined;
  }

  hasUser(id: string): boolean {
    return this.users.some((user) => user.id === id);
  }

  hasAssignment(
    userId: string,
    roleId: string,
    scopeType: ScopeType,
    branchId?: string,
    warehouseId?: string,
  ): boolean {
    return this.assignments.some(
      (assignment) =>
        assignment.userId === userId &&
        assignment.roleId === roleId &&
        assignment.scopeType === scopeType &&
        assignment.branchId === branchId &&
        assignment.warehouseId === warehouseId,
    );
  }

  saveRole(role: Role): Role {
    this.roles.push({ ...role, permissionCodes: [...role.permissionCodes] });
    return { ...role, permissionCodes: [...role.permissionCodes] };
  }

  saveAssignmentAndIncrementPermissionVersion(assignment: UserRoleAssignment): UserRoleAssignment {
    const user = this.users.find((candidate) => candidate.id === assignment.userId);
    if (!user) throw new Error('User disappeared before assignment was saved');
    this.assignments.push({ ...assignment });
    user.permissionVersion += 1;
    return { ...assignment };
  }
}
