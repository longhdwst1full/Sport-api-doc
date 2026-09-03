import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { AuditListDto, AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('Admin Audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('iam.audit.view')
  @ApiOperation({
    operationId: 'listAdminAuditLogs',
    summary: 'List immutable redacted audit logs for a global owner',
  })
  @ApiOkResponse({ type: AuditListDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  list(
    @Query() query: AuditQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AuditListDto> {
    return this.audit.list(query, getAuthPrincipal(request));
  }
}
