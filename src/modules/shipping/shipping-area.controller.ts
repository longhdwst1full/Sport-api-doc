import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import {
  DistrictQueryDto,
  ShippingAreaListDto,
  WardQueryDto,
} from './shipping-area.dto';
import { ShippingAreaService } from './shipping-area.service';

/**
 * Danh mục địa giới dùng chung cho Admin (địa chỉ chi nhánh) và Storefront (địa chỉ giao hàng).
 * Dữ liệu tham chiếu công khai nên không gắn permission, nhưng có throttle vì mỗi lượt gọi tiêu
 * quota token GHN của hệ thống.
 */
@ApiTags('Shipping Areas')
@Controller('shipping/areas')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShippingAreaController {
  constructor(private readonly areas: ShippingAreaService) {}

  @Get('provinces')
  @ApiOperation({
    operationId: 'listShippingProvinces',
    summary: 'Danh sách tỉnh/thành theo mã của hãng vận chuyển',
  })
  @ApiOkResponse({ type: ShippingAreaListDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async provinces(): Promise<ShippingAreaListDto> {
    return { items: await this.areas.listProvinces() };
  }

  @Get('districts')
  @ApiOperation({
    operationId: 'listShippingDistricts',
    summary: 'Danh sách quận/huyện của một tỉnh/thành',
  })
  @ApiOkResponse({ type: ShippingAreaListDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async districts(@Query() query: DistrictQueryDto): Promise<ShippingAreaListDto> {
    return { items: await this.areas.listDistricts(query.provinceCode) };
  }

  @Get('wards')
  @ApiOperation({
    operationId: 'listShippingWards',
    summary: 'Danh sách phường/xã của một quận/huyện',
  })
  @ApiOkResponse({ type: ShippingAreaListDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  async wards(@Query() query: WardQueryDto): Promise<ShippingAreaListDto> {
    return { items: await this.areas.listWards(query.districtCode) };
  }
}
