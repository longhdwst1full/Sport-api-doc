import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
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
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getMutationContext } from '../../../common/request/request-context';
import {
  AdminFlashSaleQueryDto,
  ChangeFlashSaleCampaignStatusDto,
  CreateFlashSaleCampaignDto,
  FlashSaleCampaignDetailDto,
  FlashSaleCampaignListDto,
  PublicFlashSaleListDto,
  RemoveFlashSaleItemDto,
  UpdateFlashSaleCampaignDto,
  UpsertFlashSaleItemDto,
} from '../dto/promotion.dto';
import { FlashSaleService } from '../services/flash-sale.service';

@ApiTags('Storefront Promotions')
@Controller('promotions/flash-sales')
export class PublicFlashSaleController {
  constructor(private readonly flashSales: FlashSaleService) {}

  @Get()
  @ApiOperation({
    operationId: 'listPublicFlashSales',
    summary: 'Danh sách chiến dịch flash sale đang chạy theo giờ server',
  })
  @ApiOkResponse({ type: PublicFlashSaleListDto })
  listPublicFlashSales(): Promise<PublicFlashSaleListDto> {
    return this.flashSales.listPublicFlashSales();
  }
}

@ApiTags('Admin Promotions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/promotions/flash-sales')
export class AdminFlashSaleController {
  constructor(private readonly flashSales: FlashSaleService) {}

  @Get()
  @RequirePermissions('catalog.flash_sale.view')
  @ApiOperation({ operationId: 'listAdminFlashSales', summary: 'Danh sách chiến dịch flash sale' })
  @ApiOkResponse({ type: FlashSaleCampaignListDto })
  listAdminFlashSales(@Query() query: AdminFlashSaleQueryDto): Promise<FlashSaleCampaignListDto> {
    return this.flashSales.listCampaigns(query);
  }

  @Get(':id')
  @RequirePermissions('catalog.flash_sale.view')
  @ApiOperation({ operationId: 'getAdminFlashSale', summary: 'Chi tiết chiến dịch và danh sách suất bán' })
  @ApiOkResponse({ type: FlashSaleCampaignDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getAdminFlashSale(@Param('id') id: string): Promise<FlashSaleCampaignDetailDto> {
    return this.flashSales.getCampaign(id);
  }

  @Post()
  @RequirePermissions('catalog.flash_sale.manage')
  @ApiOperation({ operationId: 'createAdminFlashSale', summary: 'Tạo chiến dịch flash sale ở trạng thái nháp' })
  @ApiCreatedResponse({ type: FlashSaleCampaignDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  createAdminFlashSale(
    @Body() body: CreateFlashSaleCampaignDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FlashSaleCampaignDetailDto> {
    return this.flashSales.createCampaign(body, getMutationContext(request));
  }

  @Patch(':id')
  @RequirePermissions('catalog.flash_sale.manage')
  @ApiOperation({ operationId: 'updateAdminFlashSale', summary: 'Cập nhật thông tin và cửa sổ chạy của chiến dịch' })
  @ApiOkResponse({ type: FlashSaleCampaignDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  updateAdminFlashSale(
    @Param('id') id: string,
    @Body() body: UpdateFlashSaleCampaignDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FlashSaleCampaignDetailDto> {
    return this.flashSales.updateCampaign(id, body, getMutationContext(request));
  }

  @Post(':id/status')
  @RequirePermissions('catalog.flash_sale.manage')
  @ApiOperation({
    operationId: 'changeAdminFlashSaleStatus',
    summary: 'Chuyển vòng đời chiến dịch theo state machine',
  })
  @ApiOkResponse({ type: FlashSaleCampaignDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  changeAdminFlashSaleStatus(
    @Param('id') id: string,
    @Body() body: ChangeFlashSaleCampaignStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FlashSaleCampaignDetailDto> {
    return this.flashSales.changeCampaignStatus(id, body, getMutationContext(request));
  }

  @Post(':id/items')
  @RequirePermissions('catalog.flash_sale.manage')
  @ApiOperation({
    operationId: 'upsertAdminFlashSaleItem',
    summary: 'Thêm hoặc cập nhật suất bán của một biến thể trong chiến dịch',
  })
  @ApiOkResponse({ type: FlashSaleCampaignDetailDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  upsertAdminFlashSaleItem(
    @Param('id') id: string,
    @Body() body: UpsertFlashSaleItemDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FlashSaleCampaignDetailDto> {
    return this.flashSales.upsertItem(id, body, getMutationContext(request));
  }

  @Delete(':id/items/:itemId')
  @RequirePermissions('catalog.flash_sale.manage')
  @ApiOperation({
    operationId: 'removeAdminFlashSaleItem',
    summary: 'Gỡ suất bán; đã phát sinh giao dịch thì chuyển INACTIVE thay vì xóa',
  })
  @ApiOkResponse({ type: FlashSaleCampaignDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  removeAdminFlashSaleItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: RemoveFlashSaleItemDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FlashSaleCampaignDetailDto> {
    return this.flashSales.removeItem(id, itemId, body, getMutationContext(request));
  }
}
