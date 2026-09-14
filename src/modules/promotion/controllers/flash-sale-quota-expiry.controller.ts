import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
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
  ) {}

  @Get('expire-quota')
  run(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<FlashSaleQuotaExpiryRunResult> {
    const enabled = this.config.get<boolean>('app.jobs.flashSaleQuotaExpiry.enabled') ?? false;
    // Job tắt thì trả no-op mà không chạm database và không đòi secret.
    if (!enabled) return this.expiry.run();
    const secret = this.config.getOrThrow<string>('app.jobs.cronSecret');
    if (!authorization || !secretsMatch(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException('Valid cron authorization is required');
    }
    return this.expiry.run();
  }
}
