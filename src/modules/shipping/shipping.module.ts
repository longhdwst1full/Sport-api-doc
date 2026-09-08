import { Module } from '@nestjs/common';
import { ShippingPartnerModule } from '../../integrations/shipping-partner/shipping-partner.module';
import { ManualShippingProvider } from './providers/manual-shipping.provider';
import { PartnerShippingProvider } from './providers/partner-shipping.provider';
import { ShippingQuoteController } from './shipping-quote.controller';
import { ShippingQuoteService } from './shipping-quote.service';
import { GhnRateProvider } from './providers/ghn-rate.provider';
import { GhtkRateProvider } from './providers/ghtk-rate.provider';

@Module({
  imports: [ShippingPartnerModule],
  controllers: [ShippingQuoteController],
  providers: [
    ManualShippingProvider,
    PartnerShippingProvider,
    GhnRateProvider,
    GhtkRateProvider,
    ShippingQuoteService,
  ],
  exports: [ManualShippingProvider, PartnerShippingProvider, ShippingQuoteService],
})
export class ShippingModule {}
