import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

import {
  REPORT_EXPORT_FORMATS,
  type ReportExportFormat,
} from './export/tabular-report';

/**
 * Mức gom nhóm của biểu đồ doanh thu. Khoá gom tính theo giờ Việt Nam, vì gom theo UTC đẩy đơn
 * đặt lúc 0h–7h sáng sang kỳ trước — đầu tháng, đầu quý và đầu năm đều lệch theo.
 */
export const REPORT_GRANULARITIES = ['DAY', 'MONTH', 'QUARTER', 'YEAR'] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

export class ReportRangeQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Mốc đầu khoảng thống kê. Bỏ trống thì lấy 30 ngày gần nhất.',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Mốc cuối; bỏ trống là hiện tại.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class RevenueReportQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({
    enum: REPORT_GRANULARITIES, enumName: 'ReportGranularity',
    default: 'DAY',
    description: 'Gom biểu đồ theo ngày, tháng, quý hoặc năm.',
  })
  @IsOptional()
  @IsIn(REPORT_GRANULARITIES)
  granularity: ReportGranularity = 'DAY';
}

export class TopProductQueryDto extends ReportRangeQueryDto {
  @ApiPropertyOptional({ type: Number, default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit = 10;
}

export class OrderStatusCountDto {
  @ApiProperty({ example: 'PENDING_CONFIRMATION' }) status: string;
  @ApiProperty({ example: 12 }) count: number;
}

export class OverviewReportDto {
  @ApiProperty({ description: 'Đơn đặt trong ngày hôm nay' }) ordersToday: number;
  @ApiProperty({ description: 'Đơn đặt trong 30 ngày gần nhất' }) ordersLast30Days: number;
  @ApiProperty({ description: 'Đơn chưa giao xong' }) ordersAwaitingFulfillment: number;
  @ApiProperty({ description: 'Đơn đã huỷ trong 30 ngày' }) ordersCancelledLast30Days: number;
  @ApiProperty({ description: 'Sản phẩm đang bán' }) publishedProducts: number;
  @ApiProperty({ description: 'Khách hàng đã có tài khoản hoặc từng đặt hàng' }) customers: number;
  @ApiProperty({ type: [OrderStatusCountDto] }) ordersByStatus: OrderStatusCountDto[];
}

export class RevenuePointDto {
  @ApiProperty({
    example: '2026-09-15',
    description: 'Khoá kỳ theo mức gom: YYYY-MM-DD, YYYY-MM, YYYY-Qn hoặc YYYY.',
  })
  date: string;
  @ApiProperty({ type: String, example: '15400000.00' }) amount: string;
  @ApiProperty({ example: 3 }) orderCount: number;
}

export class BranchRevenueDto {
  @ApiProperty() branchName: string;
  @ApiProperty({ type: String }) completedRevenue: string;
  @ApiProperty() completedOrderCount: number;
  @ApiProperty({ type: String }) expectedRevenue: string;
}

export class RevenueReportDto {
  @ApiProperty({ format: 'date-time' }) from: string;
  @ApiProperty({ format: 'date-time' }) to: string;

  @ApiProperty({
    type: String,
    description: 'Doanh thu thực nhận: đơn đã COMPLETED, tính theo mốc hoàn tất',
  })
  completedRevenue: string;

  @ApiProperty({ description: 'Số đơn đã hoàn tất' }) completedOrderCount: number;

  @ApiProperty({
    type: String,
    description: 'Dự thu: đơn đã DELIVERED, đang chờ tự chuyển hoàn tất',
  })
  expectedRevenue: string;

  @ApiProperty({ description: 'Số đơn đã giao, chờ hoàn tất' }) expectedOrderCount: number;

  @ApiProperty({
    type: String,
    description: 'Đơn đang xử lý (đã xác nhận tới đang giao); chưa tính vào hai nhóm trên',
  })
  inProgressRevenue: string;

  @ApiProperty({ type: String, description: 'Giá trị trung bình mỗi đơn đã hoàn tất' })
  averageOrderValue: string;

  @ApiProperty({
    enum: REPORT_GRANULARITIES, enumName: 'ReportGranularity',
    description: 'Mức gom đã áp dụng cho `series`',
  })
  granularity: ReportGranularity;

  @ApiProperty({ type: [RevenuePointDto], description: 'Doanh thu thực nhận theo kỳ hoàn tất' })
  series: RevenuePointDto[];

  @ApiProperty({ type: [BranchRevenueDto], description: 'Bóc tách theo chi nhánh' })
  byBranch: BranchRevenueDto[];
}

export class LowStockItemDto {
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty() warehouseName: string;
  @ApiProperty({ description: 'Tồn thực tế' }) onHand: number;
  @ApiProperty({ description: 'Đang giữ cho đơn chưa xuất' }) reserved: number;
  @ApiProperty({ description: 'Còn bán được = onHand - reserved' }) available: number;
  @ApiProperty({ description: 'Ngưỡng đặt lại hàng' }) reorderPoint: number;
}

export class InventoryReportDto {
  @ApiProperty({ description: 'Số dòng tồn đang theo dõi' }) trackedBalances: number;
  @ApiProperty({ description: 'Số dòng hết hàng bán (available <= 0)' }) outOfStock: number;
  @ApiProperty({ description: 'Số dòng chạm hoặc dưới ngưỡng đặt lại' }) lowStock: number;
  @ApiProperty({ type: [LowStockItemDto], description: 'Danh sách cần nhập thêm, ưu tiên thiếu nhất' })
  items: LowStockItemDto[];
}

export class TopProductDto {
  @ApiProperty() sku: string;
  @ApiProperty() productName: string;
  @ApiProperty({ description: 'Số lượng đã bán trong khoảng' }) quantitySold: number;
  @ApiProperty({ type: String, description: 'Doanh thu đã thực nhận từ SKU này' }) revenue: string;
}

export class TopProductListDto {
  @ApiProperty({ type: [TopProductDto] }) items: TopProductDto[];
}

export class TopCustomerDto {
  @ApiProperty({ example: 'KH-000128' }) customerNo: string;
  @ApiProperty({ example: 'Nguyễn Minh Anh' }) name: string;
  @ApiProperty({ description: 'Số đơn đã hoàn tất trong khoảng' }) orderCount: number;
  @ApiProperty({ type: String, description: 'Tổng tiền đã thực trả trong khoảng' }) revenue: string;
}

export class TopCustomerListDto {
  @ApiProperty({ type: [TopCustomerDto] }) items: TopCustomerDto[];
}

/**
 * Định dạng file khi xuất báo cáo.
 *
 * CSV cho việc nạp lại vào công cụ khác; XLSX cho người đọc trực tiếp (có định dạng số, tiêu đề
 * đậm, độ rộng cột).
 */
export class ReportExportQueryDto extends RevenueReportQueryDto {
  @ApiPropertyOptional({
    enum: REPORT_EXPORT_FORMATS, enumName: 'ReportExportFormat',
    default: 'XLSX',
    description: 'Định dạng file tải về.',
  })
  @IsOptional()
  @IsIn(REPORT_EXPORT_FORMATS)
  format: ReportExportFormat = 'XLSX';
}

export class TopReportExportQueryDto extends TopProductQueryDto {
  @ApiPropertyOptional({ enum: REPORT_EXPORT_FORMATS, enumName: 'ReportExportFormat', default: 'XLSX' })
  @IsOptional()
  @IsIn(REPORT_EXPORT_FORMATS)
  format: ReportExportFormat = 'XLSX';
}

export class InventoryExportQueryDto {
  @ApiPropertyOptional({ enum: REPORT_EXPORT_FORMATS, enumName: 'ReportExportFormat', default: 'XLSX' })
  @IsOptional()
  @IsIn(REPORT_EXPORT_FORMATS)
  format: ReportExportFormat = 'XLSX';
}
