import { describe, expect, it } from 'vitest';
import {
  AssignUserRoleDtoRoleCode,
  AssignUserRoleDtoScopeType,
} from '@/generated/api/iam/models';
import { toAssignUserRoleDto } from './role-assignment.mapper';

describe('toAssignUserRoleDto', () => {
  it('only sends the identifier owned by BRANCH scope', () => {
    expect(
      toAssignUserRoleDto({
        roleCode: AssignUserRoleDtoRoleCode.BRANCH_MANAGER,
        scopeType: AssignUserRoleDtoScopeType.BRANCH,
        branchId: 'branch-1',
      }),
    ).toEqual({
      roleCode: AssignUserRoleDtoRoleCode.BRANCH_MANAGER,
      scopeType: AssignUserRoleDtoScopeType.BRANCH,
      branchId: 'branch-1',
    });
  });

  it('removes stale scope identifiers for GLOBAL scope', () => {
    expect(
      toAssignUserRoleDto({
        roleCode: AssignUserRoleDtoRoleCode.OWNER,
        scopeType: AssignUserRoleDtoScopeType.GLOBAL,
        branchId: 'stale-branch',
      }),
    ).toEqual({
      roleCode: AssignUserRoleDtoRoleCode.OWNER,
      scopeType: AssignUserRoleDtoScopeType.GLOBAL,
    });
  });
});
