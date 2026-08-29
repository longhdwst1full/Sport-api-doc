import { Module } from '@nestjs/common';
import { BankTransferPaymentProvider } from './providers/bank-transfer.provider';
import { CodPaymentProvider } from './providers/cod.provider';
import { PaymentProviderRegistry } from './services/payment-provider.registry';

@Module({
  providers: [CodPaymentProvider, BankTransferPaymentProvider, PaymentProviderRegistry],
  exports: [PaymentProviderRegistry],
})
export class PaymentModule {}
