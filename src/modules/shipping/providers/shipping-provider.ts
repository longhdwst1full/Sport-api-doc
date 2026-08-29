export interface ShippingRequest {
  orderId: string;
  reason?: string;
}

export interface ShippingResult {
  provider: string;
  trackingCode: string;
  labelUrl?: string;
}

export abstract class ShippingProvider {
  abstract createShipment(request: ShippingRequest): Promise<ShippingResult>;
}
