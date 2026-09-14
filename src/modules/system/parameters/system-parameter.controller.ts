import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getMutationContext } from '../../../common/request/request-context';
import {
  CreateSystemParameterDto,
  DeleteSystemParameterDto,
  SystemParameterDto,
  SystemParameterListDto,
  SystemParameterQueryDto,
  UpdateSystemParameterDto,
} from './system-parameter.dto';
import { SystemParameterService } from './system-parameter.service';

@ApiTags('Admin System')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/system/parameters')
export class SystemParameterController {
  constructor(private readonly parameters: SystemParameterService) {}

  @Get()
  @RequirePermissions('system.parameter.view')
  @ApiOperation({
    operationId: 'listAdminSystemParameters',
    summary: 'Danh sách tham số nghiệp vụ cấu hình được từ Admin',
  })
  @ApiOkResponse({ type: SystemParameterListDto })
  listAdminSystemParameters(@Query() query: SystemParameterQueryDto): Promise<SystemParameterListDto> {
    return this.parameters.list(query);
  }

  @Patch(':code')
  @RequirePermissions('system.parameter.manage')
  @ApiOperation({
    operationId: 'updateAdminSystemParameter',
    summary: 'Cập nhật giá trị tham số; có hiệu lực ngay, không cần deploy',
  })
  @ApiOkResponse({ type: SystemParameterDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  updateAdminSystemParameter(
    @Param('code') code: string,
    @Body() body: UpdateSystemParameterDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<SystemParameterDto> {
    return this.parameters.update(code, body, getMutationContext(request));
  }

  @Post()
  @RequirePermissions('system.parameter.manage')
  @ApiOperation({
    operationId: 'createAdminSystemParameter',
    summary: 'Tạo tham số tuỳ biến; code không tham chiếu nên chỉ dùng để lưu giá trị vận hành',
  })
  @ApiCreatedResponse({ type: SystemParameterDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  createAdminSystemParameter(
    @Body() body: CreateSystemParameterDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<SystemParameterDto> {
    return this.parameters.create(body, getMutationContext(request));
  }

  @Delete(':code')
  @HttpCode(204)
  @RequirePermissions('system.parameter.manage')
  @ApiOperation({
    operationId: 'deleteAdminSystemParameter',
    summary: 'Ngừng dùng tham số tuỳ biến (xoá mềm); tham số hệ thống không xoá được',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  deleteAdminSystemParameter(
    @Param('code') code: string,
    @Body() body: DeleteSystemParameterDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.parameters.remove(code, body, getMutationContext(request));
  }
}

@ApiTags('Storefront System')
@Controller('system/parameters')
export class PublicSystemParameterController {
  constructor(private readonly parameters: SystemParameterService) {}

  @Get('public')
  @ApiOperation({
    operationId: 'listPublicSystemParameters',
    summary: 'Tham số được phép công khai, ví dụ biểu phí giao hàng hiển thị ở trang chính sách',
  })
  @ApiOkResponse({ type: SystemParameterListDto })
  listPublicSystemParameters(): Promise<SystemParameterListDto> {
    return this.parameters.listPublic();
  }
}
