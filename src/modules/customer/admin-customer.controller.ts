import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AdminCustomerDetailDto,
  AdminCustomerListDto,
  AdminCustomerQueryDto,
} from './admin-customer.dto';
import { AdminCustomerService } from './admin-customer.service';

@ApiTags('Admin Customers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/customers')
export class AdminCustomerController {
  constructor(private readonly customers: AdminCustomerService) {}

  @Get()
  @RequirePermissions('customer.view')
  @ApiOperation({
    operationId: 'listAdminCustomers',
    summary: 'Danh sách khách hàng kèm số đơn, giá trị vòng đời và lần mua gần nhất',
  })
  @ApiOkResponse({ type: AdminCustomerListDto })
  list(@Query() query: AdminCustomerQueryDto): Promise<AdminCustomerListDto> {
    return this.customers.list(query);
  }

  @Get(':id')
  @RequirePermissions('customer.view')
  @ApiOperation({
    operationId: 'getAdminCustomer',
    summary: 'Chi tiết khách hàng kèm địa chỉ và đơn gần đây',
  })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('id') id: string): Promise<AdminCustomerDetailDto> {
    return this.customers.get(id);
  }
}
