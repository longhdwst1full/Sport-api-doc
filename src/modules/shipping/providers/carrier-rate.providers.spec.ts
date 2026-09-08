import { ConfigService } from '@nestjs/config';
import { GhnRateProvider } from './ghn-rate.provider';
import { GhtkRateProvider } from './ghtk-rate.provider';
import { ShippingRateQuoteInput } from './shipping-rate.provider';

const input: ShippingRateQuoteInput = {
  pickup: {
    addressLine: '1 Nguyễn Trãi',
    ward: 'Phường 1',
    district: 'Quận 1',
    province: 'TP. Hồ Chí Minh',
    districtCode: '1454',
    wardCode: '21211',
  },
  recipient: {
    addressLine: '2 Lê Lợi',
    ward: 'Phường 2',
    district: 'Quận 3',
    province: 'TP. Hồ Chí Minh',
    districtCode: '1452',
    wardCode: '21012',
  },
  package: {
    weightGrams: 2500,
    declaredValue: 1_500_000,
    codAmount: 1_500_000,
  },
};

describe('carrier rate providers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fails GHN capability closed when a district code is not numeric', () => {
    const provider = new GhnRateProvider({ get: jest.fn().mockReturnValue(true) } as unknown as ConfigService);
    expect(provider.canQuote({
      ...input,
      recipient: { ...input.recipient, districtCode: 'Q3' },
    })).toBe(false);
  });

  it('sends the COD collection amount when requesting a GHTK fee', async () => {
    const config = {
      get: jest.fn().mockImplementation((key: string) => key === 'app.shipping.ghtk.enabled'),
      getOrThrow: jest.fn().mockImplementation((key: string) => ({
        'app.shipping.ghtk.apiUrl': 'https://example.test/fee',
        'app.shipping.ghtk.token': 'secret-token',
        'app.shipping.providerTimeoutMs': 5000,
      })[key]),
    } as unknown as ConfigService;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      fee: { fee: 45000, delivery: true },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(new GhtkRateProvider(config).quote(input)).resolves.toMatchObject({
      provider: 'GHTK',
      fee: 45000,
    });
    const requestedUrl = fetchSpy.mock.calls[0][0];
    expect(typeof requestedUrl).toBe('string');
    expect(new URL(requestedUrl as string).searchParams.get('pick_money')).toBe('1500000');
  });
});
