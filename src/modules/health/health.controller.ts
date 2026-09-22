import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { ConfigReadinessService } from './config-readiness.service';
import { ConfigReadinessDto, HealthResponseDto } from './health.dto';

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: ConfigReadinessService,
  ) {}

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

  /**
   * Cấu hình bắt buộc của từng tích hợp.
   *
   * Tách khỏi `/health` vì `/health` là endpoint công khai cho load balancer, còn danh sách tích
   * hợp đang bật là thông tin hệ thống — gác bằng `system.parameter.view`, cùng quyền với màn
   * tham số nơi người dùng sẽ vào sửa.
   */
  @Get('config')
  @RequirePermissions('system.parameter.view')
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiOperation({
    operationId: 'getConfigReadiness',
    summary: 'Tham số bắt buộc còn thiếu của từng tích hợp (chỉ tên tham số, không có giá trị)',
  })
  @ApiOkResponse({ type: ConfigReadinessDto })
  getConfigReadiness(): Promise<ConfigReadinessDto> {
    return this.readiness.check();
  }
}
