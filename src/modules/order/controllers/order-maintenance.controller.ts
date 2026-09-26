import { timingSafeEqual } from 'node:crypto';
import { SYSTEM_PARAMETER_CODE } from '../../system/parameters/system-parameter.catalog';
import { SystemParameterService } from '../../system/parameters/system-parameter.service';
import { JOB_NAME } from '../../system/job-health/job-health.constants';
import { JobHealthService } from '../../system/job-health/job-health.service';
import { Controller, Get, Headers, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentExpiryService, PaymentExpiryRunResult } from '../../payment/services/payment-expiry.service';
import { OrderCompletionRunResult, OrderCompletionService } from '../services/order-completion.service';
import { CarrierShipmentRunResult, CarrierShipmentService } from '../../fulfillment/services/carrier-shipment.service';

interface OrderMaintenanceResult {
  paymentExpiry: PaymentExpiryRunResult;
  orderCompletion: OrderCompletionRunResult;
  carrierShipment: CarrierShipmentRunResult;
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
    private readonly carrierShipments: CarrierShipmentService,
    private readonly parameters: SystemParameterService,
    private readonly jobHealth: JobHealthService,
  ) {}

  @Get('maintenance')
  async run(@Headers('authorization') authorization: string | undefined, @Req() request: Request): Promise<OrderMaintenanceResult> {
    // Cờ bật/tắt đọc từ bảng tham số như chính hai worker bên dưới; đọc từ nguồn khác thì
    // controller và worker có thể nói hai điều khác nhau về cùng một job.
    const [paymentExpiryEnabled, orderCompletionEnabled, carrierShipmentEnabled] = await Promise.all([
      this.parameters.getBoolean(SYSTEM_PARAMETER_CODE.PAYMENT_EXPIRY_JOB_ENABLED),
      this.parameters.getBoolean(SYSTEM_PARAMETER_CODE.ORDER_COMPLETION_JOB_ENABLED),
      this.carrierShipments.isEnabled(),
    ]);
    const enabled = paymentExpiryEnabled || orderCompletionEnabled || carrierShipmentEnabled;
    if (enabled) {
      const secret = this.config.getOrThrow<string>('app.jobs.cronSecret');
      if (!authorization || !secretsMatch(authorization, `Bearer ${secret}`)) {
        throw new UnauthorizedException('Cần thông tin xác thực cron hợp lệ');
      }
    }
    const requestId = typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : `order-maintenance-${Date.now()}`;
    const work = async (): Promise<OrderMaintenanceResult> => ({
      paymentExpiry: await this.paymentExpiry.run(`${requestId}:payment-expiry`),
      orderCompletion: await this.orderCompletion.run(`${requestId}:order-completion`),
      // SECURITY: worker gọi hãng chỉ chạy khi cờ của chính nó bật — nhánh đó luôn đi qua kiểm secret ở trên.
      carrierShipment: carrierShipmentEnabled
        ? await this.carrierShipments.run()
        : { enabled: false, claimed: 0, created: 0, retried: 0, failed: 0, completedAt: new Date().toISOString() },
    });
    // SECURITY: chỉ ghi heartbeat khi request đã qua kiểm secret (job bật); job tắt là no-op không ghi.
    return enabled ? this.jobHealth.track(JOB_NAME.ORDER_MAINTENANCE, requestId, work) : work();
  }
}
