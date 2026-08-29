import { Injectable } from '@nestjs/common';
import { BankTransferPaymentProvider } from '../providers/bank-transfer.provider';
import { CodPaymentProvider } from '../providers/cod.provider';
import { PaymentMethod, PaymentProvider } from '../providers/payment-provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<PaymentMethod, PaymentProvider>;

  constructor(cod: CodPaymentProvider, bankTransfer: BankTransferPaymentProvider) {
    this.providers = new Map<PaymentMethod, PaymentProvider>([
      [cod.method, cod],
      [bankTransfer.method, bankTransfer],
    ]);
  }

  get(method: PaymentMethod): PaymentProvider {
    const provider = this.providers.get(method);
    if (!provider) throw new Error(`Unsupported payment method: ${method}`);
    return provider;
  }
}
