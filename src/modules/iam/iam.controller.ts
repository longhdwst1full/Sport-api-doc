import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import {
  AssignUserRoleDto,
  CreateRoleDto,
  PermissionListDto,
  RoleDto,
  RoleListDto,
  UserListDto,
  UserRoleAssignmentDto,
} from './iam.dto';
import { IamService } from './iam.service';

@ApiTags('Admin IAM')
@ApiBearerAuth()
@Controller('admin/iam')
export class IamController {
  constructor(private readonly iam: IamService) {}

  @Get('users')
  @RequirePermissions('iam.user.view')
  @ApiOperation({ operationId: 'listAdminUsers', summary: 'List staff users with role scopes' })
  @ApiOkResponse({ type: UserListDto })
  listUsers(): UserListDto {
    return this.iam.listUsers();
  }

  @Get('roles')
  @RequirePermissions('iam.role.view')
  @ApiOperation({ operationId: 'listAdminRoles', summary: 'List IAM roles' })
  @ApiOkResponse({ type: RoleListDto })
  listRoles(): RoleListDto {
    return this.iam.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('iam.role.view')
  @ApiOperation({ operationId: 'listAdminPermissions', summary: 'List stable permission codes' })
  @ApiOkResponse({ type: PermissionListDto })
  listPermissions(): PermissionListDto {
    return this.iam.listPermissions();
  }

  @Post('roles')
  @RequirePermissions('iam.role.manage')
  @ApiOperation({ operationId: 'createAdminRole', summary: 'Create a role from known permissions' })
  @ApiCreatedResponse({ type: RoleDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'One or more permission codes are unknown',
  })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Role code already exists' })
  createRole(@Body() input: CreateRoleDto): RoleDto {
    return this.iam.createRole(input);
  }

  @Post('users/:userId/role-assignments')
  @RequirePermissions('iam.assignment.manage')
  @ApiOperation({
    operationId: 'assignAdminUserRole',
    summary: 'Assign a role with a validated data scope',
  })
  @ApiCreatedResponse({ type: UserRoleAssignmentDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Scope identifiers do not match the scope type',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'User or role not found' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The same assignment already exists',
  })
  assignRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: AssignUserRoleDto,
  ): UserRoleAssignmentDto {
    return this.iam.assignRole(userId, input);
  }
}
