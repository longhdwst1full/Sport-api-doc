import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AuthenticatedRequest, getMutationContext } from '../../common/request/request-context';
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
import { ParseEntityIdPipe } from '../../common/identifiers/entity-id';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
  ActiveWarehouseSearchQueryDto,
} from '../../common/pagination/active-search.dto';
import {
  BranchListDto,
  BranchWithWarehouseDto,
  ChangeBranchStatusDto,
  CreateBranchDto,
  UpdateBranchWithWarehouseDto,
  WarehouseListDto,
} from './organization.dto';
import { OrganizationService } from './organization.service';

@ApiTags('Admin Organization')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get('branches')
  @RequirePermissions('org.branch.view')
  @ApiOperation({ operationId: 'listAdminBranches', summary: 'List sales branches' })
  @ApiOkResponse({ type: BranchListDto })
  listBranches(): Promise<BranchListDto> {
    return this.organization.listBranches();
  }

  @Get('warehouses')
  @RequirePermissions('org.warehouse.view')
  @ApiOperation({ operationId: 'listAdminWarehouses', summary: 'List branch warehouses' })
  @ApiOkResponse({ type: WarehouseListDto })
  listWarehouses(): Promise<WarehouseListDto> {
    return this.organization.listWarehouses();
  }

  @Get('branches/active')
  @RequirePermissions('org.branch.view')
  @ApiOperation({
    operationId: 'searchActiveAdminBranches',
    summary: 'Search active branches for admin lookups',
  })
  @ApiOkResponse({ type: ActiveLookupResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  searchActiveBranches(@Query() query: ActiveSearchQueryDto): Promise<ActiveLookupResponseDto> {
    return this.organization.searchActiveBranches(query);
  }

  @Get('warehouses/active')
  @RequirePermissions('org.warehouse.view')
  @ApiOperation({
    operationId: 'searchActiveAdminWarehouses',
    summary: 'Search active warehouses for admin lookups',
  })
  @ApiOkResponse({ type: ActiveLookupResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  searchActiveWarehouses(
    @Query() query: ActiveWarehouseSearchQueryDto,
  ): Promise<ActiveLookupResponseDto> {
    return this.organization.searchActiveWarehouses(query);
  }

  @Post('branches')
  @RequirePermissions('org.branch.manage', 'org.warehouse.manage')
  @ApiOperation({
    operationId: 'createAdminBranchWithWarehouse',
    summary: 'Create a branch with its single V1 warehouse',
  })
  @ApiCreatedResponse({ type: BranchWithWarehouseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Branch or warehouse code already exists',
  })
  createBranch(
    @Body() input: CreateBranchDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BranchWithWarehouseDto> {
    return this.organization.createBranch(input, getMutationContext(request));
  }

  @Patch('branches/:id')
  @RequirePermissions('org.branch.manage', 'org.warehouse.manage')
  @ApiOperation({
    operationId: 'updateAdminBranchWithWarehouse',
    summary: 'Update a branch and its single V1 warehouse',
  })
  @ApiOkResponse({ type: BranchWithWarehouseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  updateBranch(
    @Param('id') id: string,
    @Body() input: UpdateBranchWithWarehouseDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BranchWithWarehouseDto> {
    return this.organization.updateBranch(id, input, getMutationContext(request));
  }

  @Post('branches/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('org.branch.manage', 'org.warehouse.manage')
  @ApiOperation({
    operationId: 'deactivateAdminBranchWithWarehouse',
    summary: 'Deactivate a branch and its V1 warehouse atomically',
  })
  @ApiOkResponse({ type: BranchWithWarehouseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deactivateBranch(
    @Param('id') id: string,
    @Body() input: ChangeBranchStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BranchWithWarehouseDto> {
    return this.organization.changeBranchStatus(
      id,
      'INACTIVE',
      input,
      getMutationContext(request),
    );
  }

  @Delete('branches/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('org.branch.manage', 'org.warehouse.manage')
  @ApiOperation({
    operationId: 'deleteAdminBranchWithWarehouse',
    summary: 'Logically delete a branch and its V1 warehouse atomically',
  })
  @ApiOkResponse({ type: BranchWithWarehouseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deleteBranch(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Body() input: ChangeBranchStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BranchWithWarehouseDto> {
    return this.organization.changeBranchStatus(
      id,
      'INACTIVE',
      input,
      getMutationContext(request),
    );
  }

  @Post('branches/:id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('org.branch.manage', 'org.warehouse.manage')
  @ApiOperation({
    operationId: 'activateAdminBranchWithWarehouse',
    summary: 'Reactivate a branch and its V1 warehouse atomically',
  })
  @ApiOkResponse({ type: BranchWithWarehouseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  activateBranch(
    @Param('id') id: string,
    @Body() input: ChangeBranchStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BranchWithWarehouseDto> {
    return this.organization.changeBranchStatus(
      id,
      'ACTIVE',
      input,
      getMutationContext(request),
    );
  }
}
