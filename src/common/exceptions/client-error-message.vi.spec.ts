import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { clientMessageVi, ERROR_KEY } from './client-error-message.vi';

describe('Thông báo lỗi trả cho người dùng', () => {
  it('giữ nguyên thông báo vốn đã là tiếng Việt', () => {
    expect(clientMessageVi('Kho quầy không đủ hàng cho HQ-909S', 409)).toBe(
      'Kho quầy không đủ hàng cho HQ-909S',
    );
  });

  it('dịch thông báo tiếng Anh có trong bảng', () => {
    expect(clientMessageVi('Bearer access token is required', 401)).toBe(
      'Vui lòng đăng nhập để tiếp tục.',
    );
  });

  /**
   * Thông báo tiếng Anh không có trong bảng sẽ rơi về câu chung theo mã HTTP: khách chỉ
   * thấy "không thể xử lý yêu cầu" mà không biết lý do thật lẫn việc cần làm tiếp.
   */
  it('rơi về câu chung khi chưa có bản dịch', () => {
    expect(clientMessageVi('Some untranslated failure', 409)).not.toContain('untranslated');
  });

  /**
   * Chặn hồi quy: thêm một exception tiếng Anh mới mà quên bổ sung bản dịch sẽ làm test này
   * hỏng ngay, thay vì âm thầm trả câu chung chung cho khách.
   */
  it('mọi thông báo lỗi trong mã nguồn đều có bản dịch', () => {
    const root = join(__dirname, '..', '..');
    // Đọc thẳng từ hằng số thay vì dò chuỗi trong file: đổi cách khai báo bảng không được
    // làm bài kiểm tra này im lặng bỏ qua.
    const translated = new Set<string>(Object.values(ERROR_KEY));

    const collect = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry: string) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return collect(full);
        return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
      });

    const pattern =
      /new (?:BadRequest|NotFound|Conflict|Forbidden|Unauthorized|UnprocessableEntity|ServiceUnavailable|Gone|PreconditionFailed)\w*Exception\(\s*['"`]([^'"`]+)/g;
    const untranslated = new Set<string>();

    for (const file of collect(root)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const message = match[1];
        // Chỉ xét thông báo tiếng Anh thuần; thông báo đã tiếng Việt thì trả thẳng.
        if (!/^[A-Za-z][A-Za-z0-9 ,.:;()'_-]*$/.test(message)) continue;
        if (!translated.has(message)) untranslated.add(message);
      }
    }

    expect(Array.from(untranslated).sort()).toEqual([]);
  });
});
