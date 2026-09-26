import { Module } from '@nestjs/common';
import { ShippingPartnerModule } from '../../integrations/shipping-partner/shipping-partner.module';
import { SystemModule } from '../system/system.module';
import { AuditModule } from '../audit/audit.module';
import { AdminFulfillmentController } from './controllers/fulfillment.controller';
import { GhnWebhookController } from './controllers/ghn-webhook.controller';
import { CarrierStatusSyncService } from './services/carrier-status-sync.service';
import { CarrierShipmentService } from './services/carrier-shipment.service';
import { FulfillmentService } from './services/fulfillment.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [AuditModule, ShippingPartnerModule, SystemModule, NotificationModule],
  controllers: [AdminFulfillmentController, GhnWebhookController],
  providers: [FulfillmentService, CarrierStatusSyncService, CarrierShipmentService],
  exports: [FulfillmentService, CarrierShipmentService],
})
export class FulfillmentModule {}
