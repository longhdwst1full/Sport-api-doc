import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { AuditWriter } from '../audit/audit.writer';
import {
  CHECKOUT_AUDIT_ACTION,
  CHECKOUT_STATUS,
  INVENTORY_RESERVATION_STATUS,
  RESERVATION_EXPIRY_REASON,
} from './checkout.constants';

interface LockedReservationId {
  id: bigint;
}

const MAX_SERIALIZATION_RETRIES = 3;

export interface ReservationExpiryRunResult {
  enabled: boolean;
  claimed: number;
  expired: number;
  hasMore: boolean;
  completedAt: string;
}

/**
 * Thu hồi tồn kho đang giữ khi reservation hết TTL.
 *
 * Invariant quan trọng:
 * - `inventory_balances.reserved`, trạng thái reservation/checkout và audit phải đổi trong cùng transaction.
 * - Worker chỉ xử lý reservation ACTIVE đã hết hạn; chạy lặp hoặc chạy song song không được release hai lần.
 * - Không thay đổi `on_hand`: expiry chỉ trả phần đang giữ về `available = on_hand - reserved`.
 */
@Injectable()
export class ReservationExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Xử lý một batch có giới hạn. Scheduler gọi lại khi `hasMore=true` thay vì giữ một serverless
   * invocation quá lâu. `requestId` được ghi vào audit để trace đúng lần chạy cron.
   */
  async run(requestId: string): Promise<ReservationExpiryRunResult> {
    const enabled = this.config.get<boolean>('app.jobs.reservationExpiry.enabled') ?? false;
    if (!enabled) return this.emptyResult(false);
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable checkout storage is not enabled');
    }
    const batchSize = this.config.getOrThrow<number>('app.jobs.reservationExpiry.batchSize');
    // Dùng một cutoff duy nhất để toàn bộ reservation trong batch được đánh giá cùng thời điểm.
    const completedAt = new Date();

    const expired = await this.withSerializationRetry(() => this.prisma.$transaction(async (transaction) => {
      // SKIP LOCKED cho phép nhiều worker chạy đồng thời nhưng không cùng claim một reservation.
      const claimed = await transaction.$queryRaw<LockedReservationId[]>(Prisma.sql`
        SELECT id
        FROM inventory_reservations
        WHERE status = ${INVENTORY_RESERVATION_STATUS.ACTIVE}
          AND expires_at <= ${completedAt}
        ORDER BY expires_at, id
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `);
      if (claimed.length === 0) return 0;

      const claimedIds = claimed.map(({ id }) => id);
      const reservations = await transaction.inventoryReservation.findMany({
        where: { id: { in: claimedIds } },
        include: { items: true },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      });
      if (reservations.length !== claimed.length) {
        throw new ServiceUnavailableException('Claimed reservation set is inconsistent');
      }

      // Gộp nhu cầu theo kho + SKU để mỗi balance chỉ bị decrement một lần trong transaction.
      const demand = new Map<string, {
        warehouseId: bigint;
        productVariantId: bigint;
        quantity: number;
      }>();
      for (const reservation of reservations) {
        for (const item of reservation.items) {
          const key = `${reservation.warehouseId}:${item.productVariantId}`;
          const current = demand.get(key);
          demand.set(key, {
            warehouseId: reservation.warehouseId,
            productVariantId: item.productVariantId,
            quantity: (current?.quantity ?? 0) + item.quantity,
          });
        }
      }
      if (demand.size === 0) {
        throw new ServiceUnavailableException('Claimed reservation has no items');
      }
      const grouped = new Map<bigint, bigint[]>();
      for (const item of demand.values()) {
        const variantIds = grouped.get(item.warehouseId) ?? [];
        if (!variantIds.includes(item.productVariantId)) variantIds.push(item.productVariantId);
        grouped.set(item.warehouseId, variantIds);
      }
      // Lock theo thứ tự kho rồi SKU cố định để giảm nguy cơ deadlock giữa các worker.
      const warehouseIds = [...grouped.keys()].sort((left, right) => (left < right ? -1 : 1));
      for (const warehouseId of warehouseIds) {
        const variantIds = grouped.get(warehouseId)!.sort((left, right) => (left < right ? -1 : 1));
        await transaction.$queryRaw(Prisma.sql`
          SELECT id
          FROM inventory_balances
          WHERE warehouse_id = ${warehouseId}
            AND product_variant_id IN (${Prisma.join(variantIds)})
          ORDER BY product_variant_id
          FOR UPDATE
        `);
      }

      const balances = await transaction.inventoryBalance.findMany({
        where: {
          OR: [...demand.values()].map(({ warehouseId, productVariantId }) => ({
            warehouseId,
            productVariantId,
          })),
        },
      });
      const balanceByKey = new Map(
        balances.map((balance) => [`${balance.warehouseId}:${balance.productVariantId}`, balance]),
      );
      for (const [key, item] of demand) {
        const balance = balanceByKey.get(key);
        if (!balance || balance.reserved < item.quantity) {
          throw new ServiceUnavailableException('Reserved inventory counter is inconsistent');
        }
        const updated = await transaction.inventoryBalance.updateMany({
          where: { id: balance.id, version: balance.version },
          data: { reserved: { decrement: item.quantity }, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ServiceUnavailableException('Inventory changed while expiring reservations');
        }
      }

      // Counter, lifecycle và audit phía dưới cùng commit hoặc cùng rollback.
      const reservationUpdate = await transaction.inventoryReservation.updateMany({
        where: {
          id: { in: claimedIds },
          status: INVENTORY_RESERVATION_STATUS.ACTIVE,
          expiresAt: { lte: completedAt },
        },
        data: {
          status: INVENTORY_RESERVATION_STATUS.EXPIRED,
          releasedAt: completedAt,
          releaseReason: RESERVATION_EXPIRY_REASON.TTL_EXPIRED,
          version: { increment: 1 },
        },
      });
      if (reservationUpdate.count !== claimed.length) {
        throw new ServiceUnavailableException('Reservation changed while expiry batch was running');
      }
      await transaction.checkoutSession.updateMany({
        where: {
          id: { in: reservations.map(({ checkoutSessionId }) => checkoutSessionId) },
          status: CHECKOUT_STATUS.CONFIRMED,
        },
        data: { status: CHECKOUT_STATUS.EXPIRED, version: { increment: 1 } },
      });
      for (const [index, reservation] of reservations.entries()) {
        await this.audit.write({
          requestId,
          sequenceNo: index + 1,
          actorType: 'SYSTEM',
          action: CHECKOUT_AUDIT_ACTION.RESERVATION_EXPIRE,
          entityType: 'INVENTORY_RESERVATION',
          entityId: toEntityId(reservation.id),
          before: { status: INVENTORY_RESERVATION_STATUS.ACTIVE },
          after: {
            status: INVENTORY_RESERVATION_STATUS.EXPIRED,
            releasedAt: completedAt.toISOString(),
          },
          reason: RESERVATION_EXPIRY_REASON.TTL_EXPIRED,
        }, transaction);
      }
      return claimed.length;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));

    return {
      enabled: true,
      claimed: expired,
      expired,
      hasMore: expired === batchSize,
      completedAt: completedAt.toISOString(),
    };
  }

  private emptyResult(enabled: boolean): ReservationExpiryRunResult {
    return {
      enabled,
      claimed: 0,
      expired: 0,
      hasMore: false,
      completedAt: new Date().toISOString(),
    };
  }

  /** Chỉ retry lỗi serialization/write-conflict; lỗi invariant phải nổi lên để vận hành xử lý. */
  private async withSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const rawPostgresCode = error instanceof Prisma.PrismaClientKnownRequestError
          ? error.meta?.code
          : undefined;
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError
          && (error.code === 'P2034' || (error.code === 'P2010' && rawPostgresCode === '40001'));
        if (!retryable || attempt === MAX_SERIALIZATION_RETRIES) throw error;
      }
    }
    throw new ServiceUnavailableException('Reservation expiry retry limit reached');
  }
}
