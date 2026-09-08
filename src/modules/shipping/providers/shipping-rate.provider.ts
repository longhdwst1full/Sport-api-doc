export interface ShippingAddressInput {
  addressLine: string;
  ward?: string;
  district: string;
  province: string;
  provinceCode?: string;
  districtCode?: string;
  wardCode?: string;
}

export interface ShippingPackageInput {
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  declaredValue: number;
  codAmount: number;
}

export interface ShippingRateQuoteInput {
  pickup: ShippingAddressInput;
  recipient: ShippingAddressInput;
  package: ShippingPackageInput;
}

export interface ExternalShippingRateQuote {
  provider: 'GHN' | 'GHTK';
  fee: number;
  etaMinDays: number;
  etaMaxDays: number;
  reference?: string;
}

export abstract class ShippingRateProvider {
  abstract readonly code: ExternalShippingRateQuote['provider'];
  abstract isEnabled(): boolean;
  abstract canQuote(input: ShippingRateQuoteInput): boolean;
  abstract quote(input: ShippingRateQuoteInput): Promise<ExternalShippingRateQuote>;
}
