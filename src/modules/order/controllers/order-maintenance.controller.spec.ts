import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentExpiryService } from '../../payment/services/payment-expiry.service';
import { OrderMaintenanceController } from './order-maintenance.controller';
import { OrderCompletionService } from '../services/order-completion.service';

describe('OrderMaintenanceController', () => {
  const paymentRun = jest.fn().mockResolvedValue({ enabled: true, claimed: 0, expired: 0 });
  const completionRun = jest.fn().mockResolvedValue({ enabled: true, claimed: 0, completed: 0 });
  const secret = 's'.repeat(40);
  const config = {
    get: jest.fn().mockReturnValue(true),
    getOrThrow: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;
  const controller = new OrderMaintenanceController(
    config,
    { run: paymentRun } as unknown as PaymentExpiryService,
    { run: completionRun } as unknown as OrderCompletionService,
  );
  const request = { id: 'request-maintenance-1' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid bearer secret before running a worker', async () => {
    await expect(controller.run('Bearer invalid', request)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentRun).not.toHaveBeenCalled();
  });

  it('runs both workers with separate correlated request ids', async () => {
    await expect(controller.run(`Bearer ${secret}`, request)).resolves.toHaveProperty('orderCompletion');
    expect(paymentRun).toHaveBeenCalledWith('request-maintenance-1:payment-expiry');
    expect(completionRun).toHaveBeenCalledWith('request-maintenance-1:order-completion');
  });
});
