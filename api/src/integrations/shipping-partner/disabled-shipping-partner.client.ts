import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreatePartnerShipmentInput,
  PartnerShipmentResult,
  ShippingPartnerClient,
} from './shipping-partner.client';

@Injectable()
export class DisabledShippingPartnerClient extends ShippingPartnerClient {
  createShipment(input: CreatePartnerShipmentInput): Promise<PartnerShipmentResult> {
    void input;
    throw new ServiceUnavailableException('Shipping partner is not configured');
  }

  cancelShipment(trackingCode: string, reason: string): Promise<void> {
    void trackingCode;
    void reason;
    throw new ServiceUnavailableException('Shipping partner is not configured');
  }
}
