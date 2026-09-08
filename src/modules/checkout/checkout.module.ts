import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { SystemModule } from '../system/system.module';
import { InventoryReservationService } from './inventory-reservation.service';

@Module({
  imports: [AuditModule, SystemModule],
  providers: [InventoryReservationService],
  exports: [InventoryReservationService],
})
export class CheckoutModule {}
