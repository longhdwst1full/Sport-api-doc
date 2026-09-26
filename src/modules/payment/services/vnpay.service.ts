import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReturnQueryFromVNPay } from 'vnpay';
import { PrismaService } from '../../../database/prisma.service';
import {
  PAYMENT_METHOD,
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION_TYPE,
  VNPAY_IPN_RESPONSE,
} from '../payment.constants';
import { VnpayGateway } from './vnpay.gateway';
import { CarrierShipmentService } from '../../fulfillment/services/carrier-shipment.service';

export interface VnpayIpnResult {
  RspCode: string;
  Message: string;
}

export interface VnpayReturnResult {
  paymentRef?: string;
  orderNo?: string;
  /** Chỉ để hiển thị. Trạng thái thật của đơn luôn lấy từ database, do IPN ghi. */
  displayStatus: 'SUCCESS' | 'FAILED' | 'INVALID';
  message: string;
}

const SYSTEM_ACTOR_EMAIL = 'system@dctd.local';

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);
  private systemActorId?: bigint;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: VnpayGateway,
    private readonly carrierShipments: CarrierShipmentService,
  ) {}

  /**
   * IPN là đường DUY NHẤT được ghi nhận đã thanh toán.
   * `vnp_ReturnUrl` chỉ là trình duyệt quay về — khách có thể đóng tab, đổi URL,
   * hoặc không bao giờ quay lại, nên không được phép đụng vào trạng thái tiền.
   */
  async handleIpn(query: ReturnQueryFromVNPay): Promise<VnpayIpnResult> {
    if (!this.gateway.enabled) return VNPAY_IPN_RESPONSE.UNKNOWN_ERROR;

    const verification = this.gateway.verifyIpn(query);
    if (!verification.isVerified) return VNPAY_IPN_RESPONSE.INVALID_SIGNATURE;

    const paymentRef = String(query.vnp_TxnRef ?? '').trim();
    if (!paymentRef) return VNPAY_IPN_RESPONSE.ORDER_NOT_FOUND;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const payment = await transaction.payment.findUnique({
          where: { paymentRef },
          select: {
            id: true, orderId: true, status: true, method: true,
            expectedAmount: true, currencyCode: true,
          },
        });
        if (!payment || payment.method !== PAYMENT_METHOD.VNPAY) {
          return VNPAY_IPN_RESPONSE.ORDER_NOT_FOUND;
        }
        // VNPay gọi lại nhiều lần cho cùng một giao dịch; lần thứ hai trở đi
        // không được cộng tiền lần nữa. REFUNDED cũng là đã thu: IPN đến muộn sau khi hoàn tiền
        // không được lật payment về SUCCESS/FAILED và xoá dấu vết hoàn tiền.
        if (payment.status === PAYMENT_STATUS.SUCCESS || payment.status === PAYMENT_STATUS.REFUNDED) {
          return VNPAY_IPN_RESPONSE.ALREADY_CONFIRMED;
        }
        // INVARIANT: payment đã bị huỷ (quá hạn, đơn đã nhả hàng) không được lật về SUCCESS. Link VNPay
        // hết hạn trước khi job huỷ nên trường hợp này hiếm; nếu VNPay vẫn báo đã thu tiền thì cần hoàn
        // tiền thủ công — ghi lỗi để vận hành đối soát, trả "đã xử lý" để VNPay ngừng gọi lại.
        if (payment.status === PAYMENT_STATUS.CANCELLED) {
          if (verification.isSuccess) {
            this.logger.error(`VNPay báo thu tiền cho payment đã huỷ ${paymentRef} (mã GD ${verification.transactionNo ?? 'không rõ'}); cần hoàn tiền thủ công`);
          }
          return VNPAY_IPN_RESPONSE.ALREADY_CONFIRMED;
        }
        const expected = new Prisma.Decimal(payment.expectedAmount);
        if (!expected.equals(new Prisma.Decimal(verification.amount))) {
          return VNPAY_IPN_RESPONSE.INVALID_AMOUNT;
        }

        const now = new Date();
        const succeeded = verification.isSuccess;
        const nextStatus = succeeded ? PAYMENT_STATUS.SUCCESS : PAYMENT_STATUS.FAILED;
        const actorId = await this.resolveSystemActorId(transaction);

        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: nextStatus,
            receivedAmount: succeeded ? expected : 0,
            confirmedBy: succeeded ? actorId : null,
            confirmedAt: succeeded ? now : null,
            failureReason: succeeded
              ? null
              : `VNPay từ chối giao dịch (mã ${verification.responseCode ?? 'không rõ'})`,
            version: { increment: 1 },
          },
        });
        await transaction.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: nextStatus, version: { increment: 1 } },
        });
        // TRANSACTION: yêu cầu tạo vận đơn GHN commit cùng lúc tiền được ghi nhận; worker gọi hãng sau.
        if (succeeded) await this.carrierShipments.requestForOrder(transaction, payment.orderId);
        await transaction.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            transactionType: succeeded
              ? PAYMENT_TRANSACTION_TYPE.CONFIRMED
              : PAYMENT_TRANSACTION_TYPE.REJECTED,
            provider: PAYMENT_PROVIDER.VNPAY,
            externalId: verification.transactionNo ?? paymentRef,
            // Khoá chống trùng: cùng một mã giao dịch VNPay chỉ ghi sổ một lần.
            idempotencyKey: `vnpay:${paymentRef}:${verification.transactionNo ?? 'none'}`,
            requestHash: verification.responseCode ?? '',
            amount: succeeded ? expected : new Prisma.Decimal(0),
            currencyCode: payment.currencyCode,
            status: nextStatus,
            rawPayloadRedacted: {
              responseCode: verification.responseCode,
              transactionNo: verification.transactionNo,
            },
            occurredAt: now,
          },
        });
        return VNPAY_IPN_RESPONSE.SUCCESS;
      });
    } catch (error) {
      // Ghi sổ trùng do VNPay gọi lại song song: coi như đã xác nhận, không báo lỗi.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return VNPAY_IPN_RESPONSE.ALREADY_CONFIRMED;
      }
      this.logger.error(`Xử lý IPN VNPay thất bại cho ${paymentRef}`, error as Error);
      return VNPAY_IPN_RESPONSE.UNKNOWN_ERROR;
    }
  }

  /** Chỉ dùng để hiển thị cho khách sau khi trình duyệt quay về; không ghi gì. */
  handleReturn(query: ReturnQueryFromVNPay): VnpayReturnResult {
    if (!this.gateway.enabled) {
      return { displayStatus: 'INVALID', message: 'Cổng VNPay chưa được cấu hình' };
    }
    const verification = this.gateway.verifyReturn(query);
    const paymentRef = query.vnp_TxnRef ? String(query.vnp_TxnRef) : undefined;
    if (!verification.isVerified) {
      return {
        ...(paymentRef ? { paymentRef } : {}),
        displayStatus: 'INVALID',
        message: 'Chữ ký không hợp lệ; vui lòng kiểm tra lại đơn hàng trong tài khoản',
      };
    }
    return {
      ...(paymentRef ? { paymentRef } : {}),
      displayStatus: verification.isSuccess ? 'SUCCESS' : 'FAILED',
      message: verification.isSuccess
        ? 'VNPay báo thanh toán thành công. Đơn hàng được cập nhật ngay khi hệ thống nhận xác nhận từ VNPay.'
        : 'Giao dịch chưa thành công. Bạn có thể thử thanh toán lại từ trang đơn hàng.',
    };
  }

  private async resolveSystemActorId(transaction: Prisma.TransactionClient): Promise<bigint> {
    if (this.systemActorId !== undefined) return this.systemActorId;
    const actor = await transaction.user.findFirst({
      where: { normalizedEmail: SYSTEM_ACTOR_EMAIL },
      select: { id: true },
    });
    if (!actor) {
      throw new Error(
        'Thiếu tài khoản hệ thống system@dctd.local; chạy migration 20260914120000_vnpay_payment_method',
      );
    }
    this.systemActorId = actor.id;
    return actor.id;
  }
}
