import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalShippingRateQuote, ShippingRateProvider, ShippingRateQuoteInput } from './shipping-rate.provider';

interface GhnFeeResponse {
  code?: number;
  data?: { total?: number; service_fee?: number };
  message?: string;
}

@Injectable()
export class GhnRateProvider extends ShippingRateProvider {
  readonly code = 'GHN' as const;

  constructor(private readonly config: ConfigService) {
    super();
  }

  isEnabled(): boolean {
    return this.config.get<boolean>('app.shipping.ghn.enabled') === true;
  }

  canQuote(input: ShippingRateQuoteInput): boolean {
    return Boolean(
      input.pickup.districtCode && /^\d+$/.test(input.pickup.districtCode) && input.pickup.wardCode &&
      input.recipient.districtCode && /^\d+$/.test(input.recipient.districtCode) && input.recipient.wardCode,
    );
  }

  async quote(input: ShippingRateQuoteInput): Promise<ExternalShippingRateQuote> {
    if (!this.isEnabled() || !this.canQuote(input)) {
      throw new ServiceUnavailableException('GHN quote is not configured for this address');
    }
    const response = await fetch(this.config.getOrThrow<string>('app.shipping.ghn.apiUrl'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Token: this.token,
        ShopId: this.config.getOrThrow<string>('app.shipping.ghn.shopId'),
      },
      body: JSON.stringify({
        service_type_id: 2,
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

  private get token(): string {
    return this.config.getOrThrow<string>('app.shipping.ghn.token');
  }
}
