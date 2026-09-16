export interface PartnerShipmentItem {
  name: string;
  quantity: number;
  weightGrams?: number;
}

/** Điểm lấy hàng: chi nhánh xuất đơn, không phải cấu hình toàn hệ thống. */
export interface PartnerPickupPoint {
  /** Mã quận/huyện của hãng vận chuyển, lấy từ địa chỉ chi nhánh. */
  districtCode: string;
  /** Mã phường/xã của hãng vận chuyển, lấy từ địa chỉ chi nhánh. */
  wardCode: string;
}

export interface CreatePartnerShipmentInput {
  orderId: string;
  pickup: PartnerPickupPoint;
  /** Mã đơn hiển thị cho khách; đối tác dùng làm client order code để tra cứu hai chiều. */
  orderNo?: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  provinceCode: string;
  districtCode?: string;
  wardCode?: string;
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  /** Số tiền thu hộ, đơn vị VND. 0 hoặc bỏ trống nghĩa là đơn đã thanh toán trước. */
  codAmount?: number;
  /** Giá trị khai giá để tính bảo hiểm, đơn vị VND. */
  declaredValue?: number;
  note?: string;
  items?: PartnerShipmentItem[];
}

export interface PartnerShipmentResult {
  provider: string;
  trackingCode: string;
  labelUrl?: string;
  /** Cước đối tác báo lúc tạo vận đơn, đơn vị VND. */
  fee?: number;
  expectedDeliveryAt?: string;
}

/**
 * PROVIDER: Cổng tạo vận đơn với hãng giao hàng. Module nghiệp vụ chỉ biết lớp trừu tượng này;
 * mọi đặc thù của từng hãng nằm trong adapter tương ứng.
 */
export abstract class ShippingPartnerClient {
  /** Cho nghiệp vụ biết có nên gọi đối tác hay không, thay vì phải dò kiểu adapter. */
  abstract isEnabled(): boolean;
  abstract createShipment(input: CreatePartnerShipmentInput): Promise<PartnerShipmentResult>;
  abstract cancelShipment(trackingCode: string, reason: string): Promise<void>;
  /** Trả URL in phiếu giao cho một hoặc nhiều vận đơn. */
  abstract createLabelUrl(trackingCodes: string[]): Promise<string>;
}
