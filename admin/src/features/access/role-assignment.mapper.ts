import {
  AssignUserRoleDtoScopeType,
  type AssignUserRoleDto,
} from '@/generated/api/iam/models';

export interface AssignmentFormValues {
  roleCode: string;
  scopeType: AssignUserRoleDtoScopeType;
  branchId?: string;
  warehouseId?: string;
}

export function toAssignUserRoleDto(values: AssignmentFormValues): AssignUserRoleDto {
  return {
    roleCode: values.roleCode,
    scopeType: values.scopeType,
    ...(values.scopeType === AssignUserRoleDtoScopeType.BRANCH
      ? { branchId: values.branchId }
      : {}),
    ...(values.scopeType === AssignUserRoleDtoScopeType.WAREHOUSE
      ? { warehouseId: values.warehouseId }
      : {}),
  };
}
