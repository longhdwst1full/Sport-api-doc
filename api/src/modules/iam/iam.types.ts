export type UserStatus = 'ACTIVE' | 'INVITED' | 'LOCKED';
export type RoleStatus = 'ACTIVE' | 'INACTIVE';

export enum ScopeType {
  GLOBAL = 'GLOBAL',
  BRANCH = 'BRANCH',
}

export enum SystemRoleCode {
  OWNER = 'OWNER',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  STAFF = 'STAFF',
}

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
  status: 'ACTIVE';
  validFrom: string;
}

export interface User {
  id: string;
  displayName: string;
  maskedEmail: string;
  userType: 'STAFF' | 'SYSTEM';
  status: UserStatus;
  permissionVersion: number;
}

export interface UserWithAssignments extends User {
  assignments: UserRoleAssignment[];
}

export interface AssignUserRoleInput {
  roleCode: SystemRoleCode;
  scopeType: ScopeType;
  branchId?: string;
}
