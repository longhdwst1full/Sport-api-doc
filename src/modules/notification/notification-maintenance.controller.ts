import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { OutboxDispatcherService, type OutboxRunResult } from './outbox-dispatcher.service';

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

/**
 * Endpoint nội bộ cho cron chạy worker outbox.
 *
 * Không nằm trong OpenAPI: đây không phải API cho frontend, và đưa vào contract là mời người ta gọi.
 * Bảo vệ bằng cùng một secret với các job khác, so sánh constant-time.
 */
@ApiExcludeController()
@Controller('internal/jobs/notifications')
export class NotificationMaintenanceController {
  constructor(
    private readonly config: ConfigService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  @Get('dispatch')
  async dispatch(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
  ): Promise<OutboxRunResult> {
    const secret = this.config.getOrThrow<string>('app.jobs.cronSecret');
    if (!authorization || !secretsMatch(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException('Cần thông tin xác thực cron hợp lệ');
    }
    const runId =
      typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : `outbox-${Date.now()}`;
    return this.dispatcher.run(runId);
  }
}
