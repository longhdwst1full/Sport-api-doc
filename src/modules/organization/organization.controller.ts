import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import {
  BranchListDto,
  BranchWithWarehouseDto,
  CreateBranchDto,
  WarehouseListDto,
} from './organization.dto';
import { OrganizationService } from './organization.service';

@ApiTags('Admin Organization')
@ApiBearerAuth()
@Controller('admin/organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get('branches')
  @RequirePermissions('org.branch.view')
  @ApiOperation({ operationId: 'listAdminBranches', summary: 'List sales branches' })
  @ApiOkResponse({ type: BranchListDto })
  listBranches(): BranchListDto {
    return this.organization.listBranches();
  }

  @Get('warehouses')
  @RequirePermissions('org.warehouse.view')
  @ApiOperation({ operationId: 'listAdminWarehouses', summary: 'List branch warehouses' })
  @ApiOkResponse({ type: WarehouseListDto })
  listWarehouses(): WarehouseListDto {
    return this.organization.listWarehouses();
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
  createBranch(@Body() input: CreateBranchDto): BranchWithWarehouseDto {
    return this.organization.createBranch(input);
  }
}
