import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { ParseEntityIdPipe } from '../../common/identifiers/entity-id';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { CreateCustomerAddressDto, CustomerAddressDto, UpdateCustomerAddressDto } from './customer-address.dto';
import { CustomerAddressService } from './customer-address.service';

class AddressVersionQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

@ApiTags('Storefront Customer')
@ApiBearerAuth()
@RequireAuthentication()
@Controller('account/addresses')
export class CustomerAddressController {
  constructor(private readonly addresses: CustomerAddressService) {}

  @Get()
  @ApiOperation({ operationId: 'listCustomerAddresses', summary: 'List active delivery addresses' })
  @ApiOkResponse({ type: [CustomerAddressDto] })
  list(@Req() request: AuthenticatedRequest): Promise<CustomerAddressDto[]> {
    return this.addresses.list(getAuthPrincipal(request).userId);
  }

  @Post()
  @ApiOperation({ operationId: 'createCustomerAddress', summary: 'Create a delivery address' })
  @ApiCreatedResponse({ type: CustomerAddressDto })
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateCustomerAddressDto): Promise<CustomerAddressDto> {
    return this.addresses.create(getAuthPrincipal(request).userId, input);
  }

  @Patch(':addressId')
  @ApiOperation({ operationId: 'updateCustomerAddress', summary: 'Update an owned delivery address' })
  @ApiOkResponse({ type: CustomerAddressDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  update(@Req() request: AuthenticatedRequest, @Param('addressId', ParseEntityIdPipe) addressId: string, @Body() input: UpdateCustomerAddressDto): Promise<CustomerAddressDto> {
    return this.addresses.update(getAuthPrincipal(request).userId, addressId, input);
  }

  @Delete(':addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'removeCustomerAddress', summary: 'Deactivate an owned delivery address' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  remove(@Req() request: AuthenticatedRequest, @Param('addressId', ParseEntityIdPipe) addressId: string, @Query() query: AddressVersionQueryDto): Promise<void> {
    return this.addresses.remove(getAuthPrincipal(request).userId, addressId, query.expectedVersion);
  }
}
