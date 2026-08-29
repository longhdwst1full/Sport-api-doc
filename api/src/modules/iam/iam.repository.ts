import { Role, ScopeType, UserRoleAssignment, UserWithAssignments } from './iam.types';

export abstract class IamRepository {
  abstract listUsers(): UserWithAssignments[];
  abstract listRoles(): Role[];
  abstract hasRoleCode(code: string): boolean;
  abstract findActiveRoleByCode(code: string): Role | undefined;
  abstract hasUser(id: string): boolean;
  abstract hasAssignment(
    userId: string,
    roleId: string,
    scopeType: ScopeType,
    branchId?: string,
    warehouseId?: string,
  ): boolean;
  abstract saveRole(role: Role): Role;
  abstract saveAssignmentAndIncrementPermissionVersion(
    assignment: UserRoleAssignment,
  ): UserRoleAssignment;
}
