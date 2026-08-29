import { Injectable } from '@nestjs/common';
import { ShippingProvider, ShippingRequest, ShippingResult } from './shipping-provider';

@Injectable()
export class ManualShippingProvider extends ShippingProvider {
  createShipment(request: ShippingRequest): Promise<ShippingResult> {
    return Promise.resolve({
      provider: 'MANUAL',
      trackingCode: `MANUAL-${request.orderId}`,
    });
  }
}
