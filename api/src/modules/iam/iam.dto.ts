import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RoleStatus, ScopeType, SystemRoleCode, UserStatus } from './iam.types';

export class PermissionDto {
  @ApiProperty({ example: 'org.branch.view' }) code: string;
  @ApiProperty({ example: 'Organization' }) module: string;
  @ApiProperty({ example: 'view' }) action: string;
  @ApiProperty({ example: false }) sensitive: boolean;
}

export class RoleDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'BRANCH_MANAGER' }) code: string;
  @ApiProperty({ example: 'Branch Manager' }) name: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE'] }) status: RoleStatus;
  @ApiProperty() system: boolean;
  @ApiProperty({ type: [String] }) permissionCodes: string[];
  @ApiProperty({ example: 0 }) version: number;
}

export class UserRoleAssignmentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ format: 'uuid' }) roleId: string;
  @ApiProperty() roleCode: string;
  @ApiProperty({ enum: ScopeType }) scopeType: ScopeType;
  @ApiPropertyOptional({ format: 'uuid' }) branchId?: string;
  @ApiProperty({ enum: ['ACTIVE'] }) status: 'ACTIVE';
  @ApiProperty({ format: 'date-time' }) validFrom: string;
}

export class UserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Long Hoàng' }) displayName: string;
  @ApiProperty({ example: 'lo***@dctd.vn' }) maskedEmail: string;
  @ApiProperty({ enum: ['STAFF', 'SYSTEM'] }) userType: 'STAFF' | 'SYSTEM';
  @ApiProperty({ enum: ['ACTIVE', 'INVITED', 'LOCKED'] }) status: UserStatus;
  @ApiProperty({ example: 1 }) permissionVersion: number;
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
  @ApiProperty({ enum: SystemRoleCode, example: SystemRoleCode.BRANCH_MANAGER })
  @IsEnum(SystemRoleCode)
  roleCode: SystemRoleCode;

  @ApiProperty({ enum: ScopeType })
  @IsEnum(ScopeType)
  scopeType: ScopeType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;
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
  roleCode: SystemRoleCode.BRANCH_MANAGER | SystemRoleCode.STAFF;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
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
