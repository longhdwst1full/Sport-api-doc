import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { IntegrationConfigService } from '../../system/parameters/integration-config.service';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { ScopeType } from '../../iam/iam.types';
import type { AuthPrincipal } from '../../auth/auth.types';
import { FULFILLMENT_STATUS } from '../fulfillment.constants';
import { FulfillmentService } from './fulfillment.service';

/** Trạng thái GHN đẩy về webhook. Chỉ hai trạng thái dưới làm đổi state machine nội bộ. */
export const GHN_STATUS = {
  DELIVERED: 'delivered',
  DELIVERY_FAIL: 'delivery_fail',
} as const;

export interface GhnWebhookPayload {
  OrderCode?: string;
  Status?: string;
  Description?: string;
  Time?: string;
}

export interface CarrierStatusSyncResult {
  /** applied: đã đổi trạng thái. ignored: trạng thái không ảnh hưởng. replayed: đã xử lý trước đó. */
  outcome: 'applied' | 'ignored' | 'replayed' | 'unknown_tracking';
  trackingNo?: string;
  status?: string;
}

@Injectable()
export class CarrierStatusSyncService {
  private readonly logger = new Logger(CarrierStatusSyncService.name);

  constructor(
    private readonly integrations: IntegrationConfigService,
    private readonly prisma: PrismaService,
    private readonly fulfillments: FulfillmentService,
  ) {}

  /**
   * SECURITY: GHN không ký payload, nên endpoint chỉ được bảo vệ bằng secret dùng chung đặt trong
   * URL/header. So sánh constant-time và bắt buộc phải cấu hình; không có secret thì từ chối hết,
   * vì một webhook mở là đường để người lạ đánh dấu đơn đã giao.
   */
  async assertSecret(provided: string | undefined): Promise<void> {
    // Secret nằm ở bảng tham số hệ thống; đọc lúc nhận webhook để đổi secret không phải restart.
    const expected = (await this.integrations.ghn()).webhookSecret;
    if (!expected) {
      throw new UnauthorizedException('GHN webhook secret is not configured');
    }
    const actualBuffer = Buffer.from(provided ?? '');
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid GHN webhook secret');
    }
  }

  /**
   * IDEMPOTENCY: GHN gửi lại webhook khi không nhận được 200, và cùng một trạng thái có thể tới
   * nhiều lần. Khoá idempotency dựng từ mã vận đơn + trạng thái nên lần lặp lại rơi vào replay của
   * FulfillmentService thay vì chuyển trạng thái lần nữa.
   */
  async handle(payload: GhnWebhookPayload, requestId: string): Promise<CarrierStatusSyncResult> {
    const trackingNo = payload.OrderCode?.trim();
    const status = payload.Status?.trim().toLowerCase();
    if (!trackingNo || !status) return { outcome: 'ignored' };
    if (status !== GHN_STATUS.DELIVERED && status !== GHN_STATUS.DELIVERY_FAIL) {
      return { outcome: 'ignored', trackingNo, status };
    }

    const fulfillment = await this.prisma.fulfillment.findFirst({
      where: { trackingNo },
      select: { id: true, status: true, version: true },
    });
    if (!fulfillment) {
      // Vận đơn không thuộc hệ thống này (ví dụ shop dùng chung tài khoản GHN). Không phải lỗi.
      this.logger.warn({ message: 'GHN webhook cho mã vận đơn không tồn tại', trackingNo, status });
      return { outcome: 'unknown_tracking', trackingNo, status };
    }
    if (fulfillment.status !== FULFILLMENT_STATUS.SHIPPED) {
      return { outcome: 'replayed', trackingNo, status };
    }

    const key = `ghn-webhook:${trackingNo}:${status}`;
    const principal = await this.systemPrincipal();
    const expectedVersion = fulfillment.version.toString();
    const id = fulfillment.id.toString();
    try {
      if (status === GHN_STATUS.DELIVERED) {
        await this.fulfillments.deliver(
          id,
          { expectedVersion, note: payload.Description ?? 'GHN xác nhận đã giao' },
          key,
          requestId,
          principal,
        );
      } else {
        await this.fulfillments.failDelivery(
          id,
          {
            expectedVersion,
            reasonCode: 'CARRIER_DELIVERY_FAILED',
            reason: payload.Description?.trim() || 'GHN báo giao không thành công',
          },
          key,
          requestId,
          principal,
        );
      }
    } catch (error) {
      // Trạng thái vừa bị người khác đổi bằng tay. Coi như đã xử lý để GHN không gửi lại mãi.
      if (error instanceof ConflictException) {
        this.logger.warn({ message: 'GHN webhook xung đột với thao tác thủ công', trackingNo, status });
        return { outcome: 'replayed', trackingNo, status };
      }
      throw error;
    }
    return { outcome: 'applied', trackingNo, status };
  }

  /**
   * SECURITY: transition phải gắn được với một user có thật vì audit_logs khoá ngoại tới users.
   * Vận hành chỉ định sẵn tài khoản dịch vụ trong tham số hệ thống; không cấu hình thì webhook từ
   * chối thay vì bịa ra actor.
   */
  private async systemPrincipal(): Promise<AuthPrincipal> {
    const actorUserId = (await this.integrations.ghn()).webhookActorUserId;
    if (!actorUserId) {
      throw new UnauthorizedException('GHN webhook actor user is not configured');
    }
    return {
      userId: actorUserId,
      sessionId: 'ghn-webhook',
      displayName: 'GHN webhook',
      permissionVersion: 'system',
      permissions: ['fulfillment.delivery_update'],
      scopes: [{ type: ScopeType.GLOBAL }],
      mustChangePassword: false,
    };
  }
}
