import { Injectable } from '@nestjs/common';
import {
  ROLE_ASSIGNMENT_STATUS,
  ROLE_STATUS,
  USER_STATUS,
  USER_TYPE,
} from './iam.constants';
import { V1_ROLE_PERMISSIONS } from './iam.permissions';
import { IamRepository } from './iam.repository';
import {
  CreateStaffUserInput,
  LockStaffUserResult,
  NewUserRoleAssignment,
  Role,
  ScopeType,
  SystemRoleCode,
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
  private sequence = 7;
  private readonly ownerRoleId = '1';
  private readonly branchManagerRoleId = '2';
  private readonly staffRoleId = '3';
  private readonly ownerUserId = '4';
  private readonly normalizedEmails = new Set(['long@dctd.vn', 'nam@dctd.vn']);

  private readonly roles: Role[] = [
    {
      id: this.ownerRoleId,
      code: SystemRoleCode.OWNER,
      name: 'Chủ cửa hàng',
      description: 'Toàn quyền hệ thống và tất cả chi nhánh',
      status: ROLE_STATUS.ACTIVE,
      system: true,
      permissionCodes: [...V1_ROLE_PERMISSIONS.OWNER],
      version: 0,
    },
    {
      id: this.branchManagerRoleId,
      code: SystemRoleCode.BRANCH_MANAGER,
      name: 'Branch Manager',
      description: 'Quản lý vận hành theo chi nhánh',
      status: ROLE_STATUS.ACTIVE,
      system: true,
      permissionCodes: [...V1_ROLE_PERMISSIONS.BRANCH_MANAGER],
      version: 0,
    },
    {
      id: this.staffRoleId,
      code: SystemRoleCode.STAFF,
      name: 'Nhân viên',
      description: 'Thực hiện nghiệp vụ vận hành tại chi nhánh',
      status: ROLE_STATUS.ACTIVE,
      system: true,
      permissionCodes: [...V1_ROLE_PERMISSIONS.STAFF],
      version: 0,
    },
  ];

  private readonly assignments: UserRoleAssignment[] = [
    {
      id: '5',
      userId: this.ownerUserId,
      roleId: this.ownerRoleId,
      roleCode: SystemRoleCode.OWNER,
      scopeType: ScopeType.GLOBAL,
      status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
      validFrom: new Date().toISOString(),
    },
  ];

  private readonly users: User[] = [
    {
      id: this.ownerUserId,
      displayName: 'Long Hoàng',
      maskedEmail: 'lo***@dctd.vn',
      userType: USER_TYPE.STAFF,
      status: USER_STATUS.ACTIVE,
      permissionVersion: 1,
      failedLoginAttempts: 0,
      mustChangePassword: false,
    },
    {
      id: '6',
      displayName: 'Nguyễn Hoàng Nam',
      maskedEmail: 'na***@dctd.vn',
      userType: USER_TYPE.STAFF,
      status: USER_STATUS.ACTIVE,
      permissionVersion: 0,
      failedLoginAttempts: 0,
      mustChangePassword: true,
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
      (candidate) => candidate.code === code && candidate.status === ROLE_STATUS.ACTIVE,
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
    assignment: NewUserRoleAssignment,
    context: MutationContext,
  ): Promise<UserRoleAssignment> {
    const user = this.users.find((candidate) => candidate.id === assignment.userId);
    if (!user) throw new Error('User disappeared before assignment was saved');
    const saved = { ...assignment, id: this.nextEntityId() };
    this.assignments.push(saved);
    user.permissionVersion += 1;
    void context;
    return Promise.resolve({ ...saved });
  }

  async revokeAssignmentAndIncrementPermissionVersion(
    assignmentId: string,
    userId: string,
    reason: string,
    context: MutationContext,
  ): Promise<UserWithAssignments | undefined> {
    const index = this.assignments.findIndex(
      (assignment) => assignment.id === assignmentId && assignment.userId === userId,
    );
    if (index < 0) return undefined;
    this.assignments.splice(index, 1);
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user) return undefined;
    user.permissionVersion += 1;
    void reason;
    void context;
    return this.findUser(userId);
  }

  createStaffUser(
    input: CreateStaffUserInput,
    context: MutationContext,
  ): Promise<UserWithAssignments> {
    if (this.normalizedEmails.has(input.normalizedEmail)) {
      throw new Error('User email already exists');
    }
    const user: User = {
      id: this.nextEntityId(),
      displayName: input.displayName,
      maskedEmail: maskEmail(input.normalizedEmail),
      userType: USER_TYPE.STAFF,
      status: USER_STATUS.ACTIVE,
      permissionVersion: 1,
      failedLoginAttempts: 0,
      mustChangePassword: true,
    };
    const assignment: UserRoleAssignment = {
      id: this.nextEntityId(),
      userId: user.id,
      roleId: input.role.id,
      roleCode: input.role.code,
      scopeType: ScopeType.BRANCH,
      branchId: input.branchId,
      status: ROLE_ASSIGNMENT_STATUS.ACTIVE,
      validFrom: new Date().toISOString(),
    };
    this.users.push(user);
    this.normalizedEmails.add(input.normalizedEmail);
    this.assignments.push(assignment);
    void context;
    return Promise.resolve({ ...user, assignments: [{ ...assignment }] });
  }

  private nextEntityId(): string {
    const id = String(this.sequence);
    this.sequence += 1;
    return id;
  }

  async lockStaffUser(
    userId: string,
    reason: string,
    context: MutationContext,
  ): Promise<LockStaffUserResult | undefined> {
    const user = this.users.find((candidate) => candidate.id === userId);
    if (!user || user.status !== USER_STATUS.ACTIVE) return undefined;
    user.status = USER_STATUS.LOCKED;
    user.lockedAt = new Date().toISOString();
    user.lockReason = reason;
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
    if (!user || user.status !== USER_STATUS.LOCKED) return undefined;
    user.status = USER_STATUS.ACTIVE;
    user.failedLoginAttempts = 0;
    user.mustChangePassword = true;
    delete user.lockedAt;
    delete user.lockReason;
    user.permissionVersion += 1;
    void passwordHash;
    void context;
    return this.findUser(userId);
  }
}
