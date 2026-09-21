import { Controller, Get, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiProduces,
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
  InventoryExportQueryDto,
  InventoryReportDto,
  OverviewReportDto,
  ReportExportQueryDto,
  RevenueReportQueryDto,
  TopCustomerListDto,
  RevenueReportDto,
  TopProductListDto,
  TopProductQueryDto,
  TopReportExportQueryDto,
} from './reporting.dto';
import { ReportExportService } from './report-export.service';
import {
  CSV_MEDIA_TYPE,
  XLSX_CONTENT_TYPE,
  type ReportFile,
} from './export/tabular-report';
import { ReportingService } from './reporting.service';

/** Swagger mô tả thân phản hồi của các endpoint xuất file: một file nhị phân, không phải JSON. */
const FILE_RESPONSE = {
  description: 'File báo cáo, tên file nằm trong header Content-Disposition.',
  schema: { type: 'string', format: 'binary' },
} as const;

@ApiTags('Admin Reporting')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Controller('admin/reports')
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly exporter: ReportExportService,
  ) {}

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
    summary: 'Doanh thu đã thực nhận theo khoảng thời gian, gom theo ngày/tháng/quý/năm',
  })
  @ApiOkResponse({ type: RevenueReportDto })
  revenue(
    @Query() query: RevenueReportQueryDto,
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

  @Get('top-customers')
  @RequirePermissions('report.revenue.view')
  @ApiOperation({
    operationId: 'getAdminReportTopCustomers',
    summary: 'Khách mua nhiều nhất tính trên đơn đã hoàn tất',
  })
  @ApiOkResponse({ type: TopCustomerListDto })
  topCustomers(
    @Query() query: TopProductQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TopCustomerListDto> {
    return this.reporting.topCustomers(query, getAuthPrincipal(request));
  }

  /**
   * Xuất chuỗi doanh thu theo kỳ.
   *
   * SECURITY: mỗi endpoint xuất file mang đúng quyền của báo cáo gốc. Gộp tất cả vào một endpoint
   * `?report=` sẽ buộc phải chọn một quyền chung, và người chỉ được xem tồn kho sẽ tải được doanh thu.
   */
  @Get('revenue/export')
  @RequirePermissions('report.revenue.view')
  @ApiOperation({
    operationId: 'exportAdminReportRevenue',
    summary: 'Tải doanh thu theo kỳ ra file CSV hoặc XLSX',
  })
  @ApiProduces(CSV_MEDIA_TYPE, XLSX_CONTENT_TYPE)
  @ApiOkResponse(FILE_RESPONSE)
  async exportRevenue(
    @Query() query: ReportExportQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return attach(response, await this.exporter.revenue(query, getAuthPrincipal(request)));
  }

  @Get('revenue/by-branch/export')
  @RequirePermissions('report.revenue.view')
  @ApiOperation({
    operationId: 'exportAdminReportRevenueByBranch',
    summary: 'Tải bóc tách doanh thu theo chi nhánh ra file CSV hoặc XLSX',
  })
  @ApiProduces(CSV_MEDIA_TYPE, XLSX_CONTENT_TYPE)
  @ApiOkResponse(FILE_RESPONSE)
  async exportRevenueByBranch(
    @Query() query: ReportExportQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return attach(response, await this.exporter.revenueByBranch(query, getAuthPrincipal(request)));
  }

  @Get('top-products/export')
  @RequirePermissions('report.revenue.view')
  @ApiOperation({
    operationId: 'exportAdminReportTopProducts',
    summary: 'Tải danh sách sản phẩm bán chạy ra file CSV hoặc XLSX',
  })
  @ApiProduces(CSV_MEDIA_TYPE, XLSX_CONTENT_TYPE)
  @ApiOkResponse(FILE_RESPONSE)
  async exportTopProducts(
    @Query() query: TopReportExportQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return attach(response, await this.exporter.topProducts(query, getAuthPrincipal(request)));
  }

  @Get('top-customers/export')
  @RequirePermissions('report.revenue.view')
  @ApiOperation({
    operationId: 'exportAdminReportTopCustomers',
    summary: 'Tải danh sách khách mua nhiều nhất ra file CSV hoặc XLSX',
  })
  @ApiProduces(CSV_MEDIA_TYPE, XLSX_CONTENT_TYPE)
  @ApiOkResponse(FILE_RESPONSE)
  async exportTopCustomers(
    @Query() query: TopReportExportQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return attach(response, await this.exporter.topCustomers(query, getAuthPrincipal(request)));
  }

  @Get('inventory/export')
  @RequirePermissions('report.inventory.view')
  @ApiOperation({
    operationId: 'exportAdminReportInventory',
    summary: 'Tải danh sách tồn kho cần nhập thêm ra file CSV hoặc XLSX',
  })
  @ApiProduces(CSV_MEDIA_TYPE, XLSX_CONTENT_TYPE)
  @ApiOkResponse(FILE_RESPONSE)
  async exportInventory(
    @Query() query: InventoryExportQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return attach(response, await this.exporter.inventory(query, getAuthPrincipal(request)));
  }
}

/**
 * Gắn header tải file rồi trả nội dung.
 *
 * `Content-Length` đặt tường minh để trình duyệt hiện được tiến độ tải; tên file chỉ dùng ký tự
 * ASCII nên không cần mã hoá RFC 5987.
 */
function attach(response: Response, file: ReportFile): StreamableFile {
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  response.setHeader('Content-Length', file.body.byteLength);
  return new StreamableFile(file.body);
}
