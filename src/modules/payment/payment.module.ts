import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { ObjectStorageModule } from '../../integrations/object-storage/object-storage.module';
import { AccountPaymentController, AdminPaymentController, GuestPaymentController } from './controllers/payment.controller';
import { BankTransferPaymentProvider } from './providers/bank-transfer.provider';
import { CodPaymentProvider } from './providers/cod.provider';
import { PaymentProviderRegistry } from './services/payment-provider.registry';
import { PaymentService } from './services/payment.service';
import { PaymentExpiryService } from './services/payment-expiry.service';

@Module({
  imports: [AuditModule, CartModule, ObjectStorageModule],
  controllers: [GuestPaymentController, AccountPaymentController, AdminPaymentController],
  providers: [CodPaymentProvider, BankTransferPaymentProvider, PaymentProviderRegistry, PaymentService, PaymentExpiryService],
  exports: [PaymentProviderRegistry, PaymentService, PaymentExpiryService],
})
export class PaymentModule {}
