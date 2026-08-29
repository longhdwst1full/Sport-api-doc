import { BankTransferPaymentProvider } from '../providers/bank-transfer.provider';
import { CodPaymentProvider } from '../providers/cod.provider';
import { PaymentProviderRegistry } from './payment-provider.registry';

describe('PaymentProviderRegistry', () => {
  const registry = new PaymentProviderRegistry(
    new CodPaymentProvider(),
    new BankTransferPaymentProvider(),
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
