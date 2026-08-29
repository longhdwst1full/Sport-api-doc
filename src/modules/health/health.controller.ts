import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './health.dto';

@ApiTags('System')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'Service health' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'dctd-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
