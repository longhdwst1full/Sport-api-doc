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
  provider: 'GHN';
  fee: number;
  etaMinDays: number;
  etaMaxDays: number;
  reference?: string;
}

export abstract class ShippingRateProvider {
  abstract readonly code: ExternalShippingRateQuote['provider'];
  /**
   * Bật/tắt đọc từ bảng tham số hệ thống nên là thao tác bất đồng bộ; trước đây nó đọc biến môi
   * trường, khiến bản deploy khai tham số trong màn Admin vẫn coi như hãng đang tắt.
   */
  abstract isEnabled(): Promise<boolean>;
  abstract canQuote(input: ShippingRateQuoteInput): boolean;
  abstract quote(input: ShippingRateQuoteInput): Promise<ExternalShippingRateQuote>;
}
