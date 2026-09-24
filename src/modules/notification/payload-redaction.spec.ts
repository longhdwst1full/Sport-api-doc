import { carriesSecret, redactSensitivePayload, REDACTED_PLACEHOLDER } from './notification.templates';

/**
 * `password_reset_tokens` chỉ lưu hash — đúng. Nhưng link đầy đủ kèm token dạng RÕ lại được chép
 * sang `outbox_events.payload_json` rồi sang `notifications.payload_json`, mà `notifications` là
 * nhật ký sống lâu không có hạn dọn. Đọc trộm được database trong 30 phút là đổi được mật khẩu
 * người khác.
 */
describe('che bí mật trong payload thông báo', () => {
  const resetPayload = {
    recipientEmail: 'khach@example.com',
    recipientName: 'Khách',
    resetUrl: 'https://shop.example/reset-password?token=RAW-SECRET-TOKEN',
    expiresInMinutes: 30,
  };

  it('che link đặt lại mật khẩu, giữ nguyên phần còn lại để còn tra cứu được', () => {
    const redacted = redactSensitivePayload(resetPayload) as Record<string, unknown>;

    expect(JSON.stringify(redacted)).not.toContain('RAW-SECRET-TOKEN');
    expect(redacted.resetUrl).toBe(REDACTED_PLACEHOLDER);
    expect(redacted.recipientEmail).toBe('khach@example.com');
    expect(redacted.expiresInMinutes).toBe(30);
  });

  /** Che chứ không bỏ trường: bỏ đi thì người đọc log tưởng dữ liệu bị thiếu. */
  it('giữ lại tên trường để biết sự kiện này có mang link', () => {
    const redacted = redactSensitivePayload(resetPayload) as Record<string, unknown>;

    expect(Object.keys(redacted)).toContain('resetUrl');
  });

  it('payload không có bí mật thì trả về nguyên vẹn', () => {
    const orderPayload = { recipientEmail: 'a@b.c', orderNo: 'DH-1', grandTotal: '1000.00' };

    expect(redactSensitivePayload(orderPayload)).toBe(orderPayload);
    expect(carriesSecret(orderPayload)).toBe(false);
  });

  it('nhận ra payload có mang bí mật để dọn dòng outbox sau khi gửi', () => {
    expect(carriesSecret(resetPayload)).toBe(true);
  });

  it('che cả các tên trường bí mật khác', () => {
    const redacted = redactSensitivePayload({
      token: 'abc',
      rawToken: 'def',
      password: 'ghi',
      safe: 'xyz',
    }) as Record<string, unknown>;

    expect(redacted.token).toBe(REDACTED_PLACEHOLDER);
    expect(redacted.rawToken).toBe(REDACTED_PLACEHOLDER);
    expect(redacted.password).toBe(REDACTED_PLACEHOLDER);
    expect(redacted.safe).toBe('xyz');
  });

  it('giá trị không phải object đi qua không đổi', () => {
    expect(redactSensitivePayload(null)).toBeNull();
    expect(redactSensitivePayload('text')).toBe('text');
    expect(carriesSecret(null)).toBe(false);
  });
});
