import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import {
  AuthenticatedRequest,
  getAuthPrincipal,
  getMutationContext,
} from '../../common/request/request-context';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
} from '../../common/pagination/active-search.dto';
import {
  AssignUserRoleDto,
  CreateStaffUserDto,
  LockStaffUserDto,
  PermissionListDto,
  RoleListDto,
  UserDto,
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
  listUsers(@Req() request: AuthenticatedRequest): Promise<UserListDto> {
    return this.iam.listUsers(getAuthPrincipal(request));
  }

  @Post('users')
  @RequirePermissions('iam.user.manage')
  @ApiOperation({
    operationId: 'createAdminStaffUser',
    summary: 'Create an active staff user with the approved default password and branch role',
  })
  @ApiCreatedResponse({ type: UserDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Role or branch not found' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Email already exists' })
  createStaffUser(
    @Body() input: CreateStaffUserDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserDto> {
    return this.iam.createStaffUser(
      input,
      getMutationContext(request),
      getAuthPrincipal(request),
    );
  }

  @Post('users/:userId/lock')
  @RequirePermissions('iam.user.manage')
  @ApiOperation({
    operationId: 'lockAdminStaffUser',
    summary: 'Lock a staff user and revoke every active session',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'User is no longer ACTIVE' })
  lockStaffUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() input: LockStaffUserDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserDto> {
    return this.iam.lockStaffUser(
      userId,
      input,
      getMutationContext(request),
      getAuthPrincipal(request),
    );
  }

  @Post('users/:userId/unlock')
  @RequirePermissions('iam.user.manage')
  @ApiOperation({
    operationId: 'unlockAdminStaffUser',
    summary: 'Unlock a staff user and reset the password to the approved default',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'User is no longer LOCKED' })
  unlockStaffUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserDto> {
    return this.iam.unlockStaffUser(
      userId,
      getMutationContext(request),
      getAuthPrincipal(request),
    );
  }

  @Get('roles')
  @RequirePermissions('iam.role.view')
  @ApiOperation({ operationId: 'listAdminRoles', summary: 'List IAM roles' })
  @ApiOkResponse({ type: RoleListDto })
  listRoles(): Promise<RoleListDto> {
    return this.iam.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('iam.role.view')
  @ApiOperation({ operationId: 'listAdminPermissions', summary: 'List stable permission codes' })
  @ApiOkResponse({ type: PermissionListDto })
  listPermissions(): PermissionListDto {
    return this.iam.listPermissions();
  }

  @Get('roles/active')
  @RequirePermissions('iam.role.view')
  @ApiOperation({
    operationId: 'searchActiveAdminRoles',
    summary: 'Search active roles for admin assignment lookups',
  })
  @ApiOkResponse({ type: ActiveLookupResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  searchActiveRoles(
    @Query() query: ActiveSearchQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ActiveLookupResponseDto> {
    return this.iam.searchActiveRoles(query, getAuthPrincipal(request));
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
    @Req() request: AuthenticatedRequest,
  ): Promise<UserRoleAssignmentDto> {
    return this.iam.assignRole(
      userId,
      input,
      getMutationContext(request),
      getAuthPrincipal(request),
    );
  }
}
