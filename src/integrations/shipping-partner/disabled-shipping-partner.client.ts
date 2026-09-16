import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreatePartnerShipmentInput,
  PartnerShipmentResult,
  ShippingPartnerClient,
} from './shipping-partner.client';

@Injectable()
export class DisabledShippingPartnerClient extends ShippingPartnerClient {
  isEnabled(): boolean {
    return false;
  }

  createShipment(input: CreatePartnerShipmentInput): Promise<PartnerShipmentResult> {
    void input;
    throw new ServiceUnavailableException('Shipping partner is not configured');
  }

  cancelShipment(trackingCode: string, reason: string): Promise<void> {
    void trackingCode;
    void reason;
    throw new ServiceUnavailableException('Shipping partner is not configured');
  }

  createLabelUrl(trackingCodes: string[]): Promise<string> {
    void trackingCodes;
    throw new ServiceUnavailableException('Shipping partner is not configured');
  }
}
