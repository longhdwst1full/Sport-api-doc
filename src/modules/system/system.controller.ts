import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SystemModuleListDto } from './system.dto';
import { SystemService } from './system.service';

@ApiTags('Admin System')
@ApiBearerAuth()
@Controller('admin/system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('modules')
  @RequirePermissions('system.module.view')
  @ApiOperation({
    operationId: 'listSystemModules',
    summary: 'List V1 business modules and models',
  })
  @ApiOkResponse({ type: SystemModuleListDto })
  listSystemModules(): SystemModuleListDto {
    return this.system.listModules();
  }
}
