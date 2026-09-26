import { Module } from '@nestjs/common';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { SystemModule } from '../system/system.module';
import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { ObjectStorageModule } from '../../integrations/object-storage/object-storage.module';
import { AccountPaymentController, AdminPaymentController, GuestPaymentController } from './controllers/payment.controller';
import { BankTransferPaymentProvider } from './providers/bank-transfer.provider';
import { VnpayPaymentProvider } from './providers/vnpay.provider';
import { VnpayController } from './controllers/vnpay.controller';
import { VnpayGateway } from './services/vnpay.gateway';
import { VnpayService } from './services/vnpay.service';
import { CodPaymentProvider } from './providers/cod.provider';
import { PaymentProviderRegistry } from './services/payment-provider.registry';
import { PaymentService } from './services/payment.service';
import { PaymentExpiryService } from './services/payment-expiry.service';

@Module({
  imports: [SystemModule, AuditModule, CartModule, ObjectStorageModule, FulfillmentModule],
  controllers: [GuestPaymentController, AccountPaymentController, AdminPaymentController, VnpayController],
  providers: [CodPaymentProvider, BankTransferPaymentProvider, VnpayGateway, VnpayPaymentProvider, PaymentProviderRegistry, PaymentService, PaymentExpiryService, VnpayService],
  exports: [PaymentProviderRegistry, PaymentService, PaymentExpiryService, VnpayService],
})
export class PaymentModule {}
