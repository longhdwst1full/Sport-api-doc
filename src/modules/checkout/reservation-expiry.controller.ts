import { Controller, Get, Headers, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

import {
  ReservationExpiryRunResult,
  ReservationExpiryService,
} from './reservation-expiry.service';

function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : (request.header('x-request-id') ?? `reservation-expiry-${Date.now()}`);
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Entrypoint nội bộ cho Supabase Cron/pg_net, không phải Storefront/Admin API.
 * Route dùng Bearer secret và so sánh constant-time; không đưa endpoint này vào OpenAPI public.
 * GET được giữ theo khả năng gọi của scheduler hiện tại, vì vậy tuyệt đối không expose qua UI/menu.
 */
@ApiExcludeController()
@Controller('internal/jobs/reservations')
export class ReservationExpiryController {
  constructor(
    private readonly config: ConfigService,
    private readonly expiry: ReservationExpiryService,
  ) {}

  /** Khi job bị tắt, trả kết quả no-op mà không truy cập database. */
  @Get('expire')
  run(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
  ): Promise<ReservationExpiryRunResult> {
    const enabled = this.config.get<boolean>('app.jobs.reservationExpiry.enabled') ?? false;
    if (!enabled) return this.expiry.run(requestId(request));
    const secret = this.config.getOrThrow<string>('app.jobs.cronSecret');
    if (!authorization || !secretsMatch(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException('Valid cron authorization is required');
    }
    return this.expiry.run(requestId(request));
  }
}
