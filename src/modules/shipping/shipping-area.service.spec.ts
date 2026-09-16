import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ShippingAreaService } from './shipping-area.service';

function buildConfig(enabled = true, token = 'ghn-token'): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'app.shipping.ghn.enabled') return enabled;
      if (key === 'app.shipping.ghn.token') return token;
      if (key === 'app.shipping.providerTimeoutMs') return 5_000;
      return undefined;
    }),
    getOrThrow: jest.fn(() => 'https://dev-online-gateway.ghn.vn/shiip/public-api'),
  } as unknown as ConfigService;
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

    await expect(new ShippingAreaService(buildConfig()).listProvinces()).resolves.toEqual([
      { code: '201', name: 'Hà Nội' },
    ]);
  });

  it('sends province_id in the body when listing districts', async () => {
    const fetchMock = mockFetch({ code: 200, data: [{ DistrictID: 1442, DistrictName: 'Ba Đình' }] });

    await new ShippingAreaService(buildConfig()).listDistricts('201');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/master-data/district');
    expect(JSON.parse(init.body as string)).toEqual({ province_id: 201 });
  });

  it('returns ward codes as strings because GHN ward codes are not numeric ids', async () => {
    mockFetch({ code: 200, data: [{ WardCode: '21012', WardName: 'Phúc Xá' }] });

    await expect(new ShippingAreaService(buildConfig()).listWards('1442')).resolves.toEqual([
      { code: '21012', name: 'Phúc Xá' },
    ]);
  });

  it('calls GHN once and serves the cache afterwards', async () => {
    const fetchMock = mockFetch({ code: 200, data: [{ ProvinceID: 201, ProvinceName: 'Hà Nội' }] });
    const service = new ShippingAreaService(buildConfig());

    await service.listProvinces();
    await service.listProvinces();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches each district separately instead of sharing one entry', async () => {
    const fetchMock = mockFetch({ code: 200, data: [{ WardCode: '21012', WardName: 'Phúc Xá' }] });
    const service = new ShippingAreaService(buildConfig());

    await service.listWards('1442');
    await service.listWards('1443');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports 503 when the integration is not configured', async () => {
    const fetchMock = mockFetch({ code: 200, data: [] });

    await expect(new ShippingAreaService(buildConfig(false)).listProvinces()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports 503 when GHN rejects the lookup', async () => {
    mockFetch({ code: 400, message: 'invalid token' }, false, 400);

    await expect(new ShippingAreaService(buildConfig()).listProvinces()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
