import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShippingAreaDto } from './shipping-area.dto';

interface GhnProvince {
  ProvinceID?: number;
  ProvinceName?: string;
}

interface GhnDistrict {
  DistrictID?: number;
  DistrictName?: string;
}

interface GhnWard {
  WardCode?: string;
  WardName?: string;
}

interface GhnEnvelope<TData> {
  code?: number;
  message?: string;
  data?: TData;
}

/** Địa giới hành chính đổi rất chậm; cache một giờ là đủ để không đốt quota GHN. */
const AREA_CACHE_TTL_MS = 60 * 60 * 1_000;

interface CacheEntry {
  value: ShippingAreaDto[];
  expiresAt: number;
}

/**
 * Proxy danh mục địa giới của hãng vận chuyển.
 *
 * SECURITY: token GHN là bí mật của backend. Frontend không được cầm token để gọi thẳng GHN, nên
 * mọi tra cứu đi qua đây; đổi lại backend phải cache để một token không bị gọi dồn.
 */
@Injectable()
export class ShippingAreaService {
  private readonly logger = new Logger(ShippingAreaService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  async listProvinces(): Promise<ShippingAreaDto[]> {
    return this.cached('provinces', async () => {
      const data = await this.call<GhnProvince[]>('/master-data/province');
      return data
        .filter((item) => typeof item.ProvinceID === 'number' && item.ProvinceName)
        .map((item) => ({ code: String(item.ProvinceID), name: item.ProvinceName ?? '' }));
    });
  }

  async listDistricts(provinceCode: string): Promise<ShippingAreaDto[]> {
    return this.cached(`districts:${provinceCode}`, async () => {
      const data = await this.call<GhnDistrict[]>('/master-data/district', {
        province_id: Number(provinceCode),
      });
      return data
        .filter((item) => typeof item.DistrictID === 'number' && item.DistrictName)
        .map((item) => ({ code: String(item.DistrictID), name: item.DistrictName ?? '' }));
    });
  }

  async listWards(districtCode: string): Promise<ShippingAreaDto[]> {
    return this.cached(`wards:${districtCode}`, async () => {
      const data = await this.call<GhnWard[]>('/master-data/ward', {
        district_id: Number(districtCode),
      });
      return data
        .filter((item) => item.WardCode && item.WardName)
        .map((item) => ({ code: item.WardCode ?? '', name: item.WardName ?? '' }));
    });
  }

  private async cached(
    key: string,
    load: () => Promise<ShippingAreaDto[]>,
  ): Promise<ShippingAreaDto[]> {
    const hit = this.cache.get(key);
    const now = Date.now();
    if (hit && hit.expiresAt > now) return hit.value;
    const value = await load();
    this.cache.set(key, { value, expiresAt: now + AREA_CACHE_TTL_MS });
    return value;
  }

  private async call<TData>(path: string, body?: Record<string, number>): Promise<TData> {
    const enabled = this.config.get<boolean>('app.shipping.ghn.enabled') === true;
    const token = this.config.get<string>('app.shipping.ghn.token');
    if (!enabled || !token) {
      throw new ServiceUnavailableException('Shipping area lookup is not configured');
    }
    const baseUrl = this.config.getOrThrow<string>('app.shipping.ghn.baseUrl');
    const timeoutMs = this.config.get<number>('app.shipping.providerTimeoutMs') ?? 5_000;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        // PROVIDER: GHN nhận tham số master-data qua body ngay cả với phương thức GET.
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', Token: token },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.logger.error({
        message: 'GHN master data request failed',
        path,
        error: error instanceof Error ? error.message : 'unknown transport error',
      });
      throw new ServiceUnavailableException('GHN is not reachable');
    }

    const payload = (await response.json().catch(() => ({}))) as GhnEnvelope<TData>;
    if (!response.ok || payload.code !== 200 || !payload.data) {
      this.logger.error({
        message: 'GHN rejected the master data request',
        path,
        status: response.status,
        providerCode: payload.code,
        providerMessage: payload.message,
      });
      throw new ServiceUnavailableException('GHN rejected the shipping area lookup');
    }
    return payload.data;
  }
}
