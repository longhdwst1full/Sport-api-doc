import {
  CreateRoleInput,
  CreateStaffUserInput,
  LockStaffUserResult,
  NewUserRoleAssignment,
  Role,
  ScopeType,
  UpdateRoleInput,
  UserRoleAssignment,
  UserWithAssignments,
} from './iam.types';
import { MutationContext } from '../../common/request/request-context';

export abstract class IamRepository {
  abstract listUsers(branchIds?: string[]): Promise<UserWithAssignments[]>;
  abstract findUser(id: string): Promise<UserWithAssignments | undefined>;
  abstract listRoles(): Promise<Role[]>;
  abstract listAllRoles(): Promise<Role[]>;
  abstract findRole(roleId: string): Promise<Role | undefined>;
  abstract hasRoleCode(code: string): Promise<boolean>;
  abstract countRoleAssignments(roleId: string): Promise<number>;
  abstract listMissingPermissionCodes(codes: string[]): Promise<string[]>;
  abstract createRole(input: CreateRoleInput, context: MutationContext): Promise<Role>;
  abstract updateRole(
    roleId: string,
    input: UpdateRoleInput,
    context: MutationContext,
  ): Promise<Role | undefined>;
  abstract deleteRole(
    roleId: string,
    reason: string,
    expectedVersion: number,
    context: MutationContext,
  ): Promise<boolean>;
  abstract findActiveRoleByCode(code: string): Promise<Role | undefined>;
  abstract hasUser(id: string): Promise<boolean>;
  abstract hasActiveEmail(normalizedEmail: string): Promise<boolean>;
  abstract hasAssignment(
    userId: string,
    roleId: string,
    scopeType: ScopeType,
    branchId?: string,
  ): Promise<boolean>;
  abstract saveAssignmentAndIncrementPermissionVersion(
    assignment: NewUserRoleAssignment,
    context: MutationContext,
  ): Promise<UserRoleAssignment>;
  abstract revokeAssignmentAndIncrementPermissionVersion(
    assignmentId: string,
    userId: string,
    reason: string,
    context: MutationContext,
  ): Promise<UserWithAssignments | undefined>;
  abstract createStaffUser(
    input: CreateStaffUserInput,
    context: MutationContext,
  ): Promise<UserWithAssignments>;
  abstract lockStaffUser(
    userId: string,
    reason: string,
    context: MutationContext,
  ): Promise<LockStaffUserResult | undefined>;
  abstract unlockStaffUserAndResetPassword(
    userId: string,
    passwordHash: string,
    context: MutationContext,
  ): Promise<UserWithAssignments | undefined>;
}
