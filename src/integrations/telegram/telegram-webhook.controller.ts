import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { TelegramUpdateService } from './telegram-update.service';
import type { TelegramUpdate } from './telegram.types';

@ApiExcludeController()
@Controller('integrations/telegram')
export class TelegramWebhookController {
  constructor(private readonly updates: TelegramUpdateService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdate,
  ): Promise<void> {
    if (!this.updates.isWebhookSecretValid(secret)) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
    await this.updates.handle(update);
  }
}
