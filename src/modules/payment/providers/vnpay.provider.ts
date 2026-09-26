import { Injectable } from '@nestjs/common';
import { PAYMENT_PROVIDER } from '../payment.constants';
import { VnpayGateway } from '../services/vnpay.gateway';
import {
  PaymentInstruction,
  PaymentInstructionInput,
  PaymentProvider,
} from './payment-provider';

@Injectable()
export class VnpayPaymentProvider extends PaymentProvider {
  readonly method = 'VNPAY' as const;

  constructor(private readonly gateway: VnpayGateway) {
    super();
  }

  createInstruction(input: PaymentInstructionInput): PaymentInstruction {
    // Link ký lại mỗi lần đọc: chữ ký VNPay gắn với thời điểm tạo và có hạn,
    // nên lưu sẵn vào database sẽ phát ra link chết.
    // INVARIANT: quá hạn thanh toán thì không phát link mới — job hết hạn sẽ huỷ đơn và nhả hàng,
    // khách trả tiền sau đó là trả cho một đơn không còn.
    const expired = Boolean(input.expiresAt && input.expiresAt.getTime() <= Date.now());
    const redirectUrl = expired
      ? undefined
      : this.gateway.buildPaymentUrl({
          paymentRef: input.paymentId,
          orderNo: input.orderId,
          amount: input.amountMinor,
          expiresAt: input.expiresAt ?? undefined,
        });

    return {
      method: this.method,
      provider: PAYMENT_PROVIDER.VNPAY,
      reference: input.paymentId,
      customerMessage: redirectUrl
        ? 'Bấm thanh toán để chuyển sang cổng VNPay. Đơn được xác nhận sau khi VNPay báo thành công.'
        : expired
          ? 'Đã hết thời gian thanh toán VNPay cho đơn này. Vui lòng đặt lại đơn hoặc liên hệ cửa hàng.'
          : 'Cổng VNPay chưa được cấu hình. Vui lòng liên hệ cửa hàng để thanh toán theo cách khác.',
      ...(redirectUrl ? { redirectUrl } : {}),
    };
  }
}
