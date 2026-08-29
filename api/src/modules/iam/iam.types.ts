export type UserStatus = 'ACTIVE' | 'INVITED' | 'LOCKED';
export type RoleStatus = 'ACTIVE' | 'INACTIVE';

export enum ScopeType {
  GLOBAL = 'GLOBAL',
  BRANCH = 'BRANCH',
  WAREHOUSE = 'WAREHOUSE',
  OWN = 'OWN',
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
  warehouseId?: string;
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

export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
}

export interface AssignUserRoleInput {
  roleCode: string;
  scopeType: ScopeType;
  branchId?: string;
  warehouseId?: string;
}
