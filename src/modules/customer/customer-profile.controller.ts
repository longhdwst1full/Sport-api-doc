import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { CustomerProfileDto, UpdateCustomerProfileDto } from './customer-profile.dto';
import { CustomerProfileService } from './customer-profile.service';

@ApiTags('Storefront Customer')
@ApiBearerAuth()
@RequireAuthentication()
@Controller('account/profile')
export class CustomerProfileController {
  constructor(private readonly profile: CustomerProfileService) {}

  @Get()
  @ApiOperation({
    operationId: 'getCustomerProfile',
    summary: 'Hồ sơ của khách đang đăng nhập: tên, email, số điện thoại',
  })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Req() request: AuthenticatedRequest): Promise<CustomerProfileDto> {
    return this.profile.get(getAuthPrincipal(request).userId);
  }

  @Patch()
  @ApiOperation({
    operationId: 'updateCustomerProfile',
    summary: 'Khách tự cập nhật tên, email, số điện thoại và tuỳ chọn nhận tin',
  })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Version không khớp, hoặc email/SĐT đã thuộc về tài khoản khác',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(
    @Body() input: UpdateCustomerProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CustomerProfileDto> {
    // SECURITY: chỉ sửa được hồ sơ của chính token đang gọi; không nhận customerId từ client.
    return this.profile.update(getAuthPrincipal(request).userId, input);
  }
}
