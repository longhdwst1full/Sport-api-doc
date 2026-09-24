/** Kênh gửi. V1 chỉ có email; giữ cột `channel` để thêm SMS/Zalo sau không phải đổi schema. */
export const NOTIFICATION_CHANNEL = {
  EMAIL: 'EMAIL',
} as const;

export const NOTIFICATION_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export const OUTBOX_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  /**
   * Hết lượt thử. Không xoá dòng: một sự kiện không gửi được là thứ vận hành cần đọc lại, và xoá đi
   * thì không ai biết đã mất cái gì.
   */
  DEAD: 'DEAD',
} as const;

/**
 * Loại sự kiện đưa vào outbox. Đây là **hợp đồng giữa nghiệp vụ và worker**: đổi chuỗi là những
 * dòng đang nằm chờ trong bảng trở thành không ai xử lý được.
 */
export const OUTBOX_EVENT_TYPE = {
  ORDER_PLACED: 'order.placed',
  ORDER_FULFILLMENT_UPDATED: 'order.fulfillment_updated',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_CHANGED: 'auth.password_changed',
  RETURN_DECIDED: 'return.decided',
  REFUND_SUCCEEDED: 'return.refund_succeeded',
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPE)[keyof typeof OUTBOX_EVENT_TYPE];

/**
 * Số lần thử trước khi bỏ cuộc, và khoảng chờ giữa các lần.
 *
 * Backoff tăng dần vì phần lớn lỗi gửi mail là tạm thời (rate limit, mạng chập chờn): thử lại ngay
 * lập tức chỉ dồn thêm tải vào đúng lúc nhà cung cấp đang quá tải.
 */
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_BACKOFF_SECONDS = [30, 120, 600, 3600] as const;

/** Một lượt worker xử lý tối đa ngần này sự kiện, để lượt chạy không kéo dài vô hạn. */
export const OUTBOX_BATCH_SIZE = 20;

/**
 * Sau ngần này giây, một dòng còn nằm `PROCESSING` được coi là do tiến trình chết giữa chừng và
 * được lấy lại.
 *
 * Không có cơ chế này thì dòng đó nằm `PROCESSING` VĨNH VIỄN: điều kiện lấy việc chỉ nhận
 * `PENDING`, nên không lỗi, không log, không retry — khách đơn giản là không nhận được email.
 * Và nó chắc chắn xảy ra: đo trên production cho thấy 3/20 lượt gọi cron bị timeout vì cold start.
 *
 * Giá trị phải LỚN HƠN thời gian chạy tối đa của một lượt worker, nếu không hai replica sẽ giành
 * nhau một dòng đang được xử lý bình thường và gửi email hai lần.
 */
export const OUTBOX_LOCK_TIMEOUT_SECONDS = 300;

/** Link đặt lại mật khẩu sống ngắn: đủ để mở hộp thư, không đủ để nằm lại trong hộp thư. */
export const PASSWORD_RESET_TTL_MINUTES = 30;
