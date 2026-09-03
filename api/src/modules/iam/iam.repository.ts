import {
  CreateStaffUserInput,
  LockStaffUserResult,
  Role,
  ScopeType,
  UserRoleAssignment,
  UserWithAssignments,
} from './iam.types';
import { MutationContext } from '../../common/request/request-context';

export abstract class IamRepository {
  abstract listUsers(branchIds?: string[]): Promise<UserWithAssignments[]>;
  abstract findUser(id: string): Promise<UserWithAssignments | undefined>;
  abstract listRoles(): Promise<Role[]>;
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
    assignment: UserRoleAssignment,
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
