import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { V1_ROLE_PERMISSIONS } from './iam.permissions';
import { IamRepository } from './iam.repository';
import {
  CreateStaffUserInput,
  LockStaffUserResult,
  Role,
  ScopeType,
  User,
  UserRoleAssignment,
  UserWithAssignments,
} from './iam.types';
import { MutationContext } from '../../common/request/request-context';

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

@Injectable()
export class InMemoryIamRepository extends IamRepository {
  private readonly ownerRoleId = randomUUID();
  private readonly branchManagerRoleId = randomUUID();
  private readonly staffRoleId = randomUUID();
  private readonly ownerUserId = randomUUID();
  private readonly normalizedEmails = new Set(['long@dctd.vn', 'nam@dctd.vn']);

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

  async findUser(id: string): Promise<UserWithAssignments | undefined> {
    return (await this.listUsers()).find((user) => user.id === id);
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

  hasActiveEmail(normalizedEmail: string): Promise<boolean> {
    return Promise.resolve(this.normalizedEmails.has(normalizedEmail));
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

  createStaffUser(
    input: CreateStaffUserInput,
    context: MutationContext,
  ): Promise<UserWithAssignments> {
    if (this.normalizedEmails.has(input.normalizedEmail)) {
      throw new Error('User email already exists');
    }
    const user: User = {
      id: input.id,
      displayName: input.displayName,
      maskedEmail: maskEmail(input.normalizedEmail),
      userType: 'STAFF',
      status: 'ACTIVE',
      permissionVersion: 1,
    };
    const assignment: UserRoleAssignment = {
      id: input.assignmentId,
      userId: input.id,
      roleId: input.role.id,
      roleCode: input.role.code,
      scopeType: ScopeType.BRANCH,
      branchId: input.branchId,
      status: 'ACTIVE',
      validFrom: new Date().toISOString(),
    };
    this.users.push(user);
    this.normalizedEmails.add(input.normalizedEmail);
    this.assignments.push(assignment);
    void context;
    return Promise.resolve({ ...user, assignments: [{ ...assignment }] });
  }

  async lockStaffUser(
    userId: string,
    reason: string,
    context: MutationContext,
  ): Promise<LockStaffUserResult | undefined> {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user || user.status !== 'ACTIVE') return undefined;
    user.status = 'LOCKED';
    user.permissionVersion += 1;
    void reason;
    void context;
    const result = await this.findUser(userId);
    if (!result) throw new Error('Locked staff user disappeared');
    return { user: result, revokedSessionCount: 0 };
  }

  async unlockStaffUserAndResetPassword(
    userId: string,
    passwordHash: string,
    context: MutationContext,
  ): Promise<UserWithAssignments | undefined> {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user || user.status !== 'LOCKED') return undefined;
    user.status = 'ACTIVE';
    user.permissionVersion += 1;
    void passwordHash;
    void context;
    return this.findUser(userId);
  }
}
