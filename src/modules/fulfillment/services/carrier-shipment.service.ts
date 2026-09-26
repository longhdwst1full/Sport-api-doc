import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { orderBranchScopeWhere } from '../../../common/security/branch-scope';
import { PrismaService } from '../../../database/prisma.service';
import { ShippingPartnerClient } from '../../../integrations/shipping-partner/shipping-partner.client';
import { AuditWriter } from '../../audit/audit.writer';
import { SYSTEM_PARAMETER_CODE } from '../../system/parameters/system-parameter.catalog';
import { SystemParameterService } from '../../system/parameters/system-parameter.service';
import type { AuthPrincipal } from '../../auth/auth.types';
import { ORDER_STATUS } from '../../order/order.constants';
import type { FulfillmentDetailDto } from '../dto/fulfillment.dto';
import {
  AUTO_CARRIER_PROVIDER,
  CARRIER_SHIPMENT_AUDIT_ACTION,
  CARRIER_SHIPMENT_ERROR,
  CARRIER_SHIPMENT_JOB,
  CARRIER_SHIPMENT_STATUS,
  FULFILLMENT_STATUS,
} from '../fulfillment.constants';
import { FulfillmentService } from './fulfillment.service';
import { buildPartnerShipmentRequest } from './partner-shipment-request';

export interface CarrierShipmentRunResult {
  enabled: boolean;
  claimed: number;
  created: number;
  retried: number;
  failed: number;
  completedAt: string;
}

type AttemptOutcome = 'created' | 'retried' | 'failed';

const shipmentSourceInclude = {
  warehouse: { select: { branch: { select: { addressJson: true } } } },
  order: {
    select: {
      orderNo: true,
      status: true,
      grandTotal: true,
      addresses: { orderBy: { id: 'asc' as const }, take: 1 },
      checkoutSession: { select: { paymentMethod: true } },
      reservation: {
        select: {
          items: {
            orderBy: { productVariantId: 'asc' as const },
            select: {
              quantity: true,
              productVariant: { select: { weightGrams: true, lengthMm: true, widthMm: true, heightMm: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.FulfillmentInclude;

/** Fulfillment đã qua bước nào thì không còn đặt vận đơn tự động cho nó nữa. */
const OPEN_FULFILLMENT_STATUSES = new Set<string>([
  FULFILLMENT_STATUS.PENDING,
  FULFILLMENT_STATUS.PICKING,
  FULFILLMENT_STATUS.PACKED,
]);

/**
 * Tự tạo vận đơn GHN khi đơn đủ điều kiện giao: trả trước ngay khi payment SUCCESS, COD khi Admin
 * xác nhận đơn. Sở hữu các cột `carrier_shipment_*` của `fulfillments`; trạng thái kho vẫn do
 * `FulfillmentService` sở hữu.
 *
 * Luồng: `requestForOrder` đặt cờ PENDING trong transaction của sự kiện kích hoạt → worker
 * (`run`) claim PENDING → CREATING, gọi hãng NGOÀI transaction → CREATED + mã vận đơn, hoặc lỗi
 * thì thử lại có giãn cách, hết lượt thì CREATE_FAILED chờ Admin bấm tạo lại (`retry`).
 */
@Injectable()
export class CarrierShipmentService {
  private readonly logger = new Logger(CarrierShipmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingPartner: ShippingPartnerClient,
    private readonly audit: AuditWriter,
    private readonly fulfillments: FulfillmentService,
    private readonly parameters: SystemParameterService,
  ) {}

  /**
   * Bật khi cả tích hợp GHN lẫn tham số job đều bật. Tắt thì không đặt cờ mới, để bước ship quay về
   * tự tạo vận đơn như trước thay vì kẹt ở "đang tạo vận đơn".
   */
  async isEnabled(): Promise<boolean> {
    if (!this.shippingPartner.isEnabled()) return false;
    return this.parameters.getBoolean(SYSTEM_PARAMETER_CODE.CARRIER_SHIPMENT_JOB_ENABLED);
  }

  /**
   * Đặt yêu cầu tạo vận đơn, chạy TRONG transaction của caller (IPN VNPay, xác nhận chuyển khoản,
   * xác nhận đơn COD) để yêu cầu và sự kiện kích hoạt commit cùng nhau.
   *
   * IDEMPOTENCY: gọi lặp (IPN gửi lại, confirm replay) là no-op vì chỉ đặt cờ khi cờ đang trống.
   * Chỉ áp cho đơn báo giá qua GHN; BRANCH_FREE (shop tự giao), MANUAL_EXTERNAL (Nhờ shop gửi) và POS
   * giữ nguyên luồng cũ. Kết nối GHN tắt thì không đặt cờ để không có dòng chờ vĩnh viễn.
   */
  async requestForOrder(transaction: Prisma.TransactionClient, orderId: bigint): Promise<boolean> {
    if (!(await this.isEnabled())) return false;
    const fulfillment = await transaction.fulfillment.findUnique({
      where: { orderId },
      select: {
        id: true,
        status: true,
        trackingNo: true,
        carrierShipmentStatus: true,
        order: { select: { checkoutSession: { select: { shippingProvider: true } } } },
      },
    });
    if (
      !fulfillment ||
      fulfillment.carrierShipmentStatus ||
      fulfillment.trackingNo ||
      !OPEN_FULFILLMENT_STATUSES.has(fulfillment.status) ||
      fulfillment.order.checkoutSession.shippingProvider !== AUTO_CARRIER_PROVIDER
    ) {
      return false;
    }
    await transaction.fulfillment.update({
      where: { id: fulfillment.id },
      data: {
        carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.PENDING,
        carrierShipmentAttempts: 0,
        carrierShipmentNextAttemptAt: new Date(),
        carrierShipmentError: null,
      },
    });
    return true;
  }

  /** Worker: xử lý một lô vận đơn đến hạn. Gọi từ job bảo trì đơn hàng (cron nội bộ). */
  async run(): Promise<CarrierShipmentRunResult> {
    const result: CarrierShipmentRunResult = {
      enabled: this.prisma.isEnabled() && (await this.isEnabled()),
      claimed: 0, created: 0, retried: 0, failed: 0,
      completedAt: new Date().toISOString(),
    };
    if (!result.enabled) return result;

    const ids = await this.claimDue();
    result.claimed = ids.length;
    for (const id of ids) {
      const outcome = await this.attempt(id, { manual: false });
      result[outcome] += 1;
    }
    result.completedAt = new Date().toISOString();
    return result;
  }

  /** Admin bấm "Tạo lại vận đơn" cho dòng CREATE_FAILED; chạy ngay một lượt và trả chi tiết mới. */
  async retry(id: string, principal: AuthPrincipal, requestId: string): Promise<FulfillmentDetailDto> {
    const fulfillmentId = toDatabaseId(id);
    // SECURITY: scope chi nhánh kiểm ở backend như mọi thao tác giao vận khác.
    const visible = await this.prisma.fulfillment.findFirst({
      where: { id: fulfillmentId, AND: [orderBranchScopeWhere(principal)] },
      select: { id: true, carrierShipmentStatus: true },
    });
    if (!visible) throw new NotFoundException(CARRIER_SHIPMENT_ERROR.NOT_FOUND);
    if (!this.shippingPartner.isEnabled()) throw new ConflictException(CARRIER_SHIPMENT_ERROR.PARTNER_DISABLED);

    // IDEMPOTENCY: claim có điều kiện CREATE_FAILED → CREATING; bấm hai lần hoặc chạy song song với
    // worker thì chỉ một lượt thắng, lượt còn lại nhận 409 thay vì đặt vận đơn thứ hai.
    const claimed = await this.prisma.fulfillment.updateMany({
      where: { id: fulfillmentId, carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATE_FAILED },
      data: { carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATING, carrierShipmentLockedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException(CARRIER_SHIPMENT_ERROR.NOT_RETRYABLE);

    await this.audit.write({
      requestId,
      sequenceNo: 1,
      actorType: 'USER',
      actorUserId: principal.userId,
      action: CARRIER_SHIPMENT_AUDIT_ACTION.RETRY,
      entityType: 'FULFILLMENT',
      entityId: id,
      before: { carrierShipmentStatus: visible.carrierShipmentStatus },
      after: { carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATING },
    });
    await this.attempt(fulfillmentId, { manual: true });
    return this.fulfillments.get(id, principal);
  }

  /**
   * TRANSACTION: chỉ claim trong transaction ngắn; gọi hãng sau khi commit để không giữ khoá dòng suốt
   * vòng mạng. `SKIP LOCKED` chia việc giữa các replica; dòng CREATING quá hạn là tiến trình chết giữa
   * chừng và được thu hồi (hãng chặn trùng `client_order_code` = orderNo nên lượt thu hồi không đặt
   * thêm vận đơn, chỉ có thể báo lỗi "đã tồn tại" để Admin đối chiếu).
   */
  private async claimDue(): Promise<bigint[]> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM fulfillments
        WHERE (carrier_shipment_status = ${CARRIER_SHIPMENT_STATUS.PENDING} AND carrier_shipment_next_attempt_at <= NOW())
           OR (carrier_shipment_status = ${CARRIER_SHIPMENT_STATUS.CREATING}
               AND carrier_shipment_locked_at < NOW() - make_interval(mins => ${CARRIER_SHIPMENT_JOB.LOCK_TIMEOUT_MINUTES}))
        ORDER BY carrier_shipment_next_attempt_at, id
        LIMIT ${CARRIER_SHIPMENT_JOB.BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length === 0) return [];
      const ids = rows.map(({ id }) => id);
      await transaction.fulfillment.updateMany({
        where: { id: { in: ids } },
        data: { carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATING, carrierShipmentLockedAt: new Date() },
      });
      return ids;
    });
  }

  private async attempt(fulfillmentId: bigint, options: { manual: boolean }): Promise<AttemptOutcome> {
    const fulfillment = await this.prisma.fulfillment.findUnique({
      where: { id: fulfillmentId },
      include: shipmentSourceInclude,
    });
    if (!fulfillment) return 'failed';
    if (fulfillment.trackingNo) {
      // Đã có vận đơn (nhập tay/ship) trong lúc chờ: chỉ đóng cờ, không gọi hãng.
      await this.finish(fulfillmentId, { carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATED, carrierShipmentError: null });
      return 'created';
    }
    if (!OPEN_FULFILLMENT_STATUSES.has(fulfillment.status) || fulfillment.order.status === ORDER_STATUS.CANCELLED) {
      return this.fail(fulfillment.id, fulfillment.carrierShipmentAttempts, 'Đơn không còn ở trạng thái cần tạo vận đơn', true);
    }

    let request;
    try {
      request = buildPartnerShipmentRequest(fulfillment);
    } catch (error) {
      // Thiếu địa chỉ/mã địa giới chi nhánh là lỗi dữ liệu: thử lại tự động không tự khỏi.
      return this.fail(fulfillment.id, fulfillment.carrierShipmentAttempts, this.messageOf(error), true);
    }
    let shipment;
    try {
      shipment = await this.shippingPartner.createShipment(request);
    } catch (error) {
      return this.fail(fulfillment.id, fulfillment.carrierShipmentAttempts, this.messageOf(error), options.manual);
    }

    const saved = await this.prisma.fulfillment.updateMany({
      where: { id: fulfillment.id, carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATING, trackingNo: null },
      data: {
        carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATED,
        carrierCode: shipment.provider,
        trackingNo: shipment.trackingCode,
        carrierShipmentAttempts: { increment: 1 },
        carrierShipmentError: null,
        carrierShipmentLockedAt: null,
        carrierShipmentNextAttemptAt: null,
      },
    });
    if (saved.count !== 1) {
      // TRANSACTION: dòng đã bị lượt khác xử lý trong lúc gọi hãng → huỷ bù vận đơn vừa tạo, nếu không
      // shipper tới lấy một kiện mà hệ thống không theo dõi.
      await this.cancelOrphan(shipment.trackingCode, toEntityId(fulfillment.id));
      return 'failed';
    }
    return 'created';
  }

  private async fail(id: bigint, previousAttempts: number, message: string, final: boolean): Promise<AttemptOutcome> {
    const attempts = previousAttempts + 1;
    const exhausted = final || attempts >= CARRIER_SHIPMENT_JOB.MAX_AUTO_ATTEMPTS;
    const delayMinutes = CARRIER_SHIPMENT_JOB.BACKOFF_MINUTES[
      Math.min(attempts - 1, CARRIER_SHIPMENT_JOB.BACKOFF_MINUTES.length - 1)
    ];
    await this.finish(id, {
      carrierShipmentStatus: exhausted ? CARRIER_SHIPMENT_STATUS.CREATE_FAILED : CARRIER_SHIPMENT_STATUS.PENDING,
      carrierShipmentAttempts: attempts,
      carrierShipmentNextAttemptAt: exhausted ? null : new Date(Date.now() + delayMinutes * 60_000),
      // PROVIDER: giữ thông báo của hãng (đã cắt độ dài) vì đó là thứ duy nhất nói vì sao không tạo được.
      carrierShipmentError: message.slice(0, 500),
    });
    this.logger.warn({ message: 'Tạo vận đơn tự động thất bại', fulfillmentId: id.toString(), attempts, exhausted, error: message });
    return exhausted ? 'failed' : 'retried';
  }

  private async finish(id: bigint, data: Prisma.FulfillmentUpdateManyMutationInput): Promise<void> {
    await this.prisma.fulfillment.updateMany({
      where: { id, carrierShipmentStatus: CARRIER_SHIPMENT_STATUS.CREATING },
      data: { ...data, carrierShipmentLockedAt: null },
    });
  }

  private async cancelOrphan(trackingCode: string, fulfillmentId: string): Promise<void> {
    try {
      await this.shippingPartner.cancelShipment(trackingCode, 'Vận đơn tạo trùng');
    } catch (error) {
      this.logger.error({
        message: 'Không huỷ được vận đơn tạo trùng; cần huỷ tay ở cổng hãng',
        fulfillmentId,
        trackingCode,
        error: this.messageOf(error),
      });
    }
  }

  private messageOf(error: unknown): string {
    if (error instanceof ConflictException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response && 'message' in response && typeof response.message === 'string') {
        return response.message;
      }
    }
    return error instanceof Error ? error.message : 'Lỗi không xác định';
  }
}
