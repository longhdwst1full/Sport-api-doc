import { BankTransferPaymentProvider } from '../providers/bank-transfer.provider';
import { CodPaymentProvider } from '../providers/cod.provider';
import { VnpayPaymentProvider } from '../providers/vnpay.provider';
import { VnpayGateway } from './vnpay.gateway';
import { PaymentProviderRegistry } from './payment-provider.registry';


/** Gateway giả: không cấu hình VNPay thì không sinh link, đủ cho test registry. */
const vnpayGatewayStub = {
  enabled: false,
  buildPaymentUrl: () => undefined,
} as unknown as VnpayGateway;

describe('PaymentProviderRegistry', () => {
  const registry = new PaymentProviderRegistry(
    new CodPaymentProvider(),
    new BankTransferPaymentProvider(),
    new VnpayPaymentProvider(vnpayGatewayStub),
  );

  it('selects the configured provider by stable payment method', () => {
    expect(registry.get('COD')).toBeInstanceOf(CodPaymentProvider);
    expect(registry.get('BANK_TRANSFER')).toBeInstanceOf(BankTransferPaymentProvider);
  });

  it('creates one bank-transfer instruction for the payment', () => {
    const instruction = registry.get('BANK_TRANSFER').createInstruction({
      paymentId: 'payment-1',
      orderId: 'ORDER-001',
      amountMinor: 1_490_000,
      currency: 'VND',
    });

    expect(instruction.reference).toBe('payment-1');
    expect(instruction.customerMessage).toContain('ORDER-001');
  });
});
