import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VNPay, ignoreLogger, type ReturnQueryFromVNPay } from 'vnpay';

export interface BuildPaymentUrlInput {
  paymentRef: string;
  orderNo: string;
  /** Số tiền VND nguyên bản; thư viện tự nhân 100 theo đặc tả VNPay. */
  amount: number;
  ipAddress?: string;
  /** Hạn thanh toán của payment; `vnp_ExpireDate` lấy mốc sớm hơn giữa hạn này và now + expireMinutes. */
  expiresAt?: Date;
}

export interface VnpayVerification {
  isVerified: boolean;
  isSuccess: boolean;
  /** Số tiền VNPay báo, đã quy về VND (thư viện trả về đơn vị đã nhân 100). */
  amount: number;
  transactionNo?: string;
  responseCode?: string;
  message?: string;
}

/**
 * Bọc thư viện `vnpay` để phần còn lại của hệ thống không phụ thuộc trực tiếp vào nó,
 * và để việc thiếu cấu hình được xử lý ở đúng một chỗ.
 */
@Injectable()
export class VnpayGateway {
  private readonly logger = new Logger(VnpayGateway.name);
  private readonly client?: VNPay;

  constructor(private readonly config: ConfigService) {
    if (!this.enabled) {
      this.logger.warn('VNPay chưa cấu hình (thiếu VNPAY_TMN_CODE/VNPAY_HASH_SECRET); tính năng tắt');
      return;
    }
    this.client = new VNPay({
      tmnCode: this.config.getOrThrow<string>('vnpay.terminalCode'),
      secureSecret: this.config.getOrThrow<string>('vnpay.hashSecret'),
      vnpayHost: new URL(this.config.getOrThrow<string>('vnpay.paymentUrl')).origin,
      testMode: false,
      // Log của thư viện có thể chứa tham số đã ký; không đẩy ra log ứng dụng.
      loggerFn: ignoreLogger,
    });
  }

  get enabled(): boolean {
    return this.config.get<boolean>('vnpay.enabled') === true;
  }

  buildPaymentUrl(input: BuildPaymentUrlInput): string | undefined {
    if (!this.client) return undefined;
    const expireMinutes = this.config.get<number>('vnpay.expireMinutes') ?? 15;
    return this.client.buildPaymentUrl({
      vnp_Amount: input.amount,
      vnp_TxnRef: input.paymentRef,
      vnp_OrderInfo: `Thanh toan don ${input.orderNo}`,
      vnp_IpAddr: input.ipAddress ?? '127.0.0.1',
      vnp_ReturnUrl: this.config.getOrThrow<string>('vnpay.returnUrl'),
      vnp_ExpireDate: this.expireDate(expireMinutes, input.expiresAt),
    });
  }

  verifyIpn(query: ReturnQueryFromVNPay): VnpayVerification {
    return this.toVerification(this.client?.verifyIpnCall(query));
  }

  verifyReturn(query: ReturnQueryFromVNPay): VnpayVerification {
    return this.toVerification(this.client?.verifyReturnUrl(query));
  }

  private toVerification(result: unknown): VnpayVerification {
    if (!result || typeof result !== 'object') {
      return { isVerified: false, isSuccess: false, amount: 0 };
    }
    const value = result as Record<string, unknown>;
    const text = (input: unknown): string | undefined => {
      if (typeof input === 'string') return input.trim() || undefined;
      if (typeof input === 'number') return String(input);
      return undefined;
    };

    return {
      isVerified: value.isVerified === true,
      isSuccess: value.isSuccess === true,
      // vnp_Amount về ở đơn vị đã nhân 100; quy lại VND để so với expectedAmount.
      amount: Number(text(value.vnp_Amount) ?? 0) / 100,
      transactionNo: text(value.vnp_TransactionNo),
      responseCode: text(value.vnp_ResponseCode),
      message: typeof value.message === 'string' ? value.message : undefined,
    };
  }

  /** VNPay yêu cầu yyyyMMddHHmmss theo giờ GMT+7, truyền dưới dạng số. */
  private expireDate(minutes: number, cap?: Date): number {
    const deadline = Math.min(Date.now() + minutes * 60_000, cap?.getTime() ?? Number.POSITIVE_INFINITY);
    const gmt7 = new Date(deadline + 7 * 3_600_000);
    return Number(gmt7.toISOString().replace(/[-:T]/g, '').slice(0, 14));
  }
}
