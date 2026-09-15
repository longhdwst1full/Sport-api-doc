import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { CustomerProfileDto } from './customer-profile.dto';
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
}
