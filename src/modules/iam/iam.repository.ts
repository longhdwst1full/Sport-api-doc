import { Role, ScopeType, UserRoleAssignment, UserWithAssignments } from './iam.types';
import { MutationContext } from '../../common/request/request-context';

export abstract class IamRepository {
  abstract listUsers(branchIds?: string[]): Promise<UserWithAssignments[]>;
  abstract listRoles(): Promise<Role[]>;
  abstract findActiveRoleByCode(code: string): Promise<Role | undefined>;
  abstract hasUser(id: string): Promise<boolean>;
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
}
