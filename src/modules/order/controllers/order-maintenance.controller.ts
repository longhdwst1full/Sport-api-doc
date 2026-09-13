import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentExpiryService, PaymentExpiryRunResult } from '../../payment/services/payment-expiry.service';
import { OrderCompletionRunResult, OrderCompletionService } from '../services/order-completion.service';

interface OrderMaintenanceResult {
  paymentExpiry: PaymentExpiryRunResult;
  orderCompletion: OrderCompletionRunResult;
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

@ApiExcludeController()
@Controller('internal/jobs/orders')
export class OrderMaintenanceController {
  constructor(
    private readonly config: ConfigService,
    private readonly paymentExpiry: PaymentExpiryService,
    private readonly orderCompletion: OrderCompletionService,
  ) {}

  @Get('maintenance')
  async run(@Headers('authorization') authorization: string | undefined, @Req() request: Request): Promise<OrderMaintenanceResult> {
    const enabled = (this.config.get<boolean>('app.jobs.paymentExpiry.enabled') ?? false)
      || (this.config.get<boolean>('app.jobs.orderCompletion.enabled') ?? false);
    if (enabled) {
      const secret = this.config.getOrThrow<string>('app.jobs.cronSecret');
      if (!authorization || !secretsMatch(authorization, `Bearer ${secret}`)) {
        throw new UnauthorizedException('Cần thông tin xác thực cron hợp lệ');
      }
    }
    const requestId = typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : `order-maintenance-${Date.now()}`;
    return {
      paymentExpiry: await this.paymentExpiry.run(`${requestId}:payment-expiry`),
      orderCompletion: await this.orderCompletion.run(`${requestId}:order-completion`),
    };
  }
}
