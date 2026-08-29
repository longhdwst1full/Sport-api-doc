import {
  AssignUserRoleDtoScopeType,
  type AssignUserRoleDtoRoleCode,
  type AssignUserRoleDto,
} from '@/generated/api/iam/models';

export interface AssignmentFormValues {
  roleCode: AssignUserRoleDtoRoleCode | '';
  scopeType: AssignUserRoleDtoScopeType;
  branchId?: string;
}

export function toAssignUserRoleDto(values: AssignmentFormValues): AssignUserRoleDto {
  return {
    roleCode: values.roleCode as AssignUserRoleDtoRoleCode,
    scopeType: values.scopeType,
    ...(values.scopeType === AssignUserRoleDtoScopeType.BRANCH
      ? { branchId: values.branchId }
      : {}),
  };
}
