import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
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
 * SECURITY: bảo vệ bằng secret dùng chung trong header `x-ghn-webhook-secret`; GHN không ký payload
 * nên không có cách xác thực nào mạnh hơn ở phía họ.
 */
@ApiExcludeController()
@Controller('integrations/ghn')
export class GhnWebhookController {
  constructor(private readonly sync: CarrierStatusSyncService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  receive(
    @Headers('x-ghn-webhook-secret') secret: string | undefined,
    @Body() payload: GhnWebhookPayload,
    @Req() request: Request,
  ): Promise<CarrierStatusSyncResult> {
    this.sync.assertSecret(secret);
    return this.sync.handle(payload, requestId(request));
  }
}
