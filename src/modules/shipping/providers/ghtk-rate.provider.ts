import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalShippingRateQuote, ShippingRateProvider, ShippingRateQuoteInput } from './shipping-rate.provider';

interface GhtkFeeResponse {
  success?: boolean;
  message?: string;
  fee?: { fee?: number; delivery?: boolean };
}

@Injectable()
export class GhtkRateProvider extends ShippingRateProvider {
  readonly code = 'GHTK' as const;

  constructor(private readonly config: ConfigService) {
    super();
  }

  isEnabled(): boolean {
    return this.config.get<boolean>('app.shipping.ghtk.enabled') === true;
  }

  canQuote(input: ShippingRateQuoteInput): boolean {
    return Boolean(
      input.pickup.province && input.pickup.district &&
      input.recipient.province && input.recipient.district,
    );
  }

  async quote(input: ShippingRateQuoteInput): Promise<ExternalShippingRateQuote> {
    if (!this.isEnabled() || !this.canQuote(input)) {
      throw new ServiceUnavailableException('GHTK quote is not configured for this address');
    }
    const query = new URLSearchParams({
      pick_province: input.pickup.province,
      pick_district: input.pickup.district,
      province: input.recipient.province,
      district: input.recipient.district,
      address: input.recipient.addressLine,
      weight: String(input.package.weightGrams),
      value: String(input.package.declaredValue),
      transport: 'road',
      deliver_option: 'none',
    });
    if (input.pickup.ward) query.set('pick_ward', input.pickup.ward);
    if (input.recipient.ward) query.set('ward', input.recipient.ward);
    if (input.package.codAmount > 0) query.set('pick_money', String(input.package.codAmount));
    const response = await fetch(
      `${this.config.getOrThrow<string>('app.shipping.ghtk.apiUrl')}?${query.toString()}`,
      {
        headers: { Token: this.config.getOrThrow<string>('app.shipping.ghtk.token') },
        signal: AbortSignal.timeout(this.config.getOrThrow<number>('app.shipping.providerTimeoutMs')),
      },
    );
    const payload = await response.json() as GhtkFeeResponse;
    const fee = payload.fee?.fee;
    if (!response.ok || payload.success !== true || !Number.isSafeInteger(fee) || Number(fee) < 0) {
      throw new ServiceUnavailableException(`GHTK quote failed: ${payload.message ?? response.status}`);
    }
    return { provider: this.code, fee: Number(fee), etaMinDays: 1, etaMaxDays: 6 };
  }
}
