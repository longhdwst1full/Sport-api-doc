import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { InventoryReservationService } from './inventory-reservation.service';

@Module({
  imports: [AuditModule],
  providers: [InventoryReservationService],
  exports: [InventoryReservationService],
})
export class CheckoutModule {}
