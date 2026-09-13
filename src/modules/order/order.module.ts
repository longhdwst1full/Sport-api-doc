import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { AccountOrderController, AdminOrderController, GuestOrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { PaymentModule } from '../payment/payment.module';
import { OrderMaintenanceController } from './controllers/order-maintenance.controller';
import { OrderCompletionService } from './services/order-completion.service';

@Module({
  imports: [AuditModule, CartModule, PaymentModule],
  controllers: [GuestOrderController, AccountOrderController, AdminOrderController, OrderMaintenanceController],
  providers: [OrderService, OrderCompletionService],
  exports: [OrderService],
})
export class OrderModule {}
