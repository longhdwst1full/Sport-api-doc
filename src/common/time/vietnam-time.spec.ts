import { startOfVietnamDay, vietnamDateKey, vietnamDaysAgo } from './vietnam-time';

/**
 * Máy chủ chạy ở UTC thì đơn đặt lúc 0h–7h sáng giờ Việt Nam rơi vào ngày hôm trước nếu
 * cắt ngày theo UTC. Đây đúng là khung giờ cửa hàng mở sổ, nên sai ở đây làm doanh thu
 * ngày hôm đó thiếu và ngày hôm trước thừa.
 */
describe('Cắt ngày theo giờ Việt Nam', () => {
  it('đơn lúc 1h sáng giờ Việt Nam vẫn thuộc ngày hôm đó', () => {
    // 2026-09-16T01:30 +07 = 2026-09-15T18:30Z
    const luc1hSang = new Date('2026-09-15T18:30:00.000Z');

    expect(vietnamDateKey(luc1hSang)).toBe('2026-09-16');
    // Cắt theo UTC sẽ ra ngày hôm trước.
    expect(luc1hSang.toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it('đơn lúc 23h giờ Việt Nam vẫn thuộc đúng ngày, không nhảy sang hôm sau', () => {
    // 2026-09-16T23:30 +07 = 2026-09-16T16:30Z
    expect(vietnamDateKey(new Date('2026-09-16T16:30:00.000Z'))).toBe('2026-09-16');
  });

  it('đầu ngày là 17h UTC hôm trước', () => {
    const start = startOfVietnamDay(new Date('2026-09-15T18:30:00.000Z'));

    expect(start.toISOString()).toBe('2026-09-15T17:00:00.000Z');
    expect(vietnamDateKey(start)).toBe('2026-09-16');
  });

  it('lùi ngày rồi lấy đầu ngày theo giờ Việt Nam', () => {
    const result = vietnamDaysAgo(new Date('2026-09-16T01:00:00.000Z'), 7);

    expect(vietnamDateKey(result)).toBe('2026-09-09');
    expect(result.toISOString()).toBe('2026-09-08T17:00:00.000Z');
  });
});
