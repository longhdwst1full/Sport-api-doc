import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId } from '../../common/identifiers/entity-id';
import type { OutboxEventType } from './notification.constants';

export interface OutboxAppendInput {
  aggregateType: string;
  /** Entity id dạng chuỗi của nghiệp vụ sinh ra sự kiện. */
  aggregateId: string;
  eventType: OutboxEventType;
  payload: Prisma.InputJsonValue;
}

/**
 * Ghi ý định gửi thông báo vào outbox.
 *
 * TRANSACTION: **luôn truyền transaction của nghiệp vụ vào đây.** Ghi ngoài transaction thì có hai
 * cách hỏng, cách nào cũng im lặng: nghiệp vụ rollback mà outbox đã ghi thì khách nhận email về một
 * đơn không tồn tại; nghiệp vụ commit mà ghi outbox lỗi thì đơn có thật nhưng không ai được báo.
 *
 * Đổi lại, bảng outbox phải nằm cùng database với nghiệp vụ — đó là lý do V1 chọn outbox trong
 * PostgreSQL thay vì thêm một message broker.
 */
@Injectable()
export class OutboxWriter {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    input: OutboxAppendInput,
    transaction: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: toDatabaseId(input.aggregateId),
        eventType: input.eventType,
        payloadJson: input.payload,
      },
    });
  }
}
