import { ConflictException } from '@nestjs/common';
import { assertPaymentAllowsConfirmation } from './order.service';

describe('assertPaymentAllowsConfirmation', () => {
  it('chặn xác nhận đơn VNPay chưa thanh toán (trước đây chỉ chặn chuyển khoản)', () => {
    expect(() => assertPaymentAllowsConfirmation('VNPAY', 'PENDING')).toThrow(ConflictException);
    expect(() => assertPaymentAllowsConfirmation('VNPAY', 'FAILED')).toThrow(/VNPay/);
  });

  it('cho xác nhận đơn trả trước khi tiền đã về', () => {
    expect(() => assertPaymentAllowsConfirmation('VNPAY', 'SUCCESS')).not.toThrow();
    expect(() => assertPaymentAllowsConfirmation('BANK_TRANSFER', 'SUCCESS')).not.toThrow();
  });

  it('vẫn chặn chuyển khoản chưa nhận tiền và không chặn COD', () => {
    expect(() => assertPaymentAllowsConfirmation('BANK_TRANSFER', 'PENDING')).toThrow(/chuyển khoản/);
    expect(() => assertPaymentAllowsConfirmation('COD', 'PENDING')).not.toThrow();
  });
});
