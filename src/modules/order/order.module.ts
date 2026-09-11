import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { AccountOrderController, AdminOrderController, GuestOrderController } from './controllers/order.controller';
import { OrderService } from './services/order.service';

@Module({
  imports: [AuditModule, CartModule],
  controllers: [GuestOrderController, AccountOrderController, AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
