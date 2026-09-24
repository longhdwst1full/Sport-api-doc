import { SystemService } from './system.service';

describe('SystemService', () => {
  /**
   * 75 bảng của bản review V1, cộng `password_reset_tokens` phát sinh sau đó khi làm chức năng quên
   * mật khẩu — mô hình đã review không có chỗ lưu token nào. Ghi tại
   * `API-20260922-OUTBOX-NOTIFICATION-PASSWORD-RESET` trong `11-model-change-log.json`.
   * Return/Refund V1 bỏ `return_policies`, thêm `return_status_history` nên tổng không đổi
   * (`API-20260924-RETURN-REFUND-V1`).
   */
  it('covers the reviewed V1 model plus tables added after review', () => {
    const result = new SystemService().listModules();
    expect(result.totalModels).toBe(76);
    expect(result.p0Models).toBe(46);
    expect(result.p1Models).toBe(30);
    expect(new Set(result.items.flatMap((module) => module.tables)).size).toBe(76);
  });
});
