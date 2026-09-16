/**
 * Cắt ngày theo múi giờ nghiệp vụ của cửa hàng.
 *
 * Báo cáo trước đây dùng `setHours(0,0,0,0)` (giờ máy chủ) để lấy đầu ngày và
 * `toISOString().slice(0,10)` (giờ UTC) để gom theo ngày. Máy chủ chạy ở UTC thì đơn đặt
 * lúc 0h–7h sáng giờ Việt Nam bị tính sang ngày hôm trước, nên doanh thu theo ngày lệch.
 *
 * Việt Nam không đổi giờ theo mùa nên chênh lệch cố định +7.
 */
export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const VIETNAM_OFFSET_MINUTES = 7 * 60;
const MINUTE_IN_MS = 60_000;

/** Thời điểm 00:00 của ngày chứa `value`, tính theo giờ Việt Nam. */
export function startOfVietnamDay(value: Date): Date {
  const shifted = new Date(value.getTime() + VIETNAM_OFFSET_MINUTES * MINUTE_IN_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - VIETNAM_OFFSET_MINUTES * MINUTE_IN_MS);
}

/** Lùi `days` ngày rồi lấy đầu ngày theo giờ Việt Nam. */
export function vietnamDaysAgo(anchor: Date, days: number): Date {
  const shifted = new Date(anchor.getTime() - days * 24 * 60 * MINUTE_IN_MS);
  return startOfVietnamDay(shifted);
}

/** Khoá ngày `YYYY-MM-DD` theo giờ Việt Nam, dùng để gom số liệu theo ngày. */
export function vietnamDateKey(value: Date): string {
  const shifted = new Date(value.getTime() + VIETNAM_OFFSET_MINUTES * MINUTE_IN_MS);
  return shifted.toISOString().slice(0, 10);
}
