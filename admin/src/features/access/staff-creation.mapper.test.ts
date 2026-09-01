import { describe, expect, it } from 'vitest';
import { CreateStaffUserDtoRoleCode } from '@/generated/api/iam/models';
import { toCreateStaffUserDto } from './staff-creation.mapper';

describe('toCreateStaffUserDto', () => {
  it('normalizes staff identity fields without changing the selected scope', () => {
    expect(
      toCreateStaffUserDto({
        displayName: '  Trần Minh An  ',
        email: '  AN.TRAN@EXAMPLE.COM  ',
        roleCode: CreateStaffUserDtoRoleCode.STAFF,
        branchId: '00000000-0000-7000-8000-000000000001',
      }),
    ).toEqual({
      displayName: 'Trần Minh An',
      email: 'an.tran@example.com',
      roleCode: 'STAFF',
      branchId: '00000000-0000-7000-8000-000000000001',
    });
  });
});
