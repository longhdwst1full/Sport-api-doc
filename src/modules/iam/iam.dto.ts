import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ENTITY_ID_OPENAPI, IsEntityId } from '../../common/identifiers/entity-id';
import {
  ROLE_ASSIGNMENT_STATUS,
  ROLE_STATUS,
  USER_STATUS,
  USER_TYPE,
} from './iam.constants';
import {
  ASSIGNABLE_STAFF_ROLE_CODES,
  AssignableStaffRoleCode,
  RoleStatus,
  ScopeType,
  SystemRoleCode,
  UserStatus,
} from './iam.types';

export class PermissionDto {
  @ApiProperty({ example: 'org.branch.view' }) code: string;
  @ApiProperty({ example: 'Organization' }) module: string;
  @ApiProperty({ example: 'view' }) action: string;
  @ApiProperty({ example: false }) sensitive: boolean;
}

export class RoleDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: 'BRANCH_MANAGER' }) code: string;
  @ApiProperty({ example: 'Branch Manager' }) name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: Object.values(ROLE_STATUS) }) status: RoleStatus;
  @ApiProperty() system: boolean;
  @ApiProperty({ type: [String] }) permissionCodes: string[];
  @ApiProperty({ example: 0 }) version: number;
}

export class UserRoleAssignmentDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) userId: string;
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) roleId: string;
  @ApiProperty() roleCode: string;
  @ApiProperty({ enum: ScopeType }) scopeType: ScopeType;
  @ApiPropertyOptional({ ...ENTITY_ID_OPENAPI }) branchId?: string;
  @ApiProperty({ enum: [ROLE_ASSIGNMENT_STATUS.ACTIVE] })
  status: typeof ROLE_ASSIGNMENT_STATUS.ACTIVE;
  @ApiProperty({ format: 'date-time' }) validFrom: string;
}

export class UserDto {
  @ApiProperty({ ...ENTITY_ID_OPENAPI }) id: string;
  @ApiProperty({ example: 'Long Hoàng' }) displayName: string;
  @ApiProperty({ example: 'lo***@dctd.vn' }) maskedEmail: string;
  @ApiProperty({ enum: [USER_TYPE.STAFF, USER_TYPE.SYSTEM] })
  userType: typeof USER_TYPE.STAFF | typeof USER_TYPE.SYSTEM;
  @ApiProperty({ enum: [USER_STATUS.ACTIVE, USER_STATUS.LOCKED, USER_STATUS.INACTIVE] })
  status: UserStatus;
  @ApiProperty({ example: 1 }) permissionVersion: number;
  @ApiProperty({ example: 0, minimum: 0 }) failedLoginAttempts: number;
  @ApiProperty({ example: false }) mustChangePassword: boolean;
  @ApiPropertyOptional({ format: 'date-time' }) lockedAt?: string;
  @ApiPropertyOptional() lockReason?: string;
  @ApiProperty({ type: [UserRoleAssignmentDto] }) assignments: UserRoleAssignmentDto[];
}

export class UserListDto {
  @ApiProperty({ type: [UserDto] }) items: UserDto[];
  @ApiProperty() total: number;
}

export class RoleListDto {
  @ApiProperty({ type: [RoleDto] }) items: RoleDto[];
  @ApiProperty() total: number;
}

export class PermissionListDto {
  @ApiProperty({ type: [PermissionDto] }) items: PermissionDto[];
  @ApiProperty() total: number;
}

export class AssignUserRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_STAFF_ROLE_CODES, example: SystemRoleCode.BRANCH_MANAGER })
  @IsIn(ASSIGNABLE_STAFF_ROLE_CODES)
  roleCode: AssignableStaffRoleCode;

  @ApiProperty({ enum: [ScopeType.BRANCH] })
  @IsIn([ScopeType.BRANCH])
  scopeType: typeof ScopeType.BRANCH;

  @ApiProperty({ ...ENTITY_ID_OPENAPI })
  @IsEntityId()
  branchId: string;
}

export class CreateStaffUserDto {
  @ApiProperty({ example: 'Nguyễn Văn An', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiProperty({ example: 'an.nguyen@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ enum: [SystemRoleCode.BRANCH_MANAGER, SystemRoleCode.STAFF] })
  @IsIn([SystemRoleCode.BRANCH_MANAGER, SystemRoleCode.STAFF])
  roleCode:
    | typeof SystemRoleCode.BRANCH_MANAGER
    | typeof SystemRoleCode.STAFF;

  @ApiProperty({ ...ENTITY_ID_OPENAPI })
  @IsEntityId()
  branchId: string;
}

export class LockStaffUserDto {
  @ApiProperty({
    example: 'Nhân viên đã nghỉ việc',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}

export class RevokeRoleAssignmentDto {
  @ApiProperty({ example: 'Nhân viên chuyển sang vai trò khác', minLength: 3, maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}

const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,49}$/;

export class CreateRoleDto {
  @ApiProperty({
    example: 'WAREHOUSE_LEAD',
    description: 'Mã vai trò, chữ in hoa và gạch dưới, duy nhất toàn hệ thống',
  })
  @IsString()
  @Matches(ROLE_CODE_PATTERN, {
    message: 'code phải viết hoa, bắt đầu bằng chữ cái, dài 3-50 ký tự',
  })
  code: string;

  @ApiProperty({ example: 'Trưởng kho', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Phụ trách nhập xuất kho chi nhánh', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ type: [String], example: ['inventory.stock.view', 'inventory.stock.adjust'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  permissionCodes: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Trưởng kho', maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: Object.values(ROLE_STATUS) })
  @IsOptional()
  @IsIn(Object.values(ROLE_STATUS))
  status?: RoleStatus;

  @ApiPropertyOptional({
    type: [String],
    description: 'Danh sách quyền thay thế toàn bộ. Bỏ trống để giữ nguyên quyền hiện tại.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  permissionCodes?: string[];

  @ApiProperty({ example: 0, minimum: 0, description: 'Version đọc được lần gần nhất' })
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class DeleteRoleDto {
  @ApiProperty({ example: 0, minimum: 0, description: 'Version đọc được lần gần nhất' })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiProperty({ example: 'Vai trò không còn dùng', minLength: 3, maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}
