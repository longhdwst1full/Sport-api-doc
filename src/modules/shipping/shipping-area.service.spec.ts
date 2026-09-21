import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { IntegrationConfigService } from '../system/parameters/integration-config.service';
import { ShippingAreaService } from './shipping-area.service';

function buildConfig(): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'app.shipping.providerTimeoutMs' ? 5_000 : undefined)),
  } as unknown as ConfigService;
}

/**
 * Cấu hình GHN đến từ bảng tham số hệ thống, không phải biến môi trường. Trước đây service này
 * đọc thẳng `ConfigService`, nên bản deploy khai tham số trong màn Admin vẫn trả 503
 * "chưa được cấu hình".
 */
function buildIntegrations(enabled = true, token = 'ghn-token'): IntegrationConfigService {
  return {
    ghn: jest.fn().mockResolvedValue({
      enabled,
      token,
      baseUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
      shopId: '1',
      serviceTypeId: 2,
      webhookSecret: '',
      webhookActorUserId: '',
    }),
  } as unknown as IntegrationConfigService;
}

function buildService(enabled = true, token = 'ghn-token'): ShippingAreaService {
  return new ShippingAreaService(buildConfig(), buildIntegrations(enabled, token));
}

function mockFetch(payload: unknown, ok = true, status = 200): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(payload) });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('ShippingAreaService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps GHN provinces to the neutral code/name contract', async () => {
    mockFetch({ code: 200, data: [{ ProvinceID: 201, ProvinceName: 'Hà Nội' }] });

    await expect(buildService().listProvinces()).resolves.toEqual([
      { code: '201', name: 'Hà Nội' },
    ]);
  });

  it('sends province_id in the body when listing districts', async () => {
    const fetchMock = mockFetch({ code: 200, data: [{ DistrictID: 1442, DistrictName: 'Ba Đình' }] });

    await buildService().listDistricts('201');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/master-data/district');
    expect(JSON.parse(init.body as string)).toEqual({ province_id: 201 });
  });

  it('returns ward codes as strings because GHN ward codes are not numeric ids', async () => {
    mockFetch({ code: 200, data: [{ WardCode: '21012', WardName: 'Phúc Xá' }] });

    await expect(buildService().listWards('1442')).resolves.toEqual([
      { code: '21012', name: 'Phúc Xá' },
    ]);
  });

  it('calls GHN once and serves the cache afterwards', async () => {
    const fetchMock = mockFetch({ code: 200, data: [{ ProvinceID: 201, ProvinceName: 'Hà Nội' }] });
    const service = buildService();

    await service.listProvinces();
    await service.listProvinces();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches each district separately instead of sharing one entry', async () => {
    const fetchMock = mockFetch({ code: 200, data: [{ WardCode: '21012', WardName: 'Phúc Xá' }] });
    const service = buildService();

    await service.listWards('1442');
    await service.listWards('1443');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports 503 when the integration is not configured', async () => {
    const fetchMock = mockFetch({ code: 200, data: [] });

    await expect(buildService(false).listProvinces()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports 503 when GHN rejects the lookup', async () => {
    mockFetch({ code: 400, message: 'invalid token' }, false, 400);

    await expect(buildService().listProvinces()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
