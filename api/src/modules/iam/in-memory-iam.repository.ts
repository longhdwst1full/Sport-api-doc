import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { V1_ROLE_PERMISSIONS } from './iam.permissions';
import { IamRepository } from './iam.repository';
import { Role, ScopeType, User, UserRoleAssignment, UserWithAssignments } from './iam.types';
import { MutationContext } from '../../common/request/request-context';

@Injectable()
export class InMemoryIamRepository extends IamRepository {
  private readonly ownerRoleId = randomUUID();
  private readonly branchManagerRoleId = randomUUID();
  private readonly staffRoleId = randomUUID();
  private readonly ownerUserId = randomUUID();

  private readonly roles: Role[] = [
    {
      id: this.ownerRoleId,
      code: 'OWNER',
      name: 'Chủ cửa hàng',
      description: 'Toàn quyền hệ thống và tất cả chi nhánh',
      status: 'ACTIVE',
      system: true,
      permissionCodes: [...V1_ROLE_PERMISSIONS.OWNER],
      version: 0,
    },
    {
      id: this.branchManagerRoleId,
      code: 'BRANCH_MANAGER',
      name: 'Branch Manager',
      description: 'Quản lý vận hành theo chi nhánh',
      status: 'ACTIVE',
      system: true,
      permissionCodes: [...V1_ROLE_PERMISSIONS.BRANCH_MANAGER],
      version: 0,
    },
    {
      id: this.staffRoleId,
      code: 'STAFF',
      name: 'Nhân viên',
      description: 'Thực hiện nghiệp vụ vận hành tại chi nhánh',
      status: 'ACTIVE',
      system: true,
      permissionCodes: [...V1_ROLE_PERMISSIONS.STAFF],
      version: 0,
    },
  ];

  private readonly assignments: UserRoleAssignment[] = [
    {
      id: randomUUID(),
      userId: this.ownerUserId,
      roleId: this.ownerRoleId,
      roleCode: 'OWNER',
      scopeType: ScopeType.GLOBAL,
      status: 'ACTIVE',
      validFrom: new Date().toISOString(),
    },
  ];

  private readonly users: User[] = [
    {
      id: this.ownerUserId,
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

  listUsers(branchIds?: string[]): Promise<UserWithAssignments[]> {
    return Promise.resolve(this.users.map((user) => ({
      ...user,
      assignments: this.assignments
        .filter((assignment) => assignment.userId === user.id)
        .map((assignment) => ({ ...assignment })),
    })).filter((user) => !branchIds || user.assignments.some(
      (assignment) => assignment.branchId && branchIds.includes(assignment.branchId),
    )));
  }

  listRoles(): Promise<Role[]> {
    return Promise.resolve(this.roles.map((role) => ({ ...role, permissionCodes: [...role.permissionCodes] })));
  }

  findActiveRoleByCode(code: string): Promise<Role | undefined> {
    const role = this.roles.find(
      (candidate) => candidate.code === code && candidate.status === 'ACTIVE',
    );
    return Promise.resolve(role ? { ...role, permissionCodes: [...role.permissionCodes] } : undefined);
  }

  hasUser(id: string): Promise<boolean> {
    return Promise.resolve(this.users.some((user) => user.id === id));
  }

  hasAssignment(
    userId: string,
    roleId: string,
    scopeType: ScopeType,
    branchId?: string,
  ): Promise<boolean> {
    return Promise.resolve(this.assignments.some(
      (assignment) =>
        assignment.userId === userId &&
        assignment.roleId === roleId &&
        assignment.scopeType === scopeType &&
        assignment.branchId === branchId,
    ));
  }

  saveAssignmentAndIncrementPermissionVersion(
    assignment: UserRoleAssignment,
    context: MutationContext,
  ): Promise<UserRoleAssignment> {
    const user = this.users.find((candidate) => candidate.id === assignment.userId);
    if (!user) throw new Error('User disappeared before assignment was saved');
    this.assignments.push({ ...assignment });
    user.permissionVersion += 1;
    void context;
    return Promise.resolve({ ...assignment });
  }
}
