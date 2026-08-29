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
  PermissionListDto,
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
  listUsers(@Req() request: AuthenticatedRequest): Promise<UserListDto> {
    return this.iam.listUsers(getAuthPrincipal(request));
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
