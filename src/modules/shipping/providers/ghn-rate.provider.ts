import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationConfigService } from '../../system/parameters/integration-config.service';
import { ExternalShippingRateQuote, ShippingRateProvider, ShippingRateQuoteInput } from './shipping-rate.provider';

interface GhnFeeResponse {
  code?: number;
  data?: { total?: number; service_fee?: number };
  message?: string;
}

@Injectable()
export class GhnRateProvider extends ShippingRateProvider {
  readonly code = 'GHN' as const;

  constructor(
    private readonly config: ConfigService,
    private readonly integrations: IntegrationConfigService,
  ) {
    super();
  }

  async isEnabled(): Promise<boolean> {
    return (await this.integrations.ghn()).enabled;
  }

  canQuote(input: ShippingRateQuoteInput): boolean {
    return Boolean(
      input.pickup.districtCode && /^\d+$/.test(input.pickup.districtCode) && input.pickup.wardCode &&
      input.recipient.districtCode && /^\d+$/.test(input.recipient.districtCode) && input.recipient.wardCode,
    );
  }

  async quote(input: ShippingRateQuoteInput): Promise<ExternalShippingRateQuote> {
    const ghn = await this.integrations.ghn();
    if (!ghn.enabled || !ghn.token || !this.canQuote(input)) {
      throw new ServiceUnavailableException('GHN quote is not configured for this address');
    }
    // Endpoint tính phí là đường dẫn con của base URL; giữ ở cấu hình ứng dụng vì nó là chi tiết
    // kỹ thuật của provider, không phải giá trị người vận hành cần sửa.
    const feeUrl = this.config.getOrThrow<string>('app.shipping.ghn.apiUrl');
    const response = await fetch(feeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Token: ghn.token,
        ShopId: ghn.shopId,
      },
      body: JSON.stringify({
        service_type_id: ghn.serviceTypeId,
        from_district_id: Number(input.pickup.districtCode),
        from_ward_code: input.pickup.wardCode,
        to_district_id: Number(input.recipient.districtCode),
        to_ward_code: input.recipient.wardCode,
        weight: input.package.weightGrams,
        length: input.package.lengthCm ?? 1,
        width: input.package.widthCm ?? 1,
        height: input.package.heightCm ?? 1,
        insurance_value: input.package.declaredValue,
      }),
      signal: AbortSignal.timeout(this.config.getOrThrow<number>('app.shipping.providerTimeoutMs')),
    });
    const payload = await response.json() as GhnFeeResponse;
    const fee = payload.data?.total ?? payload.data?.service_fee;
    if (!response.ok || !Number.isSafeInteger(fee) || Number(fee) < 0) {
      throw new ServiceUnavailableException(`GHN quote failed: ${payload.message ?? response.status}`);
    }
    return { provider: this.code, fee: Number(fee), etaMinDays: 1, etaMaxDays: 5 };
  }
}
