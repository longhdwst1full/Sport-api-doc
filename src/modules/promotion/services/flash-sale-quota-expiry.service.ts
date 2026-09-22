import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SYSTEM_PARAMETER_CODE } from '../../system/parameters/system-parameter.catalog';
import { SystemParameterService } from '../../system/parameters/system-parameter.service';
import { FLASH_SALE_QUOTA_STATUS } from '../promotion.constants';

interface LockedReservationId {
  id: bigint;
}

export interface FlashSaleQuotaExpiryRunResult {
  enabled: boolean;
  claimed: number;
  expired: number;
  hasMore: boolean;
  completedAt: string;
}

/**
 * Trả suất flash sale về pool khi giữ chỗ hết hạn.
 *
 * Vì sao cần: quota chỉ được trả lại khi checkout bị release tường minh. Khách bỏ
 * ngang giữa chừng thì suất bị giữ vô thời hạn — chương trình càng chạy lâu càng
 * hụt suất bán dù chưa ai mua.
 *
 * Bất biến:
 * - Chỉ đụng reservation `ACTIVE` đã quá hạn. Suất đã `COMMITTED` thuộc về Order,
 *   vòng đời hủy đơn sở hữu việc hoàn suất (`revertCommittedQuota`).
 * - `flash_sale_items.reserved_quantity` và trạng thái reservation đổi trong cùng
 *   transaction; chạy lặp hoặc chạy song song không trả suất hai lần.
 * - Không đụng `sold_quantity`: hết hạn nghĩa là chưa bán được, không phải hoàn bán.
 *
 * Cấu hình đọc từ `system_parameters` để vận hành tắt worker ngay khi có sự cố mà không cần
 * redeploy; biến môi trường cùng tên vẫn là fallback khi tham số còn trống hoặc database chưa bật.
 */
@Injectable()
export class FlashSaleQuotaExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parameters: SystemParameterService,
  ) {}

  async run(): Promise<FlashSaleQuotaExpiryRunResult> {
    const enabled = await this.isEnabled();
    if (!enabled) return this.emptyResult(false);
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Kho dữ liệu khuyến mãi chưa được bật');
    }
    const batchSize = await this.parameters.getInteger(
      SYSTEM_PARAMETER_CODE.FLASH_SALE_QUOTA_EXPIRY_JOB_BATCH_SIZE,
    );
    // Một cutoff duy nhất để cả batch được đánh giá tại cùng thời điểm.
    const completedAt = new Date();

    const { claimed, expired } = await this.prisma.$transaction(async (transaction) => {
      // SKIP LOCKED: nhiều worker chạy song song nhưng không cùng claim một bản ghi.
      const locked = await transaction.$queryRaw<LockedReservationId[]>(Prisma.sql`
        SELECT reservation.id
        FROM flash_sale_quota_reservations reservation
        WHERE reservation.status = ${FLASH_SALE_QUOTA_STATUS.ACTIVE}
          AND reservation.expires_at <= ${completedAt}
        ORDER BY reservation.expires_at, reservation.id
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `);
      if (locked.length === 0) return { claimed: 0, expired: 0 };

      const lockedIds = locked.map(({ id }) => id);
      const reservations = await transaction.flashSaleQuotaReservation.findMany({
        where: { id: { in: lockedIds } },
        orderBy: [{ flashSaleItemId: 'asc' }, { id: 'asc' }],
      });

      // Gộp theo item để mỗi bản ghi quota chỉ bị decrement một lần trong transaction.
      const demand = new Map<bigint, number>();
      for (const reservation of reservations) {
        demand.set(
          reservation.flashSaleItemId,
          (demand.get(reservation.flashSaleItemId) ?? 0) + reservation.quantity,
        );
      }

      const updated = await transaction.flashSaleQuotaReservation.updateMany({
        where: { id: { in: lockedIds }, status: FLASH_SALE_QUOTA_STATUS.ACTIVE },
        data: {
          status: FLASH_SALE_QUOTA_STATUS.EXPIRED,
          releasedAt: completedAt,
          releaseReason: 'Hết hạn giữ suất flash sale',
          version: { increment: 1 },
        },
      });
      if (updated.count !== reservations.length) {
        // Bản ghi đổi trạng thái giữa lúc lock và lúc ghi: rollback để lần chạy sau
        // đánh giá lại, thay vì trả suất cho một reservation vừa được commit.
        throw new ServiceUnavailableException('Tập quota đã claim không còn nhất quán');
      }

      // Thứ tự item cố định để giảm nguy cơ deadlock giữa các worker.
      for (const itemId of [...demand.keys()].sort((left, right) => (left < right ? -1 : 1))) {
        await transaction.flashSaleItem.update({
          where: { id: itemId },
          data: {
            reservedQuantity: { decrement: demand.get(itemId)! },
            version: { increment: 1 },
          },
        });
      }

      return { claimed: locked.length, expired: updated.count };
    });

    return {
      enabled: true,
      claimed,
      expired,
      hasMore: claimed === batchSize,
      completedAt: completedAt.toISOString(),
    };
  }

  /** Cho controller hỏi trạng thái mà không phải lặp lại mã tham số. */
  async isEnabled(): Promise<boolean> {
    return this.parameters.getBoolean(SYSTEM_PARAMETER_CODE.FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED);
  }

  private emptyResult(enabled: boolean): FlashSaleQuotaExpiryRunResult {
    return { enabled, claimed: 0, expired: 0, hasMore: false, completedAt: new Date().toISOString() };
  }
}
