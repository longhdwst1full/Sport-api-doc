import type {
  CreateStaffUserDto,
  CreateStaffUserDtoRoleCode,
} from '@/generated/api/iam/models';

export interface StaffFormValues {
  displayName: string;
  email: string;
  roleCode: CreateStaffUserDtoRoleCode;
  branchId: string;
}

export function toCreateStaffUserDto(values: StaffFormValues): CreateStaffUserDto {
  return {
    displayName: values.displayName.trim(),
    email: values.email.trim().toLowerCase(),
    roleCode: values.roleCode,
    branchId: values.branchId,
  };
}
