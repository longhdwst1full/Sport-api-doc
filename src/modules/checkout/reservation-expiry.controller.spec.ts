import { UnauthorizedException } from '@nestjs/common';
import type { SystemParameterService } from '../system/parameters/system-parameter.service';
import { ConfigService } from '@nestjs/config';

import { ReservationExpiryController } from './reservation-expiry.controller';
import { ReservationExpiryService } from './reservation-expiry.service';

const parameters = {
  getBoolean: jest.fn().mockResolvedValue(true),
} as unknown as SystemParameterService;


describe('ReservationExpiryController', () => {
  const run = jest.fn().mockResolvedValue({
    enabled: true,
    claimed: 0,
    expired: 0,
    hasMore: false,
    completedAt: '2026-09-08T00:00:00.000Z',
  });
  const config = {
    get: jest.fn().mockReturnValue(true),
    getOrThrow: jest.fn().mockReturnValue('a'.repeat(32)),
  } as unknown as ConfigService;
  const controller = new ReservationExpiryController(
    config,
    { run } as unknown as ReservationExpiryService,
    parameters,
  );
  const request = {
    id: 'request-1',
    header: jest.fn(),
  } as never;

  beforeEach(() => jest.clearAllMocks());

  it('rejects a cron request with an invalid bearer secret', async () => {
    // Controller đọc cờ bật/tắt từ bảng tham số nên đã thành async: lỗi nay là promise rejection.
    await expect(controller.run('Bearer invalid', request)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('runs the expiry batch for the configured bearer secret', async () => {
    await expect(controller.run(`Bearer ${'a'.repeat(32)}`, request)).resolves.toMatchObject({
      enabled: true,
    });
    expect(run).toHaveBeenCalledWith('request-1');
  });
});
