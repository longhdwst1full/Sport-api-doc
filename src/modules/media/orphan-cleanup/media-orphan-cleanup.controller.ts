import { BadRequestException, Controller, Get, Headers, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { MediaOrphanCleanupService, type MediaOrphanMode, type MediaOrphanReport } from './media-orphan-cleanup.service';

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Endpoint nội bộ, không thuộc OpenAPI. Mặc định DRY_RUN (chỉ báo cáo); `?mode=delete` mới xoá, tối đa
 * 100 ảnh/lượt. SECURITY: bắt buộc Bearer `CRON_SECRET` cho cả dry-run vì báo cáo lộ public id bằng chứng.
 * Chưa đăng ký cron: chạy tay dry-run, duyệt báo cáo, rồi mới cân nhắc lịch cho chế độ delete.
 */
@ApiExcludeController()
@Controller('internal/jobs/media')
export class MediaOrphanCleanupController {
  constructor(
    private readonly config: ConfigService,
    private readonly cleanup: MediaOrphanCleanupService,
  ) {}

  @Get('orphans')
  run(
    @Headers('authorization') authorization: string | undefined,
    @Query('mode') rawMode: string | undefined,
    @Req() request: Request,
  ): Promise<MediaOrphanReport> {
    const secret = this.config.get<string>('app.jobs.cronSecret');
    if (!secret || !authorization || !secretsMatch(authorization, `Bearer ${secret}`)) {
      throw new UnauthorizedException('Valid cron authorization is required');
    }
    const mode: MediaOrphanMode = rawMode === undefined || rawMode === 'dry-run' ? 'DRY_RUN' : rawMode === 'delete' ? 'DELETE' : (() => {
      throw new BadRequestException('mode must be dry-run or delete');
    })();
    const requestId = typeof request.id === 'string' ? request.id : `media-orphans-${randomUUID()}`;
    return this.cleanup.run(mode, requestId);
  }
}
