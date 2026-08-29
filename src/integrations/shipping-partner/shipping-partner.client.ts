export interface CreatePartnerShipmentInput {
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  provinceCode: string;
  districtCode?: string;
  weightGrams: number;
}

export interface PartnerShipmentResult {
  provider: string;
  trackingCode: string;
  labelUrl?: string;
}

export abstract class ShippingPartnerClient {
  abstract createShipment(input: CreatePartnerShipmentInput): Promise<PartnerShipmentResult>;
  abstract cancelShipment(trackingCode: string, reason: string): Promise<void>;
}
