import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { ShippingPartnerModule } from '../../integrations/shipping-partner/shipping-partner.module';
import { ManualShippingProvider } from './providers/manual-shipping.provider';
import { PartnerShippingProvider } from './providers/partner-shipping.provider';
import { ShippingAreaController } from './shipping-area.controller';
import { ShippingAreaService } from './shipping-area.service';
import { ShippingQuoteController } from './shipping-quote.controller';
import { ShippingQuoteService } from './shipping-quote.service';
import { GhnRateProvider } from './providers/ghn-rate.provider';

@Module({
  imports: [ShippingPartnerModule, SystemModule],
  controllers: [ShippingQuoteController, ShippingAreaController],
  providers: [
    ManualShippingProvider,
    PartnerShippingProvider,
    GhnRateProvider,
    ShippingQuoteService,
    ShippingAreaService,
  ],
  exports: [ManualShippingProvider, PartnerShippingProvider, ShippingQuoteService],
})
export class ShippingModule {}
