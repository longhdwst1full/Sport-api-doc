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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  AdminCustomerDetailDto,
  AdminCustomerListDto,
  AdminCustomerQueryDto,
  CreateAdminCustomerDto,
  CustomerStatusCommandDto,
  UpdateAdminCustomerDto,
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
  list(
    @Query() query: AdminCustomerQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCustomerListDto> {
    return this.customers.list(query, getAuthPrincipal(request));
  }

  @Get(':id')
  @RequirePermissions('customer.view')
  @ApiOperation({
    operationId: 'getAdminCustomer',
    summary: 'Chi tiết khách hàng kèm địa chỉ và đơn gần đây',
  })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCustomerDetailDto> {
    return this.customers.get(id, getAuthPrincipal(request));
  }

  @Post()
  @RequirePermissions('customer.manage')
  @ApiOperation({
    operationId: 'createAdminCustomer',
    summary: 'Nhân viên tạo hồ sơ khách mua tại quầy hoặc qua điện thoại',
  })
  @ApiCreatedResponse({ type: AdminCustomerDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Số điện thoại hoặc email đã có chủ' })
  create(@Body() input: CreateAdminCustomerDto): Promise<AdminCustomerDetailDto> {
    return this.customers.create(input);
  }

  @Patch(':id')
  @RequirePermissions('customer.manage')
  @ApiOperation({
    operationId: 'updateAdminCustomer',
    summary: 'Sửa thông tin liên hệ của khách theo expected version',
  })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(
    @Param('id') id: string,
    @Body() input: UpdateAdminCustomerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCustomerDetailDto> {
    return this.customers.update(id, input, getAuthPrincipal(request));
  }

  @Post(':id/deactivate')
  @RequirePermissions('customer.manage')
  @ApiOperation({
    operationId: 'deactivateAdminCustomer',
    summary: 'Ngừng hoạt động hồ sơ khách, giữ nguyên lịch sử mua hàng',
  })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deactivate(
    @Param('id') id: string,
    @Body() input: CustomerStatusCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCustomerDetailDto> {
    return this.customers.deactivate(id, input, getAuthPrincipal(request));
  }

  @Post(':id/activate')
  @RequirePermissions('customer.manage')
  @ApiOperation({ operationId: 'activateAdminCustomer', summary: 'Mở lại hồ sơ khách đã ngừng' })
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  activate(
    @Param('id') id: string,
    @Body() input: CustomerStatusCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCustomerDetailDto> {
    return this.customers.activate(id, input, getAuthPrincipal(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('customer.manage')
  @ApiOperation({
    operationId: 'deleteAdminCustomer',
    summary: 'Xoá hồ sơ khách chưa phát sinh đơn và chưa có tài khoản đăng nhập',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Khách đã có đơn hoặc có tài khoản đăng nhập',
  })
  remove(
    @Param('id') id: string,
    @Body() input: CustomerStatusCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.customers.remove(id, input, getAuthPrincipal(request));
  }
}
