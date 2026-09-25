import { Module } from '@nestjs/common';
import { TelegramModule } from '../../integrations/telegram/telegram.module';
import { AuditModule } from '../audit/audit.module';
import { JobHealthService } from './job-health/job-health.service';
import {
  PublicSystemParameterController,
  SystemParameterController,
} from './parameters/system-parameter.controller';
import { IntegrationConfigService } from './parameters/integration-config.service';
import { SystemParameterService } from './parameters/system-parameter.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [AuditModule, TelegramModule],
  controllers: [SystemController, SystemParameterController, PublicSystemParameterController],
  providers: [SystemService, SystemParameterService, IntegrationConfigService, JobHealthService],
  exports: [SystemParameterService, IntegrationConfigService, JobHealthService],
})
export class SystemModule {}
