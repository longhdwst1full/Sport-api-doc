import { ConfigService } from '@nestjs/config';
import { GhnRateProvider } from './ghn-rate.provider';
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
});
