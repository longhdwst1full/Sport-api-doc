import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import {
  InventoryReportDto,
  OverviewReportDto,
  ReportRangeQueryDto,
  RevenueReportDto,
  TopProductListDto,
  TopProductQueryDto,
} from './reporting.dto';
import { ReportingService } from './reporting.service';

@ApiTags('Admin Reporting')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('overview')
  @RequirePermissions('report.operation.view')
  @ApiOperation({
    operationId: 'getAdminReportOverview',
    summary: 'Số liệu vận hành: đơn theo trạng thái, đơn chờ giao, sản phẩm, khách hàng',
  })
  @ApiOkResponse({ type: OverviewReportDto })
  overview(@Req() request: AuthenticatedRequest): Promise<OverviewReportDto> {
    return this.reporting.overview(getAuthPrincipal(request));
  }

  @Get('revenue')
  @RequirePermissions('report.revenue.view')
  @ApiOperation({
    operationId: 'getAdminReportRevenue',
    summary: 'Doanh thu đã thực nhận theo khoảng thời gian, kèm chuỗi theo ngày',
  })
  @ApiOkResponse({ type: RevenueReportDto })
  revenue(
    @Query() query: ReportRangeQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RevenueReportDto> {
    return this.reporting.revenue(query, getAuthPrincipal(request));
  }

  @Get('inventory')
  @RequirePermissions('report.inventory.view')
  @ApiOperation({
    operationId: 'getAdminReportInventory',
    summary: 'Tồn kho chạm ngưỡng đặt lại và hết hàng bán',
  })
  @ApiOkResponse({ type: InventoryReportDto })
  inventory(@Req() request: AuthenticatedRequest): Promise<InventoryReportDto> {
    return this.reporting.inventory(getAuthPrincipal(request));
  }

  @Get('top-products')
  @RequirePermissions('report.revenue.view')
  @ApiOperation({
    operationId: 'getAdminReportTopProducts',
    summary: 'Sản phẩm bán chạy tính trên đơn đã thu được tiền',
  })
  @ApiOkResponse({ type: TopProductListDto })
  topProducts(
    @Query() query: TopProductQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TopProductListDto> {
    return this.reporting.topProducts(query, getAuthPrincipal(request));
  }
}
