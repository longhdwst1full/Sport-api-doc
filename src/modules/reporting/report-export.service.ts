import { Injectable } from '@nestjs/common';

import { vietnamDateKey } from '../../common/time/vietnam-time';
import type { AuthPrincipal } from '../auth/auth.types';
import {
  ReportExportQueryDto,
  TopReportExportQueryDto,
  type ReportRangeQueryDto,
} from './reporting.dto';
import { ReportingService } from './reporting.service';
import {
  renderReportFile,
  type ReportFile,
  type TabularReport,
} from './export/tabular-report';

/**
 * Xuất báo cáo ra file tải về.
 *
 * Dịch vụ này KHÔNG truy vấn lại database: nó gọi đúng các hàm đang phục vụ màn hình báo cáo rồi
 * trải kết quả ra bảng. Nhờ vậy số trên file luôn khớp số trên màn hình — hai đường truy vấn song
 * song là cách chắc chắn nhất để hai con số lệch nhau mà không ai phát hiện.
 */
@Injectable()
export class ReportExportService {
  constructor(private readonly reporting: ReportingService) {}

  async revenue(query: ReportExportQueryDto, actor: AuthPrincipal): Promise<ReportFile> {
    const report = await this.reporting.revenue(query, actor);

    const table: TabularReport = {
      title: 'Doanh thu',
      columns: [
        { key: 'date', header: 'Kỳ', kind: 'TEXT', width: 14 },
        { key: 'amount', header: 'Doanh thu thực nhận', kind: 'MONEY', width: 22 },
        { key: 'orderCount', header: 'Số đơn hoàn tất', kind: 'NUMBER', width: 18 },
        { key: 'refundAmount', header: 'Đã hoàn tiền', kind: 'MONEY', width: 20 },
        { key: 'netAmount', header: 'Doanh thu thuần', kind: 'MONEY', width: 22 },
      ],
      rows: report.series.map((point) => ({ ...point })),
    };

    return this.render(table, query, 'bao-cao-doanh-thu');
  }

  async revenueByBranch(query: ReportExportQueryDto, actor: AuthPrincipal): Promise<ReportFile> {
    const report = await this.reporting.revenue(query, actor);

    const table: TabularReport = {
      title: 'Doanh thu theo chi nhánh',
      columns: [
        { key: 'branchName', header: 'Chi nhánh', kind: 'TEXT', width: 28 },
        { key: 'completedRevenue', header: 'Doanh thu thực nhận', kind: 'MONEY', width: 22 },
        { key: 'completedOrderCount', header: 'Số đơn hoàn tất', kind: 'NUMBER', width: 18 },
        { key: 'expectedRevenue', header: 'Dự thu', kind: 'MONEY', width: 20 },
        { key: 'refundedAmount', header: 'Đã hoàn tiền', kind: 'MONEY', width: 20 },
        { key: 'netRevenue', header: 'Doanh thu thuần', kind: 'MONEY', width: 22 },
      ],
      rows: report.byBranch.map((row) => ({ ...row })),
    };

    return this.render(table, query, 'bao-cao-doanh-thu-chi-nhanh');
  }

  async topProducts(query: TopReportExportQueryDto, actor: AuthPrincipal): Promise<ReportFile> {
    const report = await this.reporting.topProducts(query, actor);

    const table: TabularReport = {
      title: 'San pham ban chay',
      columns: [
        { key: 'sku', header: 'SKU', kind: 'TEXT', width: 20 },
        { key: 'productName', header: 'Tên sản phẩm', kind: 'TEXT', width: 40 },
        { key: 'quantitySold', header: 'Số lượng đã bán', kind: 'NUMBER', width: 18 },
        { key: 'revenue', header: 'Doanh thu', kind: 'MONEY', width: 20 },
      ],
      rows: report.items.map((row) => ({ ...row })),
    };

    return this.render(table, query, 'bao-cao-san-pham-ban-chay');
  }

  async topCustomers(query: TopReportExportQueryDto, actor: AuthPrincipal): Promise<ReportFile> {
    const report = await this.reporting.topCustomers(query, actor);

    const table: TabularReport = {
      title: 'Khach mua nhieu nhat',
      columns: [
        { key: 'customerNo', header: 'Mã khách hàng', kind: 'TEXT', width: 18 },
        { key: 'name', header: 'Tên khách hàng', kind: 'TEXT', width: 32 },
        { key: 'orderCount', header: 'Số đơn hoàn tất', kind: 'NUMBER', width: 18 },
        { key: 'revenue', header: 'Tổng tiền đã trả', kind: 'MONEY', width: 20 },
      ],
      rows: report.items.map((row) => ({ ...row })),
    };

    return this.render(table, query, 'bao-cao-khach-mua-nhieu');
  }

  /**
   * Tồn kho là ảnh chụp tại thời điểm xuất, không có khoảng thời gian, nên tên file gắn ngày hôm
   * nay thay vì khoảng from–to.
   */
  async inventory(
    query: Pick<ReportExportQueryDto, 'format'>,
    actor: AuthPrincipal,
  ): Promise<ReportFile> {
    const report = await this.reporting.inventory(actor);

    const table: TabularReport = {
      title: 'Ton kho can nhap',
      columns: [
        { key: 'sku', header: 'SKU', kind: 'TEXT', width: 20 },
        { key: 'productName', header: 'Tên sản phẩm', kind: 'TEXT', width: 40 },
        { key: 'warehouseName', header: 'Kho', kind: 'TEXT', width: 24 },
        { key: 'onHand', header: 'Tồn thực tế', kind: 'NUMBER', width: 14 },
        { key: 'reserved', header: 'Đang giữ', kind: 'NUMBER', width: 14 },
        { key: 'available', header: 'Còn bán được', kind: 'NUMBER', width: 16 },
        { key: 'reorderPoint', header: 'Ngưỡng đặt lại', kind: 'NUMBER', width: 16 },
      ],
      rows: report.items.map((row) => ({ ...row })),
    };

    return renderReportFile(
      table,
      query.format,
      `bao-cao-ton-kho_${vietnamDateKey(new Date())}`,
    );
  }

  /**
   * Khoảng thời gian nằm ngay trong tên file để người nhận không phải mở ra mới biết file của kỳ
   * nào. Khoảng lấy từ chính `ReportingService.resolveRange`, nên khi client bỏ trống `from`/`to`
   * thì tên file vẫn nói đúng khoảng đã dùng để tính số.
   */
  private render(
    table: TabularReport,
    query: ReportRangeQueryDto & { format: ReportExportQueryDto['format'] },
    stem: string,
  ): Promise<ReportFile> {
    const { from, to } = this.reporting.resolveRange(query);
    const suffix = `${vietnamDateKey(from)}_${vietnamDateKey(to)}`;
    return renderReportFile(table, query.format, `${stem}_${suffix}`);
  }
}
