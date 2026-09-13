import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { toEntityId } from '../../../common/identifiers/entity-id';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import { ORDER_FULFILLMENT_STATUS, ORDER_PAYMENT_STATUS, ORDER_STATUS } from '../order.constants';

interface ClaimedOrder { id: bigint }

export interface OrderCompletionRunResult {
  enabled: boolean;
  claimed: number;
  completed: number;
  hasMore: boolean;
  completedAt: string;
}

/** Recognizes revenue only after the configured post-delivery hold has elapsed. */
@Injectable()
export class OrderCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditWriter,
  ) {}

  async run(requestId: string): Promise<OrderCompletionRunResult> {
    const enabled = this.config.get<boolean>('app.jobs.orderCompletion.enabled') ?? false;
    if (!enabled) return this.result(false, 0, 0, false);
    if (!this.prisma.isEnabled()) throw new ServiceUnavailableException('Kho dữ liệu đơn hàng chưa được bật');
    const batchSize = this.config.getOrThrow<number>('app.jobs.orderCompletion.batchSize');
    const holdHours = this.config.getOrThrow<number>('app.order.completionHoldHours');
    const completedAt = new Date();
    const cutoff = new Date(completedAt.getTime() - holdHours * 60 * 60_000);
    const completed = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.$queryRaw<ClaimedOrder[]>(Prisma.sql`
        SELECT customer_order.id
        FROM orders customer_order
        JOIN fulfillments fulfillment ON fulfillment.order_id = customer_order.id
        WHERE customer_order.status = ${ORDER_STATUS.DELIVERED}
          AND customer_order.payment_status = ${ORDER_PAYMENT_STATUS.SUCCESS}
          AND customer_order.fulfillment_status = ${ORDER_FULFILLMENT_STATUS.DELIVERED}
          AND fulfillment.status = 'DELIVERED'
          AND fulfillment.delivered_at <= ${cutoff}
        ORDER BY fulfillment.delivered_at, customer_order.id
        LIMIT ${batchSize}
        FOR UPDATE OF customer_order SKIP LOCKED
      `);
      for (const [index, { id }] of claimed.entries()) {
        const order = await transaction.order.findUniqueOrThrow({ where: { id }, include: { statusHistory: true } });
        const reason = `Tự động hoàn tất sau ${holdHours} giờ kể từ khi giao hàng`;
        await transaction.order.update({
          where: { id },
          data: {
            status: ORDER_STATUS.COMPLETED,
            completedAt,
            version: { increment: 1 },
            statusHistory: { create: {
              sequenceNo: order.statusHistory.length + 1,
              fromStatus: order.status,
              toStatus: ORDER_STATUS.COMPLETED,
              reason,
              actorType: 'SYSTEM',
              requestId,
            } },
          },
        });
        await this.audit.write({
          requestId,
          sequenceNo: index + 1,
          actorType: 'SYSTEM',
          action: 'order.complete-automatically',
          entityType: 'ORDER',
          entityId: toEntityId(order.id),
          before: { status: order.status },
          after: { status: ORDER_STATUS.COMPLETED, completedAt: completedAt.toISOString() },
          reason,
        }, transaction);
      }
      return claimed.length;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.result(true, completed, completed, completed === batchSize, completedAt);
  }

  private result(enabled: boolean, claimed: number, completed: number, hasMore: boolean, at = new Date()): OrderCompletionRunResult {
    return { enabled, claimed, completed, hasMore, completedAt: at.toISOString() };
  }
}
