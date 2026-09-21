import { toCsv, toXlsx, renderReportFile, type TabularReport } from './tabular-report';

const report: TabularReport = {
  title: 'Doanh thu',
  columns: [
    { key: 'date', header: 'Kỳ', kind: 'TEXT' },
    { key: 'amount', header: 'Doanh thu', kind: 'MONEY' },
    { key: 'orderCount', header: 'Số đơn', kind: 'NUMBER' },
  ],
  rows: [
    { date: '2026-09', amount: '15400000.00', orderCount: 3 },
    { date: '2026-10', amount: '0.00', orderCount: 0 },
  ],
};

/**
 * `ExcelJS.Buffer` khai báo riêng, không nhận `Buffer` của Node dù lúc chạy vẫn đọc được — ép kiểu
 * ở đúng một chỗ thay vì rải ra từng test.
 */
async function loadWorkbook(buffer: Buffer) {
  const { Workbook } = await import('exceljs');
  return new Workbook().xlsx.load(buffer as unknown as ArrayBuffer);
}

function csvLines(table: TabularReport): string[] {
  return toCsv(table).toString('utf8').replace(/^\uFEFF/, '').trimEnd().split('\r\n');
}

describe('CSV báo cáo', () => {
  it('mở đầu bằng BOM UTF-8 để Excel đọc đúng tiếng Việt', () => {
    expect(toCsv(report).toString('utf8').startsWith('\uFEFF')).toBe(true);
  });

  it('ghi tiêu đề và từng dòng theo đúng thứ tự cột', () => {
    expect(csvLines(report)).toEqual([
      '"Kỳ","Doanh thu","Số đơn"',
      '"2026-09","15400000.00","3"',
      '"2026-10","0.00","0"',
    ]);
  });

  it('nhân đôi dấu nháy kép trong dữ liệu', () => {
    const lines = csvLines({
      ...report,
      rows: [{ date: 'Ống thép 10"', amount: '1.00', orderCount: 1 }],
    });
    expect(lines[1]).toBe('"Ống thép 10""","1.00","1"');
  });

  /**
   * Hồi quy bảo mật: tên sản phẩm do người dùng nhập bắt đầu bằng `=` sẽ được Excel chạy như công
   * thức trên máy người mở file.
   */
  it('vô hiệu hoá ô bị hiểu là công thức', () => {
    const lines = csvLines({
      ...report,
      rows: [
        { date: '=1+1', amount: '1.00', orderCount: 1 },
        { date: '@SUM(A1)', amount: '1.00', orderCount: 1 },
        { date: '-2+3', amount: '1.00', orderCount: 1 },
      ],
    });
    expect(lines.slice(1).map((line) => line.split(',')[0])).toEqual([
      '"\'=1+1"',
      '"\'@SUM(A1)"',
      '"\'-2+3"',
    ]);
  });

  it('ô rỗng khi giá trị null hoặc thiếu', () => {
    const lines = csvLines({ ...report, rows: [{ date: null, amount: undefined }] });
    expect(lines[1]).toBe('"","",""');
  });
});

describe('XLSX báo cáo', () => {
  it('sinh workbook đọc lại được, tiền và số lượng là kiểu số', async () => {
    const workbook = await loadWorkbook(await toXlsx(report));
    const sheet = workbook.getWorksheet('Doanh thu');

    expect(sheet).toBeDefined();
    expect(sheet?.getRow(1).values).toEqual([undefined, 'Kỳ', 'Doanh thu', 'Số đơn']);
    // Ghi ra text thì Excel không cộng được cột tiền; kiểm tra kiểu chứ không chỉ kiểm tra nội dung.
    expect(sheet?.getCell('B2').value).toBe(15400000);
    expect(sheet?.getCell('C2').value).toBe(3);
    expect(sheet?.getCell('A2').value).toBe('2026-09');
  });

  it('cắt tên sheet quá dài và bỏ ký tự Excel từ chối', async () => {
    const workbook = await loadWorkbook(
      await toXlsx({ ...report, title: 'Bao cao [doanh thu] theo chi nhanh va kho' }),
    );

    const name = workbook.worksheets[0]?.name ?? '';
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });
});

describe('renderReportFile', () => {
  it('đặt đuôi file và content type theo định dạng', async () => {
    const csv = await renderReportFile(report, 'CSV', 'bao-cao');
    const xlsx = await renderReportFile(report, 'XLSX', 'bao-cao');

    expect(csv.filename).toBe('bao-cao.csv');
    expect(csv.contentType).toContain('text/csv');
    expect(xlsx.filename).toBe('bao-cao.xlsx');
    expect(xlsx.contentType).toContain('spreadsheetml');
    expect(xlsx.body.byteLength).toBeGreaterThan(0);
  });
});
