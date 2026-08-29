import { Injectable } from '@nestjs/common';
import { ShippingPartnerClient } from '../../../integrations/shipping-partner/shipping-partner.client';
import { ShippingProvider, ShippingRequest, ShippingResult } from './shipping-provider';

@Injectable()
export class PartnerShippingProvider extends ShippingProvider {
  constructor(private readonly partner: ShippingPartnerClient) {
    super();
  }

  createShipment(request: ShippingRequest): Promise<ShippingResult> {
    void request;
    throw new Error('Partner shipment mapping requires the reviewed recipient/address contract');
  }
}
