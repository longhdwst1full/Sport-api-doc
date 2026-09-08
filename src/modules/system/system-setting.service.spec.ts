import { ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { SystemSettingService } from './system-setting.service';

describe('SystemSettingService', () => {
  const findFirst = jest.fn();
  const service = new SystemSettingService({
    systemSetting: { findFirst },
  } as unknown as PrismaService);

  beforeEach(() => findFirst.mockReset());

  it('returns the active integer reservation TTL', async () => {
    findFirst.mockResolvedValue({ valueJson: 30, valueType: 'INTEGER' });

    await expect(service.getCheckoutReservationTtlMinutes()).resolves.toBe(30);
  });

  it.each([
    null,
    { valueJson: '30', valueType: 'INTEGER' },
    { valueJson: 1, valueType: 'INTEGER' },
    { valueJson: 30.5, valueType: 'INTEGER' },
    { valueJson: 30, valueType: 'STRING' },
  ])('fails closed when the setting is missing or invalid: %p', async (setting) => {
    findFirst.mockResolvedValue(setting);

    await expect(service.getCheckoutReservationTtlMinutes()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
