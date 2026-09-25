import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { ReportExportService } from './report-export.service';
import type { ReportingService } from './reporting.service';

function principal(): AuthPrincipal {
  return {
    userId: '1',
    sessionId: 's',
    displayName: 'Tester',
    permissionVersion: '1',
    permissions: [],
    scopes: [{ type: ScopeType.GLOBAL }],
    mustChangePassword: false,
  };
}

function createExporter() {
  const revenue = jest.fn().mockResolvedValue({
    series: [{ date: '2026-09', amount: '15400000.00', orderCount: 3, refundAmount: '400000.00', netAmount: '15000000.00' }],
    byBranch: [
      {
        branchName: 'Chi nhánh Hà Nội',
        completedRevenue: '15400000.00',
        completedOrderCount: 3,
        expectedRevenue: '0.00',
        refundedAmount: '400000.00',
        netRevenue: '15000000.00',
      },
    ],
  });
  const reporting = {
    revenue,
    topProducts: jest.fn().mockResolvedValue({
      items: [{ sku: 'SKU-1', productName: 'Ống thép', quantitySold: 4, revenue: '400.00' }],
    }),
    topCustomers: jest.fn().mockResolvedValue({
      items: [{ customerNo: 'KH-1', name: 'Nguyễn A', orderCount: 2, revenue: '200.00' }],
    }),
    inventory: jest.fn().mockResolvedValue({ items: [] }),
    resolveRange: jest.fn().mockReturnValue({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-20T00:00:00.000Z'),
    }),
  } as unknown as ReportingService;

  return { exporter: new ReportExportService(reporting), revenue };
}

function csv(body: Buffer): string[] {
  return body.toString('utf8').replace(/^\uFEFF/, '').trimEnd().split('\r\n');
}

describe('ReportExportService', () => {
  /**
   * Số trên file phải đến từ đúng hàm đang phục vụ màn hình. Nếu ai đó thay bằng một truy vấn
   * riêng, hai con số sẽ lệch nhau mà không ai thấy — test này chốt lại đường đi đó.
   */
  it('lấy số từ ReportingService, không truy vấn lại', async () => {
    const { exporter, revenue } = createExporter();

    await exporter.revenue({ granularity: 'MONTH', format: 'CSV' }, principal());

    expect(revenue).toHaveBeenCalledWith(
      { granularity: 'MONTH', format: 'CSV' },
      expect.objectContaining({ userId: '1' }),
    );
  });

  it('xuất chuỗi doanh thu theo đúng cột', async () => {
    const { exporter } = createExporter();

    const file = await exporter.revenue({ granularity: 'MONTH', format: 'CSV' }, principal());

    expect(csv(file.body)).toEqual([
      '"Kỳ","Doanh thu thực nhận","Số đơn hoàn tất","Đã hoàn tiền","Doanh thu thuần"',
      '"2026-09","15400000.00","3","400000.00","15000000.00"',
    ]);
  });

  /** Khoảng thời gian trong tên file lấy từ khoảng đã dùng để tính, kể cả khi client bỏ trống. */
  it('gắn khoảng thời gian thực tế vào tên file', async () => {
    const { exporter } = createExporter();

    const file = await exporter.revenue({ granularity: 'DAY', format: 'XLSX' }, principal());

    expect(file.filename).toBe('bao-cao-doanh-thu_2026-09-01_2026-09-20.xlsx');
  });

  it('xuất bóc tách theo chi nhánh, khách hàng và sản phẩm bán chạy', async () => {
    const { exporter } = createExporter();
    const actor = principal();

    const branch = await exporter.revenueByBranch({ granularity: 'DAY', format: 'CSV' }, actor);
    const products = await exporter.topProducts({ limit: 10, format: 'CSV' }, actor);
    const customers = await exporter.topCustomers({ limit: 10, format: 'CSV' }, actor);

    expect(csv(branch.body)[1]).toBe('"Chi nhánh Hà Nội","15400000.00","3","0.00","400000.00","15000000.00"');
    expect(csv(products.body)[1]).toBe('"SKU-1","Ống thép","4","400.00"');
    expect(csv(customers.body)[1]).toBe('"KH-1","Nguyễn A","2","200.00"');
  });

  /** Tồn kho là ảnh chụp tức thời nên tên file mang ngày xuất, không mang khoảng from–to. */
  it('tên file tồn kho gắn ngày xuất', async () => {
    const { exporter } = createExporter();

    const file = await exporter.inventory({ format: 'CSV' }, principal());

    expect(file.filename).toMatch(/^bao-cao-ton-kho_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
