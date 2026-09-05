import {
  ROLE_ASSIGNMENT_STATUS,
  ROLE_STATUS,
  USER_STATUS,
  USER_TYPE,
} from './iam.constants';

export type UserType = (typeof USER_TYPE)[keyof typeof USER_TYPE];
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export type RoleStatus = (typeof ROLE_STATUS)[keyof typeof ROLE_STATUS];
export type RoleAssignmentStatus =
  (typeof ROLE_ASSIGNMENT_STATUS)[keyof typeof ROLE_ASSIGNMENT_STATUS];

export enum ScopeType {
  GLOBAL = 'GLOBAL',
  BRANCH = 'BRANCH',
}

export const SystemRoleCode = {
  OWNER: 'OWNER',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  STAFF: 'STAFF',
} as const;

export type SystemRoleCode = (typeof SystemRoleCode)[keyof typeof SystemRoleCode];

export const ASSIGNABLE_STAFF_ROLE_CODES = [
  SystemRoleCode.BRANCH_MANAGER,
  SystemRoleCode.STAFF,
] as const;

export type AssignableStaffRoleCode = (typeof ASSIGNABLE_STAFF_ROLE_CODES)[number];

export interface Permission {
  code: string;
  module: string;
  action: string;
  sensitive: boolean;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: RoleStatus;
  system: boolean;
  permissionCodes: string[];
  version: number;
}

export interface UserRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  roleCode: string;
  scopeType: ScopeType;
  branchId?: string;
  status: typeof ROLE_ASSIGNMENT_STATUS.ACTIVE;
  validFrom: string;
}

export interface User {
  id: string;
  displayName: string;
  maskedEmail: string;
  userType: typeof USER_TYPE.STAFF | typeof USER_TYPE.SYSTEM;
  status: UserStatus;
  permissionVersion: number;
  failedLoginAttempts: number;
  mustChangePassword: boolean;
  lockedAt?: string;
  lockReason?: string;
}

export interface UserWithAssignments extends User {
  assignments: UserRoleAssignment[];
}

export interface AssignUserRoleInput {
  roleCode: AssignableStaffRoleCode;
  scopeType: typeof ScopeType.BRANCH;
  branchId?: string;
}

export interface CreateStaffUserInput {
  displayName: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  role: Role;
  branchId: string;
}

export type NewUserRoleAssignment = Omit<UserRoleAssignment, 'id'>;

export interface LockStaffUserResult {
  user: UserWithAssignments;
  revokedSessionCount: number;
}
