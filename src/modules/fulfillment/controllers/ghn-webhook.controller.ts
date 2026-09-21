import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CarrierStatusSyncResult,
  CarrierStatusSyncService,
  GhnWebhookPayload,
} from '../services/carrier-status-sync.service';

function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : (request.header('x-request-id') ?? `ghn-webhook-${Date.now()}`);
}

/**
 * Entrypoint nội bộ cho GHN, không thuộc Admin/Storefront API nên không xuất ra OpenAPI công khai.
 *
 * SECURITY: bảo vệ bằng secret dùng chung. Cổng cấu hình webhook của hãng vận chuyển chỉ nhận
 * một URL và không cho thêm header, nên secret phải đi được qua query string; header vẫn được
 * chấp nhận cho công cụ nào gửi được. Đánh đổi: secret trong URL sẽ nằm trong access log của
 * Vercel, nên nó chỉ là secret dùng riêng cho webhook và phải xoay được độc lập.
 */
@ApiExcludeController()
@Controller('integrations/ghn')
export class GhnWebhookController {
  constructor(private readonly sync: CarrierStatusSyncService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('x-ghn-webhook-secret') headerSecret: string | undefined,
    @Query('secret') querySecret: string | undefined,
    @Body() payload: GhnWebhookPayload,
    @Req() request: Request,
  ): Promise<CarrierStatusSyncResult> {
    await this.sync.assertSecret(headerSecret ?? querySecret);
    return this.sync.handle(payload, requestId(request));
  }
}
