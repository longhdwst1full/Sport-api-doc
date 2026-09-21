import { ConfigService } from '@nestjs/config';
import type { IntegrationConfigService } from '../../system/parameters/integration-config.service';
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

  function buildProvider(enabled = true): GhnRateProvider {
    const integrations = {
      ghn: jest.fn().mockResolvedValue({
        enabled,
        token: 'ghn-token',
        baseUrl: 'https://dev-online-gateway.ghn.vn/shiip/public-api',
        shopId: '1',
        serviceTypeId: 2,
        webhookSecret: '',
        webhookActorUserId: '',
      }),
    } as unknown as IntegrationConfigService;
    return new GhnRateProvider(
      { get: jest.fn().mockReturnValue(true), getOrThrow: jest.fn().mockReturnValue('https://fee') } as unknown as ConfigService,
      integrations,
    );
  }

  it('fails GHN capability closed when a district code is not numeric', () => {
    expect(buildProvider().canQuote({
      ...input,
      recipient: { ...input.recipient, districtCode: 'Q3' },
    })).toBe(false);
  });

  /**
   * Hồi quy: bật/tắt GHN nằm ở bảng tham số hệ thống. Đọc từ biến môi trường làm bản deploy đã khai
   * tham số trong màn Admin vẫn coi hãng đang tắt và rơi về bảng phí nội bộ.
   */
  it('đọc trạng thái bật/tắt từ tham số hệ thống', async () => {
    await expect(buildProvider(true).isEnabled()).resolves.toBe(true);
    await expect(buildProvider(false).isEnabled()).resolves.toBe(false);
  });
});
