import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailClient } from '../../integrations/email/email.client';
import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  OUTBOX_BACKOFF_SECONDS,
  OUTBOX_BATCH_SIZE,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STATUS,
  type OutboxEventType,
} from './notification.constants';
import { maskEmail, recipientOf, renderEmail } from './notification.templates';

export interface OutboxRunResult {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  /** Bỏ qua vì đã gửi rồi (dedup key trùng) — không phải lỗi. */
  duplicated: number;
}

interface ClaimedEvent {
  id: bigint;
  event_type: string;
  payload_json: unknown;
  attempts: number;
}

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailClient,
  ) {}

  /**
   * Một lượt xử lý outbox.
   *
   * TRANSACTION: lấy việc bằng `FOR UPDATE SKIP LOCKED`. Không có `SKIP LOCKED` thì hai replica
   * cùng chờ trên một dòng rồi xử lý nối tiếp — chạy thêm máy không nhanh hơn. Có nó thì replica
   * thứ hai bỏ qua dòng đang bị giữ và lấy dòng khác.
   *
   * Việc gửi nằm NGOÀI transaction giữ dòng: giữ transaction mở suốt một lời gọi mạng tới nhà cung
   * cấp là giữ kết nối database cho tới khi họ trả lời, mà pooler chỉ có ngần ấy kết nối.
   */
  async run(runId: string = randomUUID()): Promise<OutboxRunResult> {
    const result: OutboxRunResult = { claimed: 0, sent: 0, retried: 0, dead: 0, duplicated: 0 };
    if (!this.prisma.isEnabled()) return result;

    const events = await this.claim(runId);
    result.claimed = events.length;

    for (const event of events) {
      try {
        const outcome = await this.deliver(event);
        if (outcome === 'duplicate') result.duplicated += 1;
        else result.sent += 1;
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OUTBOX_STATUS.DONE,
            processedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        const attempts = event.attempts + 1;
        const exhausted = attempts >= OUTBOX_MAX_ATTEMPTS;
        if (exhausted) result.dead += 1;
        else result.retried += 1;

        // Backoff tăng dần; hết bảng thì dùng mốc cuối cùng.
        const delaySeconds =
          OUTBOX_BACKOFF_SECONDS[Math.min(attempts - 1, OUTBOX_BACKOFF_SECONDS.length - 1)];
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: exhausted ? OUTBOX_STATUS.DEAD : OUTBOX_STATUS.PENDING,
            attempts,
            availableAt: new Date(Date.now() + delaySeconds * 1000),
            lockedAt: null,
            lockedBy: null,
            // Giữ nguyên thông báo lỗi của nhà cung cấp: đó là thứ duy nhất nói vì sao không gửi được.
            lastError: message.slice(0, 1000),
          },
        });
        this.logger.warn({
          message: 'Outbox event failed',
          outboxEventId: event.id.toString(),
          eventType: event.event_type,
          attempts,
          exhausted,
          error: message,
        });
      }
    }

    return result;
  }

  /**
   * Giữ một lô sự kiện cho lượt chạy này.
   *
   * `status = PENDING AND available_at <= now()` là điều kiện lấy việc; dòng nào đang bị replica
   * khác giữ thì `SKIP LOCKED` bỏ qua thay vì xếp hàng chờ.
   */
  private async claim(runId: string): Promise<ClaimedEvent[]> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<ClaimedEvent[]>`
        SELECT id, event_type, payload_json, attempts
        FROM public.outbox_events
        WHERE status = ${OUTBOX_STATUS.PENDING}
          AND available_at <= NOW()
        ORDER BY available_at, id
        LIMIT ${OUTBOX_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];
      await transaction.outboxEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { status: OUTBOX_STATUS.PROCESSING, lockedAt: new Date(), lockedBy: runId },
      });
      return rows;
    });
  }

  /**
   * Gửi một sự kiện và ghi nhật ký.
   *
   * IDEMPOTENCY: `dedup_key` dựng từ loại sự kiện + id outbox, unique theo kênh. Worker chạy lại
   * cùng một dòng — vì gửi xong mà cập nhật trạng thái lỗi chẳng hạn — sẽ vi phạm unique và dừng
   * lại thay vì gửi thêm một email nữa cho khách.
   */
  private async deliver(event: ClaimedEvent): Promise<'sent' | 'duplicate'> {
    const eventType = event.event_type as OutboxEventType;
    const payload = event.payload_json;
    const recipient = recipientOf(payload);
    if (!recipient.email) {
      // Không có địa chỉ nhận thì thử lại bao nhiêu lần cũng vậy; để nó chết luôn ở lần đầu.
      throw new Error('Sự kiện không có địa chỉ người nhận');
    }

    const dedupKey = `${eventType}:${event.id.toString()}`;

    /**
     * Một dòng nhật ký cho mỗi sự kiện, dùng lại qua các lần thử.
     *
     * Đã gửi thành công rồi thì dừng ngay: worker có thể lấy lại đúng dòng outbox đó nếu lần trước
     * gửi xong mà cập nhật trạng thái hỏng giữa chừng, và khách không nên nhận email thứ hai vì
     * một sự cố của chúng ta.
     */
    const existing = await this.prisma.notification.findUnique({
      where: { channel_dedupKey: { channel: NOTIFICATION_CHANNEL.EMAIL, dedupKey } },
      select: { id: true, status: true },
    });
    if (existing?.status === NOTIFICATION_STATUS.SENT) return 'duplicate';

    const notification = existing
      ? await this.prisma.notification.update({
          where: { id: existing.id },
          data: { attemptCount: { increment: 1 }, status: NOTIFICATION_STATUS.PENDING },
          select: { id: true },
        })
      : await this.prisma.notification.create({
          data: {
            templateCode: eventType,
            channel: NOTIFICATION_CHANNEL.EMAIL,
            dedupKey,
            recipientMasked: maskEmail(recipient.email),
            payloadJson: payload as Prisma.InputJsonValue,
            status: NOTIFICATION_STATUS.PENDING,
            attemptCount: 1,
          },
          select: { id: true },
        });

    const rendered = renderEmail(eventType, payload);
    try {
      const sent = await this.email.send({
        to: [{ email: recipient.email, name: recipient.name || undefined }],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        category: rendered.category,
      });
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NOTIFICATION_STATUS.SENT,
          sentAt: new Date(),
          providerMessageId: sent.messageIds[0] ?? null,
          errorCode: null,
        },
      });
      return 'sent';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      // Giữ lại dòng FAILED: một thông báo không gửi được là thứ vận hành cần đọc lại. Lần thử sau
      // dùng lại chính dòng này nên không vi phạm unique.
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NOTIFICATION_STATUS.FAILED, errorCode: message.slice(0, 100) },
      });
      throw error;
    }
  }
}
