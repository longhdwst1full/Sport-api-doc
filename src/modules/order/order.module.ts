import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { AccountOrderController, AdminOrderController, GuestOrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { PaymentModule } from '../payment/payment.module';
import { PromotionModule } from '../promotion/promotion.module';
import { OrderMaintenanceController } from './controllers/order-maintenance.controller';
import { OrderCompletionService } from './services/order-completion.service';
import { PosOrderService } from './services/pos-order.service';
import { CheckoutModule } from '../checkout/checkout.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    NotificationModule,AuditModule, CartModule, PaymentModule, PromotionModule, CheckoutModule, FulfillmentModule],
  controllers: [GuestOrderController, AccountOrderController, AdminOrderController, OrderMaintenanceController],
  providers: [OrderService, OrderCompletionService, PosOrderService],
  exports: [OrderService, PosOrderService],
})
export class OrderModule {}
