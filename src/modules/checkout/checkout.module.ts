import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AccountCheckoutController, AdminCheckoutController, GuestCheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { InventoryReservationService } from './inventory-reservation.service';

@Module({
  imports: [AuditModule, CartModule, ShippingModule],
  controllers: [GuestCheckoutController, AccountCheckoutController, AdminCheckoutController],
  providers: [CheckoutService, InventoryReservationService],
  exports: [CheckoutService, InventoryReservationService],
})
export class CheckoutModule {}
