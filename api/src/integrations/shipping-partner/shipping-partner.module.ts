import { Module } from '@nestjs/common';
import { DisabledShippingPartnerClient } from './disabled-shipping-partner.client';
import { ShippingPartnerClient } from './shipping-partner.client';

@Module({
  providers: [{ provide: ShippingPartnerClient, useClass: DisabledShippingPartnerClient }],
  exports: [ShippingPartnerClient],
})
export class ShippingPartnerModule {}
