import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { JOB_NAME } from '../../system/job-health/job-health.constants';
import { JobHealthService } from '../../system/job-health/job-health.service';
import {
  FlashSaleQuotaExpiryRunResult,
  FlashSaleQuotaExpiryService,
} from '../services/flash-sale-quota-expiry.service';

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

/**
 * Entrypoint nội bộ cho Supabase Cron, không phải Storefront/Admin API.
 * Bearer secret so sánh constant-time; không đưa vào OpenAPI public.
 */
@ApiExcludeController()
@Controller('internal/jobs/flash-sales')
export class FlashSaleQuotaExpiryController {
  constructor(
    private readonly config: ConfigService,
    private readonly expiry: FlashSaleQuotaExpiryService,
    private readonly jobHealth: JobHealthService,
  ) {}

  @Get('expire-quota')
  async run(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<FlashSaleQuotaExpiryRunResult> {
    // Cờ bật/tắt nằm ở `system_parameters` (fallback env), nên vận hành dừng worker ngay được.
    const enabled = await this.expiry.isEnabled();
    // Job tắt thì trả no-op mà không đụng bảng quota và không đòi secret.
    if (!enabled) return this.expiry.run();
    // SECURITY: cờ bật nằm ở database nên `CRON_SECRET` có thể chưa được khai khi ai đó bật tham
    // số. Thiếu secret phải là TỪ CHỐI, không phải 500 — 500 là lỗi máy chủ và dễ bị bỏ qua khi
    // đọc log, còn 401 nói đúng rằng endpoint đang đóng.
    const secret = this.config.get<string>('app.jobs.cronSecret');
    if (!secret || !authorization || !secretsMatch(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException('Valid cron authorization is required');
    }
    return this.jobHealth.track(JOB_NAME.FLASH_SALE_QUOTA_EXPIRY, `flash-sale-quota-expiry-${randomUUID()}`, () => this.expiry.run());
  }
}
