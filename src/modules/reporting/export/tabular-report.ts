/**
 * Định dạng trung gian giữa báo cáo và file tải về.
 *
 * Mọi báo cáo được quy về một bảng (tiêu đề + cột + dòng) rồi mới ghi ra CSV hoặc XLSX, nên
 * thêm một báo cáo mới chỉ cần khai cột — không phải viết lại phần sinh file lần nữa.
 */
export const REPORT_EXPORT_FORMATS = ['CSV', 'XLSX'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

/**
 * `MONEY`/`NUMBER` giữ giá trị dạng số khi ghi XLSX để Excel còn cộng/lọc được; ghi ra text thì
 * người dùng phải tự chuyển kiểu từng cột. CSV luôn là text nên khác biệt này không áp dụng.
 */
export type ReportColumnKind = 'TEXT' | 'NUMBER' | 'MONEY';

export interface ReportColumn {
  key: string;
  header: string;
  kind: ReportColumnKind;
  width?: number;
}

export type ReportCell = string | number | null | undefined;

export interface TabularReport {
  /** Tên sheet XLSX và cũng là phần mô tả trong tên file. */
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
}

export interface ReportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

/**
 * `CSV_MEDIA_TYPE` là khoá media type dùng trong OpenAPI (không kèm tham số, để bộ sinh SDK nhận ra
 * kiểu chuẩn); `CSV_CONTENT_TYPE` là header thật, có charset để trình duyệt không đoán bảng mã.
 */
export const CSV_MEDIA_TYPE = 'text/csv';
export const CSV_CONTENT_TYPE = `${CSV_MEDIA_TYPE}; charset=utf-8`;
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Excel trên Windows đọc CSV theo bảng mã hệ thống chứ không đoán UTF-8, nên thiếu BOM là toàn bộ
 * tiếng Việt có dấu hiển thị sai. Xuống dòng dùng CRLF theo RFC 4180 vì cùng lý do tương thích.
 */
const UTF8_BOM = '﻿';

export function toCsv(report: TabularReport): Buffer {
  const lines = [
    report.columns.map((column) => escapeCsv(column.header)).join(','),
    ...report.rows.map((row) =>
      report.columns.map((column) => escapeCsv(formatText(row[column.key]))).join(','),
    ),
  ];
  return Buffer.from(`${UTF8_BOM}${lines.join('\r\n')}\r\n`, 'utf8');
}

/**
 * Một ô bắt đầu bằng `=`, `+`, `-` hoặc `@` được Excel hiểu là công thức. Dữ liệu người dùng nhập
 * (tên sản phẩm, tên khách) đi thẳng vào CSV là một đường chèn công thức vào máy người mở file,
 * nên chặn bằng cách thêm dấu nháy đơn đứng trước.
 *
 * SECURITY: chống CSV injection; bỏ đoạn này là mở lại đường thực thi trên máy người nhận file.
 */
function escapeCsv(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function formatText(value: ReportCell): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export async function toXlsx(report: TabularReport): Promise<Buffer> {
  // Nạp exceljs khi thật sự xuất file: thư viện này nặng, còn tiến trình sinh OpenAPI và mọi
  // request khác không cần tới nó.
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName(report.title));

  sheet.columns = report.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 18,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of report.rows) {
    sheet.addRow(
      Object.fromEntries(
        report.columns.map((column) => [column.key, toSheetValue(row[column.key], column.kind)]),
      ),
    );
  }

  for (const [index, column] of report.columns.entries()) {
    if (column.kind === 'MONEY') sheet.getColumn(index + 1).numFmt = '#,##0.00';
    if (column.kind === 'NUMBER') sheet.getColumn(index + 1).numFmt = '#,##0';
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Tiền được service trả về dạng chuỗi thập phân để không mất chính xác khi đi qua JSON. Khi ghi
 * XLSX phải đổi lại thành số; `Number` ở đây an toàn vì giá trị chỉ dùng để hiển thị/tính trong
 * Excel, không quay lại hệ thống.
 */
function toSheetValue(value: ReportCell, kind: ReportColumnKind): string | number | null {
  if (value === null || value === undefined || value === '') return null;
  if (kind === 'TEXT') return String(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value);
}

/** Excel từ chối tên sheet dài quá 31 ký tự hoặc chứa `[]:*?/\`. */
function sheetName(title: string): string {
  return title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Report';
}

export async function renderReportFile(
  report: TabularReport,
  format: ReportExportFormat,
  filenameStem: string,
): Promise<ReportFile> {
  if (format === 'CSV') {
    return {
      filename: `${filenameStem}.csv`,
      contentType: CSV_CONTENT_TYPE,
      body: toCsv(report),
    };
  }
  return {
    filename: `${filenameStem}.xlsx`,
    contentType: XLSX_CONTENT_TYPE,
    body: await toXlsx(report),
  };
}
