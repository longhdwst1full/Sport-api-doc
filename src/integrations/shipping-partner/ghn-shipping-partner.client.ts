import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  CreatePartnerShipmentInput,
  PartnerShipmentResult,
  ShippingPartnerClient,
} from './shipping-partner.client';

export interface GhnShippingPartnerOptions {
  baseUrl: string;
  token: string;
  shopId: string;
  serviceTypeId: number;
  timeoutMs: number;
}

interface GhnEnvelope<TData> {
  code?: number;
  message?: string;
  data?: TData;
}

interface GhnCreateOrderData {
  order_code?: string;
  total_fee?: number;
  expected_delivery_time?: string;
}

interface GhnPrintTokenData {
  token?: string;
}

/** GHN quy ước 2200000 là giá trị khai giá tối đa được bảo hiểm. */
const GHN_MAX_INSURANCE_VALUE = 2_200_000;
/** Kích thước tối thiểu GHN chấp nhận, dùng khi kiện hàng chưa đo. */
const GHN_MIN_DIMENSION_CM = 1;

@Injectable()
export class GhnShippingPartnerClient extends ShippingPartnerClient {
  private readonly logger = new Logger(GhnShippingPartnerClient.name);

  constructor(private readonly options: GhnShippingPartnerOptions) {
    super();
  }

  isEnabled(): boolean {
    return true;
  }

  async createShipment(input: CreatePartnerShipmentInput): Promise<PartnerShipmentResult> {
    if (!/^\d+$/.test(input.pickup.districtCode) || !input.pickup.wardCode) {
      // Chi nhánh chưa được gán mã địa giới GHN. Đây là dữ liệu vận hành, không phải lỗi kỹ thuật.
      throw new ServiceUnavailableException('Branch is missing GHN district and ward codes');
    }
    if (!input.districtCode || !/^\d+$/.test(input.districtCode) || !input.wardCode) {
      // PROVIDER: GHN định tuyến bằng mã quận/phường của chính họ, không nhận địa chỉ chữ.
      // Thiếu mã thì phải dừng ở đây thay vì gửi lên rồi nhận lỗi khó đọc.
      throw new ServiceUnavailableException('GHN shipment requires recipient district and ward codes');
    }

    const codAmount = Math.max(0, Math.trunc(input.codAmount ?? 0));
    const data = await this.call<GhnCreateOrderData>('/v2/shipping-order/create', {
      payment_type_id: codAmount > 0 ? 2 : 1,
      required_note: 'KHONGCHOXEMHANG',
      client_order_code: input.orderNo ?? input.orderId,
      to_name: input.recipientName,
      to_phone: input.recipientPhone,
      to_address: input.addressLine,
      to_ward_code: input.wardCode,
      to_district_id: Number(input.districtCode),
      from_district_id: Number(input.pickup.districtCode),
      from_ward_code: input.pickup.wardCode,
      cod_amount: codAmount,
      insurance_value: Math.min(
        GHN_MAX_INSURANCE_VALUE,
        Math.max(0, Math.trunc(input.declaredValue ?? 0)),
      ),
      weight: Math.max(1, Math.trunc(input.weightGrams)),
      length: Math.max(GHN_MIN_DIMENSION_CM, Math.trunc(input.lengthCm ?? GHN_MIN_DIMENSION_CM)),
      width: Math.max(GHN_MIN_DIMENSION_CM, Math.trunc(input.widthCm ?? GHN_MIN_DIMENSION_CM)),
      height: Math.max(GHN_MIN_DIMENSION_CM, Math.trunc(input.heightCm ?? GHN_MIN_DIMENSION_CM)),
      service_type_id: this.options.serviceTypeId,
      ...(input.note ? { note: input.note } : {}),
      ...(input.items?.length
        ? {
            items: input.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              weight: Math.max(1, Math.trunc(item.weightGrams ?? 1)),
            })),
          }
        : {}),
    });

    if (!data.order_code) {
      throw new ServiceUnavailableException('GHN did not return a tracking code');
    }

    return {
      provider: 'GHN',
      trackingCode: data.order_code,
      ...(Number.isSafeInteger(data.total_fee) ? { fee: Number(data.total_fee) } : {}),
      ...(data.expected_delivery_time ? { expectedDeliveryAt: data.expected_delivery_time } : {}),
    };
  }

  async cancelShipment(trackingCode: string, reason: string): Promise<void> {
    // PROVIDER: GHN không nhận lý do huỷ qua API; ghi lại ở log để đối chiếu với audit nội bộ.
    this.logger.log({ message: 'Cancelling GHN shipment', trackingCode, reason });
    await this.call('/v2/switch-status/cancel', { order_codes: [trackingCode] });
  }

  async createLabelUrl(trackingCodes: string[]): Promise<string> {
    if (trackingCodes.length === 0) {
      throw new ServiceUnavailableException('GHN label requires at least one tracking code');
    }
    const data = await this.call<GhnPrintTokenData>('/v2/a5/gen-token', {
      order_codes: trackingCodes,
    });
    if (!data.token) {
      throw new ServiceUnavailableException('GHN did not return a print token');
    }
    // PROVIDER: token in chỉ sống vài phút, nên trả URL cho client mở ngay thay vì lưu lại.
    return `${this.options.baseUrl.replace(/\/shiip\/public-api$/, '')}/a5/public-api/printA5?token=${data.token}`;
  }

  private async call<TData = unknown>(path: string, body: unknown): Promise<TData> {
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Token: this.options.token,
          ShopId: this.options.shopId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      // PROVIDER: timeout hoặc mất mạng. Không log body vì chứa tên, số điện thoại và địa chỉ khách.
      this.logger.error({
        message: 'GHN request failed',
        path,
        error: error instanceof Error ? error.message : 'unknown transport error',
      });
      throw new ServiceUnavailableException('GHN is not reachable');
    }

    const payload = (await response.json().catch(() => ({}))) as GhnEnvelope<TData>;
    if (!response.ok || payload.code !== 200 || !payload.data) {
      this.logger.error({
        message: 'GHN rejected the request',
        path,
        status: response.status,
        providerCode: payload.code,
        providerMessage: payload.message,
      });
      throw new ServiceUnavailableException(`GHN request rejected: ${payload.message ?? response.status}`);
    }
    return payload.data;
  }
}
