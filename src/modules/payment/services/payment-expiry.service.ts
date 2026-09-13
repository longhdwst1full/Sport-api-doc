import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { toEntityId } from '../../../common/identifiers/entity-id';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import { INVENTORY_RESERVATION_STATUS } from '../../checkout/checkout.constants';
import { ORDER_FULFILLMENT_STATUS, ORDER_PAYMENT_STATUS, ORDER_STATUS } from '../../order/order.constants';
import { PAYMENT_METHOD, PAYMENT_STATUS, PAYMENT_TRANSACTION_TYPE } from '../payment.constants';

interface ClaimedOrder { id: bigint }

export interface PaymentExpiryRunResult {
  enabled: boolean;
  claimed: number;
  expired: number;
  hasMore: boolean;
  completedAt: string;
}

/** Releases reserved stock when an unpaid bank-transfer order passes its deadline. */
@Injectable()
export class PaymentExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditWriter,
  ) {}

  async run(requestId: string): Promise<PaymentExpiryRunResult> {
    const enabled = this.config.get<boolean>('app.jobs.paymentExpiry.enabled') ?? false;
    if (!enabled) return this.result(false, 0, 0, false);
    if (!this.prisma.isEnabled()) throw new ServiceUnavailableException('Kho dữ liệu thanh toán chưa được bật');
    const batchSize = this.config.getOrThrow<number>('app.jobs.paymentExpiry.batchSize');
    const cutoff = new Date();
    const outcome = await this.prisma.$transaction(async (transaction) => {
      // Claim Order first to preserve the global order → payment → reservation lock order.
      const claimed = await transaction.$queryRaw<ClaimedOrder[]>(Prisma.sql`
        SELECT customer_order.id
        FROM orders customer_order
        JOIN payments payment ON payment.order_id = customer_order.id
        JOIN inventory_reservations reservation ON reservation.id = customer_order.reservation_id
        WHERE customer_order.status = ${ORDER_STATUS.PENDING_CONFIRMATION}
          AND payment.method = ${PAYMENT_METHOD.BANK_TRANSFER}
          AND payment.status = ${PAYMENT_STATUS.PENDING}
          AND payment.expires_at <= ${cutoff}
          AND reservation.status = ${INVENTORY_RESERVATION_STATUS.ACTIVE}
          AND NOT EXISTS (SELECT 1 FROM payment_evidences evidence WHERE evidence.payment_id = payment.id)
        ORDER BY payment.expires_at, customer_order.id
        LIMIT ${batchSize}
        FOR UPDATE OF customer_order SKIP LOCKED
      `);
      let expired = 0;
      for (const [index, { id: orderId }] of claimed.entries()) {
        await transaction.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE order_id = ${orderId} FOR UPDATE`);
        await transaction.$queryRaw(Prisma.sql`SELECT id FROM inventory_reservations WHERE id = (SELECT reservation_id FROM orders WHERE id = ${orderId}) FOR UPDATE`);
        const order = await transaction.order.findUniqueOrThrow({
          where: { id: orderId },
          include: {
            payment: { include: { evidences: true } },
            reservation: { include: { items: { orderBy: { productVariantId: 'asc' } } } },
            fulfillment: { include: { history: true } },
            statusHistory: true,
          },
        });
        if (!order.payment || order.payment.status !== PAYMENT_STATUS.PENDING || order.payment.evidences.length > 0) continue;
        const variantIds = order.reservation.items.map((item) => item.productVariantId);
        if (variantIds.length === 0) throw new ServiceUnavailableException('Reservation của đơn hết hạn không có dòng tồn kho');
        await transaction.$queryRaw(Prisma.sql`
          SELECT id FROM inventory_balances
          WHERE warehouse_id = ${order.warehouseId}
            AND product_variant_id IN (${Prisma.join(variantIds)})
          ORDER BY product_variant_id FOR UPDATE
        `);
        const balances = await transaction.inventoryBalance.findMany({
          where: { warehouseId: order.warehouseId, productVariantId: { in: variantIds } },
        });
        const balanceByVariant = new Map(balances.map((balance) => [balance.productVariantId, balance]));
        for (const item of order.reservation.items) {
          const balance = balanceByVariant.get(item.productVariantId);
          if (!balance || balance.reserved < item.quantity) {
            throw new ServiceUnavailableException('Số lượng giữ chỗ của đơn hết hạn không nhất quán');
          }
          await transaction.inventoryBalance.update({
            where: { id: balance.id },
            data: { reserved: { decrement: item.quantity }, version: { increment: 1 } },
          });
        }
        const reason = 'Hết thời gian thanh toán chuyển khoản';
        const hash = createHash('sha256').update(`payment-expiry:${order.payment.id}`).digest('hex');
        await transaction.inventoryReservation.update({
          where: { id: order.reservationId },
          data: {
            status: INVENTORY_RESERVATION_STATUS.RELEASED,
            releasedAt: cutoff,
            releaseReason: 'PAYMENT_TIMEOUT',
            version: { increment: 1 },
          },
        });
        await transaction.payment.update({
          where: { id: order.payment.id },
          data: { status: PAYMENT_STATUS.CANCELLED, failureReason: reason, version: { increment: 1 } },
        });
        await transaction.paymentTransaction.create({
          data: {
            paymentId: order.payment.id,
            transactionType: PAYMENT_TRANSACTION_TYPE.EXPIRED,
            provider: 'MANUAL_BANK_TRANSFER',
            idempotencyKey: `payment-expiry:${order.payment.id}`,
            requestHash: hash,
            amount: 0,
            currencyCode: order.payment.currencyCode,
            status: PAYMENT_STATUS.CANCELLED,
            occurredAt: cutoff,
          },
        });
        if (order.fulfillment) {
          await transaction.fulfillment.update({
            where: { id: order.fulfillment.id },
            data: {
              status: 'CANCELLED',
              version: { increment: 1 },
              history: { create: {
                sequenceNo: order.fulfillment.history.length + 1,
                fromStatus: order.fulfillment.status,
                toStatus: 'CANCELLED',
                reason,
                requestId,
                idempotencyKey: `payment-expiry:${order.payment.id}`,
                requestHash: hash,
              } },
            },
          });
        }
        await transaction.order.update({
          where: { id: order.id },
          data: {
            status: ORDER_STATUS.CANCELLED,
            paymentStatus: ORDER_PAYMENT_STATUS.CANCELLED,
            fulfillmentStatus: ORDER_FULFILLMENT_STATUS.CANCELLED,
            cancelledAt: cutoff,
            cancelReason: reason,
            version: { increment: 1 },
            statusHistory: { create: {
              sequenceNo: order.statusHistory.length + 1,
              fromStatus: order.status,
              toStatus: ORDER_STATUS.CANCELLED,
              reason,
              actorType: 'SYSTEM',
              requestId,
              idempotencyKey: `payment-expiry:${order.payment.id}`,
              requestHash: hash,
            } },
          },
        });
        await this.audit.write({
          requestId,
          sequenceNo: index + 1,
          actorType: 'SYSTEM',
          action: 'payment.expire',
          entityType: 'PAYMENT',
          entityId: toEntityId(order.payment.id),
          before: { status: PAYMENT_STATUS.PENDING },
          after: { status: PAYMENT_STATUS.CANCELLED, orderStatus: ORDER_STATUS.CANCELLED },
          reason,
        }, transaction);
        expired += 1;
      }
      return { claimed: claimed.length, expired };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.result(true, outcome.claimed, outcome.expired, outcome.claimed === batchSize, cutoff);
  }

  private result(enabled: boolean, claimed: number, expired: number, hasMore: boolean, at = new Date()): PaymentExpiryRunResult {
    return { enabled, claimed, expired, hasMore, completedAt: at.toISOString() };
  }
}
