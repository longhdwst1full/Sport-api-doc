import type { VnpayGateway } from '../services/vnpay.gateway';
import { VnpayPaymentProvider } from './vnpay.provider';

describe('VnpayPaymentProvider', () => {
  const build = () => {
    const buildPaymentUrl = jest.fn().mockReturnValue('https://sandbox.vnpayment.vn/pay?x=1');
    const provider = new VnpayPaymentProvider({ buildPaymentUrl } as unknown as VnpayGateway);
    return { provider, buildPaymentUrl };
  };
  const input = { paymentId: 'PAY-1', orderId: 'ORD-1', amountMinor: 500_000, currency: 'VND' as const };

  it('ký link với hạn thanh toán của payment để link không sống lâu hơn đơn', () => {
    const { provider, buildPaymentUrl } = build();
    const expiresAt = new Date(Date.now() + 10 * 60_000);

    expect(provider.createInstruction({ ...input, expiresAt }).redirectUrl).toBeDefined();
    expect(buildPaymentUrl).toHaveBeenCalledWith(expect.objectContaining({ expiresAt }));
  });

  it('không phát link khi đã quá hạn thanh toán', () => {
    const { provider, buildPaymentUrl } = build();

    const instruction = provider.createInstruction({ ...input, expiresAt: new Date(Date.now() - 1_000) });

    expect(instruction.redirectUrl).toBeUndefined();
    expect(instruction.customerMessage).toMatch(/hết thời gian/i);
    expect(buildPaymentUrl).not.toHaveBeenCalled();
  });
});
