import { OUTBOX_EVENT_TYPE, type OutboxEventType } from './notification.constants';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /** Nhãn phân loại của provider, dùng để lọc trong email log. */
  category: string;
}

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

function layout(title: string, body: string): string {
  return [
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">',
    `<h1 style="font-size:18px;margin:0 0 12px">${title}</h1>`,
    body,
    '<p style="margin-top:24px;font-size:12px;color:#64748b">Email tự động, vui lòng không trả lời thư này.</p>',
    '</div>',
  ].join('');
}

/**
 * Nội dung email nằm trong mã nguồn, không phải bảng `notification_templates`.
 *
 * V1 chưa có ai ngoài team cần sửa nội dung email, mà một bảng template kéo theo màn quản trị,
 * versioning và kiểm tra biến được phép dùng. Khi có nhu cầu đó thì tạo bảng và đọc từ đó; chỗ gọi
 * không đổi vì worker chỉ biết tới hàm `renderEmail`.
 *
 * Mỗi hàm nhận payload đã lưu trong outbox — **không đọc lại database**. Email phải mô tả sự việc
 * tại thời điểm nó xảy ra; đọc lại lúc gửi sẽ mô tả trạng thái hiện giờ, có thể đã khác.
 */
export interface OrderPlacedPayload {
  orderNo: string;
  recipientEmail: string;
  recipientName: string;
  grandTotal: string;
  itemCount: number;
}

export interface FulfillmentUpdatedPayload {
  orderNo: string;
  recipientEmail: string;
  recipientName: string;
  status: string;
  trackingCode?: string | null;
}

export interface PasswordResetPayload {
  recipientEmail: string;
  recipientName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface PasswordChangedPayload {
  recipientEmail: string;
  recipientName: string;
  changedAt: string;
  revokedSessions: number;
}

export interface ReturnDecidedPayload {
  recipientEmail: string;
  recipientName: string;
  returnNo: string;
  orderNo: string;
  approved: boolean;
  note: string | null;
}

export interface RefundSucceededPayload {
  recipientEmail: string;
  recipientName: string;
  returnNo: string;
  orderNo: string;
  refundNo: string;
  amount: string;
  method: string;
}

const REFUND_METHOD_LABELS: Record<string, string> = {
  CASH: 'tiền mặt tại cửa hàng',
  BANK_TRANSFER: 'chuyển khoản',
};

const FULFILLMENT_LABELS: Record<string, string> = {
  PICKING: 'đang được soạn hàng',
  PACKED: 'đã đóng gói xong',
  SHIPPED: 'đã bàn giao cho đơn vị vận chuyển',
  DELIVERED: 'đã giao thành công',
  FAILED: 'giao không thành công',
};

export function renderEmail(eventType: OutboxEventType, payload: unknown): RenderedEmail {
  switch (eventType) {
    case OUTBOX_EVENT_TYPE.ORDER_PLACED: {
      const data = payload as OrderPlacedPayload;
      return {
        subject: `Đã nhận đơn hàng ${data.orderNo}`,
        text: [
          `Chào ${data.recipientName},`,
          '',
          `Chúng tôi đã nhận đơn hàng ${data.orderNo} gồm ${data.itemCount} sản phẩm.`,
          `Tổng tiền: ${money.format(Number(data.grandTotal))} (đã gồm VAT).`,
          '',
          'Chúng tôi sẽ báo lại khi đơn được giao cho đơn vị vận chuyển.',
        ].join('\n'),
        html: layout(
          `Đã nhận đơn hàng ${data.orderNo}`,
          `<p>Chào ${data.recipientName},</p>
           <p>Chúng tôi đã nhận đơn hàng <strong>${data.orderNo}</strong> gồm ${data.itemCount} sản phẩm.</p>
           <p>Tổng tiền: <strong>${money.format(Number(data.grandTotal))}</strong> (đã gồm VAT).</p>
           <p>Chúng tôi sẽ báo lại khi đơn được giao cho đơn vị vận chuyển.</p>`,
        ),
        category: 'order-placed',
      };
    }
    case OUTBOX_EVENT_TYPE.ORDER_FULFILLMENT_UPDATED: {
      const data = payload as FulfillmentUpdatedPayload;
      const label = FULFILLMENT_LABELS[data.status] ?? `chuyển sang trạng thái ${data.status}`;
      const tracking = data.trackingCode ? `Mã vận đơn: ${data.trackingCode}.` : '';
      return {
        subject: `Đơn ${data.orderNo} ${label}`,
        text: [
          `Chào ${data.recipientName},`,
          '',
          `Đơn hàng ${data.orderNo} ${label}.`,
          tracking,
        ].filter(Boolean).join('\n'),
        html: layout(
          `Đơn ${data.orderNo} ${label}`,
          `<p>Chào ${data.recipientName},</p>
           <p>Đơn hàng <strong>${data.orderNo}</strong> ${label}.</p>
           ${tracking ? `<p>${tracking}</p>` : ''}`,
        ),
        category: 'fulfillment-update',
      };
    }
    case OUTBOX_EVENT_TYPE.PASSWORD_RESET_REQUESTED: {
      const data = payload as PasswordResetPayload;
      return {
        subject: 'Đặt lại mật khẩu',
        text: [
          `Chào ${data.recipientName},`,
          '',
          'Mở đường dẫn dưới đây để đặt lại mật khẩu:',
          data.resetUrl,
          '',
          `Đường dẫn hết hạn sau ${data.expiresInMinutes} phút và chỉ dùng được một lần.`,
          'Nếu bạn không yêu cầu đặt lại mật khẩu, bỏ qua email này; mật khẩu hiện tại vẫn nguyên.',
        ].join('\n'),
        html: layout(
          'Đặt lại mật khẩu',
          `<p>Chào ${data.recipientName},</p>
           <p><a href="${data.resetUrl}" style="display:inline-block;background:#047857;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Đặt lại mật khẩu</a></p>
           <p>Đường dẫn hết hạn sau ${data.expiresInMinutes} phút và chỉ dùng được một lần.</p>
           <p>Nếu bạn không yêu cầu đặt lại mật khẩu, bỏ qua email này; mật khẩu hiện tại vẫn nguyên.</p>`,
        ),
        category: 'password-reset',
      };
    }
    case OUTBOX_EVENT_TYPE.PASSWORD_CHANGED: {
      const data = payload as PasswordChangedPayload;
      const revoked =
        data.revokedSessions > 0
          ? `${data.revokedSessions} phiên đăng nhập trên thiết bị khác đã bị đăng xuất.`
          : '';
      return {
        subject: 'Mật khẩu của bạn vừa được thay đổi',
        text: [
          `Chào ${data.recipientName},`,
          '',
          `Mật khẩu tài khoản của bạn vừa được thay đổi lúc ${data.changedAt}.`,
          revoked,
          '',
          'Nếu không phải bạn thực hiện, hãy liên hệ ngay với chúng tôi.',
        ].filter(Boolean).join('\n'),
        html: layout(
          'Mật khẩu của bạn vừa được thay đổi',
          `<p>Chào ${data.recipientName},</p>
           <p>Mật khẩu tài khoản của bạn vừa được thay đổi lúc <strong>${data.changedAt}</strong>.</p>
           ${revoked ? `<p>${revoked}</p>` : ''}
           <p>Nếu không phải bạn thực hiện, hãy liên hệ ngay với chúng tôi.</p>`,
        ),
        category: 'password-changed',
      };
    }
    case OUTBOX_EVENT_TYPE.RETURN_DECIDED: {
      const data = payload as ReturnDecidedPayload;
      const verdict = data.approved ? 'đã được chấp nhận' : 'chưa được chấp nhận';
      const next = data.approved
        ? 'Vui lòng gửi hoặc mang sản phẩm về cửa hàng. Tiền được hoàn sau khi cửa hàng nhận và kiểm hàng.'
        : '';
      const note = data.note ? `Ghi chú: ${data.note}` : '';
      return {
        subject: `Yêu cầu trả hàng ${data.returnNo} ${verdict}`,
        text: [
          `Chào ${data.recipientName},`,
          '',
          `Yêu cầu trả hàng ${data.returnNo} của đơn ${data.orderNo} ${verdict}.`,
          note,
          next,
        ].filter(Boolean).join('\n'),
        html: layout(
          `Yêu cầu trả hàng ${data.returnNo} ${verdict}`,
          `<p>Chào ${data.recipientName},</p>
           <p>Yêu cầu trả hàng <strong>${data.returnNo}</strong> của đơn <strong>${data.orderNo}</strong> ${verdict}.</p>
           ${note ? `<p>${note}</p>` : ''}
           ${next ? `<p>${next}</p>` : ''}`,
        ),
        category: 'return-decided',
      };
    }
    case OUTBOX_EVENT_TYPE.REFUND_SUCCEEDED: {
      const data = payload as RefundSucceededPayload;
      const method = REFUND_METHOD_LABELS[data.method] ?? data.method;
      return {
        subject: `Đã hoàn tiền cho yêu cầu trả hàng ${data.returnNo}`,
        text: [
          `Chào ${data.recipientName},`,
          '',
          `Cửa hàng đã hoàn ${money.format(Number(data.amount))} qua ${method} cho yêu cầu trả hàng ${data.returnNo} (đơn ${data.orderNo}).`,
          `Mã lượt hoàn: ${data.refundNo}.`,
        ].join('\n'),
        html: layout(
          `Đã hoàn tiền cho yêu cầu trả hàng ${data.returnNo}`,
          `<p>Chào ${data.recipientName},</p>
           <p>Cửa hàng đã hoàn <strong>${money.format(Number(data.amount))}</strong> qua ${method} cho yêu cầu trả hàng <strong>${data.returnNo}</strong> (đơn ${data.orderNo}).</p>
           <p>Mã lượt hoàn: ${data.refundNo}.</p>`,
        ),
        category: 'refund-succeeded',
      };
    }
  }
}

/** Người nhận nằm trong payload; worker không đọc lại database để biết gửi cho ai. */
export function recipientOf(payload: unknown): { email: string; name: string } {
  const data = payload as { recipientEmail?: string; recipientName?: string };
  return { email: data.recipientEmail ?? '', name: data.recipientName ?? '' };
}

/** SECURITY: nhật ký chỉ giữ bản che, không giữ địa chỉ email đầy đủ. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  const head = name.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(name.length - 1, 1))}@${domain}`;
}

/**
 * Trường mang bí mật dùng được ngay nếu đọc trộm được database.
 *
 * `resetUrl` chứa token đặt lại mật khẩu ở dạng RÕ. Bảng `password_reset_tokens` đã cẩn thận chỉ
 * lưu hash, nhưng chính cái link đầy đủ lại được chép sang `outbox_events.payload_json` rồi sang
 * `notifications.payload_json` — mà `notifications` là nhật ký sống lâu, không có hạn dọn. Ai đọc
 * được database trong vòng 30 phút có thể dùng thẳng link đó để đổi mật khẩu người khác.
 */
const SENSITIVE_PAYLOAD_FIELDS = ['resetUrl', 'token', 'rawToken', 'password'] as const;

export const REDACTED_PLACEHOLDER = '[redacted]';

/**
 * Bản payload dùng được cho nhật ký: giữ nguyên mọi thứ cần để tra cứu, che đúng phần bí mật.
 *
 * Che thay vì bỏ hẳn trường, để khi đọc log còn biết là sự kiện này CÓ mang link — bỏ trường đi
 * thì người đọc tưởng dữ liệu bị thiếu.
 */
export function redactSensitivePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const source = payload as Record<string, unknown>;
  let changed = false;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if ((SENSITIVE_PAYLOAD_FIELDS as readonly string[]).includes(key) && value !== undefined) {
      result[key] = REDACTED_PLACEHOLDER;
      changed = true;
      continue;
    }
    result[key] = value;
  }
  return changed ? result : payload;
}

/** Sự kiện có mang bí mật thì payload trong outbox phải được xoá ngay sau khi gửi xong. */
export function carriesSecret(payload: unknown): boolean {
  return redactSensitivePayload(payload) !== payload;
}
