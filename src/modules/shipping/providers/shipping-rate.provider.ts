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
  /** Khối lượng THẬT của hàng. Hãng tự quyết định tính theo số này hay theo thể tích. */
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  declaredValue: number;
  codAmount: number;
  /**
   * Trọng lượng tính cước đã quy đổi: `max(khối lượng thật, quy đổi thể tích)`.
   *
   * Chỉ dùng cho biểu phí dự phòng NỘI BỘ khi hãng không trả lời được. Không gửi số này lên hãng —
   * gửi kèm kích thước thì hãng sẽ quy đổi thể tích lần thứ hai.
   */
  chargeableWeightGrams?: number;
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
