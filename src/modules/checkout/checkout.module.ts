import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';

import { AuditModule } from '../audit/audit.module';
import { CartModule } from '../cart/cart.module';
import { PromotionModule } from '../promotion/promotion.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AccountCheckoutController, AdminCheckoutController, GuestCheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { InventoryReservationService } from './inventory-reservation.service';
import { ReservationExpiryController } from './reservation-expiry.controller';
import { ReservationExpiryService } from './reservation-expiry.service';

@Module({
  imports: [SystemModule, AuditModule, CartModule, PromotionModule, ShippingModule],
  controllers: [GuestCheckoutController, AccountCheckoutController, AdminCheckoutController, ReservationExpiryController],
  providers: [CheckoutService, InventoryReservationService, ReservationExpiryService],
  exports: [CheckoutService, InventoryReservationService],
})
export class CheckoutModule {}
