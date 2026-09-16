import { Module } from '@nestjs/common';
import { ShippingPartnerModule } from '../../integrations/shipping-partner/shipping-partner.module';
import { AuditModule } from '../audit/audit.module';
import { AdminFulfillmentController } from './controllers/fulfillment.controller';
import { GhnWebhookController } from './controllers/ghn-webhook.controller';
import { CarrierStatusSyncService } from './services/carrier-status-sync.service';
import { FulfillmentService } from './services/fulfillment.service';

@Module({
  imports: [AuditModule, ShippingPartnerModule],
  controllers: [AdminFulfillmentController, GhnWebhookController],
  providers: [FulfillmentService, CarrierStatusSyncService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
