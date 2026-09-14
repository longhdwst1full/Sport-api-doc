import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import {
  PublicSystemParameterController,
  SystemParameterController,
} from './parameters/system-parameter.controller';
import { SystemParameterService } from './parameters/system-parameter.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [AuditModule],
  controllers: [SystemController, SystemParameterController, PublicSystemParameterController],
  providers: [SystemService, SystemParameterService],
  exports: [SystemParameterService],
})
export class SystemModule {}
