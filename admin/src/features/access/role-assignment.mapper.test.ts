import { describe, expect, it } from 'vitest';
import { AssignUserRoleDtoScopeType } from '@/generated/api/iam/models';
import { toAssignUserRoleDto } from './role-assignment.mapper';

describe('toAssignUserRoleDto', () => {
  it('only sends the identifier owned by BRANCH scope', () => {
    expect(
      toAssignUserRoleDto({
        roleCode: 'BRANCH_MANAGER',
        scopeType: AssignUserRoleDtoScopeType.BRANCH,
        branchId: 'branch-1',
        warehouseId: 'stale-warehouse',
      }),
    ).toEqual({
      roleCode: 'BRANCH_MANAGER',
      scopeType: AssignUserRoleDtoScopeType.BRANCH,
      branchId: 'branch-1',
    });
  });

  it('removes stale scope identifiers for GLOBAL scope', () => {
    expect(
      toAssignUserRoleDto({
        roleCode: 'SUPER_ADMIN',
        scopeType: AssignUserRoleDtoScopeType.GLOBAL,
        branchId: 'stale-branch',
        warehouseId: 'stale-warehouse',
      }),
    ).toEqual({
      roleCode: 'SUPER_ADMIN',
      scopeType: AssignUserRoleDtoScopeType.GLOBAL,
    });
  });
});
