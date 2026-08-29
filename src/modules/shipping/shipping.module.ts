import { Module } from '@nestjs/common';
import { ShippingPartnerModule } from '../../integrations/shipping-partner/shipping-partner.module';
import { ManualShippingProvider } from './providers/manual-shipping.provider';
import { PartnerShippingProvider } from './providers/partner-shipping.provider';

@Module({
  imports: [ShippingPartnerModule],
  providers: [ManualShippingProvider, PartnerShippingProvider],
  exports: [ManualShippingProvider, PartnerShippingProvider],
})
export class ShippingModule {}
