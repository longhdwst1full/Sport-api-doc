import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import {
  CHECKOUT_RESERVATION_TTL,
  SYSTEM_SETTING_KEY,
  SYSTEM_SETTING_STATUS,
  SYSTEM_SETTING_VALUE_TYPE,
} from './system-setting.constants';

@Injectable()
export class SystemSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCheckoutReservationTtlMinutes(): Promise<number> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: {
        key: SYSTEM_SETTING_KEY.CHECKOUT_RESERVATION_TTL_MINUTES,
        status: SYSTEM_SETTING_STATUS.ACTIVE,
      },
      select: { valueJson: true, valueType: true },
    });

    const value = setting?.valueJson;
    if (
      setting?.valueType !== SYSTEM_SETTING_VALUE_TYPE.INTEGER ||
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < CHECKOUT_RESERVATION_TTL.MIN_MINUTES ||
      value > CHECKOUT_RESERVATION_TTL.MAX_MINUTES
    ) {
      throw new ServiceUnavailableException(
        `System setting ${SYSTEM_SETTING_KEY.CHECKOUT_RESERVATION_TTL_MINUTES} is missing or invalid`,
      );
    }

    return value;
  }
}
