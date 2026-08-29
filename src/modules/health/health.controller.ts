import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { HealthResponseDto } from './health.dto';

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'Service health' })
  @ApiOkResponse({ type: HealthResponseDto })
  async getHealth(): Promise<HealthResponseDto> {
    const databaseStatus = await this.prisma.getConnectionStatus();
    return {
      status: databaseStatus === 'down' ? 'degraded' : 'ok',
      service: 'dctd-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      database: {
        enabled: this.prisma.isEnabled(),
        status: databaseStatus,
      },
    };
  }
}
